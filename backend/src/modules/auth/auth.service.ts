import { createHash, randomBytes } from 'node:crypto';
import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import type { JwtPayload } from '../../common/types/jwt-payload.type';
import { PrismaService } from '../../prisma/prisma.service';
import { claimRefreshTokenForRotation } from './refresh-token-rotation.util';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthUserResponse {
  id: string;
  username: string;
  role: string;
  employeeId: string | null;
  registrarScopes: { warehouseId: string; categoryId: string; orgUnitId?: string | null }[];
  coordinatorAssignments: { warehouseId: string; orgUnitId?: string | null }[];
  moderatorOrgAssignments: { orgUnitId: string }[];
  moderatorWarehouseAssignments: { warehouseId: string }[];
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(username: string, password: string): Promise<{ tokens: AuthTokens; user: AuthUserResponse }> {
    const user = await this.prisma.user.findUnique({
      where: { username },
      include: {
        registrarAssignments: true,
        inventoryCoordinatorAssignments: true,
        moderatorOrgAssignments: true,
        moderatorWarehouseAssignments: true,
      },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    const tokens = await this.issueTokens(user.id, user.username, user.role);
    return {
      tokens,
      user: this.mapUser(
        user.id,
        user.username,
        user.role,
        user.employeeId,
        user.registrarAssignments,
        user.inventoryCoordinatorAssignments,
        user.moderatorOrgAssignments,
        user.moderatorWarehouseAssignments,
      ),
    };
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: { include: { registrarAssignments: true } } },
    });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date() || !stored.user.isActive) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      // Re-check inside the transaction: the outer `stored.user.isActive` was
      // read before this transaction started, so a deactivation committed in
      // between must not still produce a fresh access/refresh token pair.
      const active = await tx.user.findUnique({
        where: { id: stored.user.id },
        select: { isActive: true },
      });
      if (!active?.isActive) {
        throw new UnauthorizedException('Invalid refresh token');
      }
      // Conditional claim also fails if the deactivation already revoked all
      // of this user's refresh tokens (revokedAt is no longer null).
      const claimed = await claimRefreshTokenForRotation(tx, stored.id, now);
      if (!claimed) {
        throw new UnauthorizedException('Invalid refresh token');
      }
      return this.issueTokens(stored.user.id, stored.user.username, stored.user.role, tx);
    });
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  getProfile(user: AuthenticatedUser): AuthUserResponse {
    return this.mapUser(
      user.id,
      user.username,
      user.role,
      user.employeeId,
      user.registrarScopes.map((row) => ({
        warehouseId: row.warehouseId,
        categoryId: row.categoryId,
        orgUnitId: row.orgUnitId ?? null,
      })),
      user.coordinatorAssignments.map((row) => ({
        warehouseId: row.warehouseId,
        orgUnitId: row.orgUnitId ?? null,
      })),
      user.moderatorOrgRoots.map((orgUnitId) => ({ orgUnitId })),
      user.moderatorWarehouseIds.map((warehouseId) => ({ warehouseId })),
    );
  }

  private async issueTokens(
    userId: string,
    username: string,
    role: JwtPayload['role'],
    refreshTokenStore: Pick<PrismaService, 'refreshToken'> = this.prisma,
  ): Promise<AuthTokens> {
    const payload: JwtPayload = { sub: userId, username, role };
    const accessToken = await this.jwtService.signAsync(payload);
    const refreshToken = randomBytes(48).toString('hex');
    const refreshTtl = this.configService.get<string>('JWT_REFRESH_TTL', '7d');
    const expiresAt = this.resolveExpiry(refreshTtl);
    await refreshTokenStore.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(refreshToken),
        expiresAt,
      },
    });
    return { accessToken, refreshToken };
  }

  private mapUser(
    id: string,
    username: string,
    role: string,
    employeeId: string | null,
    registrarScopes: {
      warehouseId: string;
      categoryId: string;
      orgUnitId: string | null;
    }[],
    coordinatorAssignments: {
      warehouseId: string;
      orgUnitId: string | null;
    }[],
    moderatorOrgAssignments: { orgUnitId: string }[],
    moderatorWarehouseAssignments: { warehouseId: string }[],
  ): AuthUserResponse {
    return {
      id,
      username,
      role,
      employeeId,
      registrarScopes: registrarScopes.map((row) => ({
        warehouseId: row.warehouseId,
        categoryId: row.categoryId,
        orgUnitId: row.orgUnitId,
      })),
      coordinatorAssignments: coordinatorAssignments.map((row) => ({
        warehouseId: row.warehouseId,
        orgUnitId: row.orgUnitId,
      })),
      moderatorOrgAssignments: moderatorOrgAssignments.map((row) => ({
        orgUnitId: row.orgUnitId,
      })),
      moderatorWarehouseAssignments: moderatorWarehouseAssignments.map((row) => ({
        warehouseId: row.warehouseId,
      })),
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private resolveExpiry(ttl: string): Date {
    const match = /^(\d+)([smhd])$/.exec(ttl);
    if (!match) {
      return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    }
    const amount = Number(match[1]);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };
    return new Date(Date.now() + amount * (multipliers[unit] ?? multipliers.d));
  }
}
