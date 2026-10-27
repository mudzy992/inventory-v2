import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user.type';
import type { JwtPayload } from '../../../common/types/jwt-payload.type';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisService } from '../../../redis/redis.service';
import {
  USER_AUTH_CACHE_TTL_SECONDS,
  authRevocationKey,
  authUserCacheKey,
  buildCachedAuthenticatedUser,
  isFreshAuthCache,
  parseAuthRevocationMarker,
  toAuthenticatedUser,
  type AuthRevocationMarker,
  type CachedAuthenticatedUser,
} from '../auth-cache.util';

/**
 * Svaki autentifikovani HTTP/WebSocket zahtjev prolazi kroz validate(). Bez
 * keša to je 1 DB round-trip sa 4 relacije; TTL je namjerno kratak (30s).
 *
 * Keš sam po sebi nije dovoljan kao sigurnosna granica: deaktivacija ili
 * promjena prava mora odmah poništiti keš. Zato uz svaki keš unos ide
 * `cachedAt` (vrijeme PRIJE DB čitanja), a svaka izmjena korisnika upiše
 * `auth:revoked:<id>` marker. `isFreshAuthCache()` odbija unos koji je stariji
 * od markera, pa ni vatrometni `setJson` iz zahtjeva koji je čitao bazu prije
 * deaktivacije ne može oživjeti staru ulogu/identitet. Marker živi dvostruko
 * duže od keš unosa. Vidi auth-cache.util.ts i auth-session-revocation.util.ts.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const [cached, rawMarker] = await Promise.all([
      this.redisService.getJson<CachedAuthenticatedUser>(authUserCacheKey(payload.sub)),
      this.redisService.getJson<AuthRevocationMarker>(authRevocationKey(payload.sub)),
    ]);
    const marker = parseAuthRevocationMarker(rawMarker);
    // A marker key that exists but cannot be parsed is a Redis/format anomaly:
    // fail closed and re-read the DB instead of trusting the cached identity.
    const markerMalformed = rawMarker !== undefined && marker === null;
    if (!markerMalformed && isFreshAuthCache(cached, marker)) {
      return toAuthenticatedUser(cached);
    }

    // Measured BEFORE the DB read: a revocation that commits while this query
    // is in flight has revokedAt >= readStartedAt, so its marker wins even if
    // the fire-and-forget setJson below lands after the revocation.
    const readStartedAt = Date.now();
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        registrarAssignments: true,
        inventoryCoordinatorAssignments: true,
        moderatorOrgAssignments: true,
        moderatorWarehouseAssignments: true,
      },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid or inactive user');
    }
    const authenticatedUser: AuthenticatedUser = {
      id: user.id,
      username: user.username,
      role: user.role,
      employeeId: user.employeeId,
      registrarScopes: user.registrarAssignments.map((row) => ({
        warehouseId: row.warehouseId,
        categoryId: row.categoryId,
        orgUnitId: row.orgUnitId,
      })),
      coordinatorAssignments: user.inventoryCoordinatorAssignments.map((row) => ({
        warehouseId: row.warehouseId,
        orgUnitId: row.orgUnitId,
      })),
      moderatorOrgRoots: user.moderatorOrgAssignments.map((row) => row.orgUnitId),
      moderatorWarehouseIds: user.moderatorWarehouseAssignments.map((row) => row.warehouseId),
    };

    // setJson already swallows Redis failures; a failed write only costs one
    // extra DB read on the next request, it never resurrects a stale identity
    // because cachedAt predates any concurrent revocation.
    void this.redisService.setJson(
      authUserCacheKey(payload.sub),
      buildCachedAuthenticatedUser(authenticatedUser, readStartedAt),
      USER_AUTH_CACHE_TTL_SECONDS,
    );

    return authenticatedUser;
  }
}
