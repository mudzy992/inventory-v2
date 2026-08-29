import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user.type';
import type { JwtPayload } from '../../../common/types/jwt-payload.type';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisService } from '../../../redis/redis.service';

// Svaki autentifikovani HTTP/WebSocket zahtjev prolazi kroz validate() —
// bez keša, to je 1 DB round-trip sa 4 relacije UČITANO PO ZAHTJEVU.
// TTL je namjerno kratak (ne minute): rola/pristupna prava korisnika se
// rijetko mijenjaju, ali kad se promijene (npr. admin oduzme registrar
// pristup), efekat treba biti gotovo trenutan, ne "na sljedećih 15 minuta".
// 30s je kompromis — u praksi eliminiše ogromnu većinu ponovljenih DB
// upita (isti korisnik šalje desetine zahtjeva u kratkom vremenskom
// prozoru dok koristi aplikaciju), a staleness prozor ostaje neprimjetan.
const USER_CACHE_TTL_SECONDS = 30;

export const authUserCacheKey = (userId: string): string => `auth:user:${userId}`;

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
    const cached = await this.redisService.getJson<AuthenticatedUser>(
      authUserCacheKey(payload.sub),
    );
    if (cached) {
      return cached;
    }

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

    // Ne blokira request na Redis write-u da bi se izbjegao dodatni
    // latency ako Redis usporava; setJson već interno guta greške.
    void this.redisService.setJson(
      authUserCacheKey(payload.sub),
      authenticatedUser,
      USER_CACHE_TTL_SECONDS,
    );

    return authenticatedUser;
  }
}
