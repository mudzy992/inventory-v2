import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user.type';
import type { JwtPayload } from '../../../common/types/jwt-payload.type';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
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
    return {
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
  }
}
