import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { User, UserRole } from '../../../generated/prisma/client';
import type { RegistrarScopeAssignment } from '../../common/types/registrar-scope.type';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { assertUserAccessRules, normalizeRegistrarScopes } from './users-validation.util';

export interface UserListItem {
  id: string;
  username: string;
  role: UserRole;
  employeeId: string | null;
  isActive: boolean;
  registrarScopes: RegistrarScopeAssignment[];
  lastLoginAt: string | null;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<UserListItem[]> {
    const users = await this.prisma.user.findMany({
      include: { registrarAssignments: true },
      orderBy: { username: 'asc' },
    });
    return users.map((user) => this.toListItem(user));
  }

  async findOne(id: string): Promise<UserListItem> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { registrarAssignments: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.toListItem(user);
  }

  async create(dto: CreateUserDto): Promise<UserListItem> {
    const existing = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (existing) {
      throw new ConflictException('Username already exists');
    }
    const registrarScopes = normalizeRegistrarScopes(dto.role, dto.registrarScopes);
    await assertUserAccessRules(this.prisma, {
      role: dto.role,
      employeeId: dto.employeeId,
      registrarScopes,
    });
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        username: dto.username.trim(),
        passwordHash,
        role: dto.role,
        employeeId: dto.employeeId,
        isActive: dto.isActive ?? true,
        registrarAssignments:
          registrarScopes.length > 0
            ? {
                create: registrarScopes.map((scope) => ({
                  warehouseId: scope.warehouseId,
                  categoryId: scope.categoryId,
                  orgUnitId: scope.orgUnitId ?? null,
                })),
              }
            : undefined,
      },
      include: { registrarAssignments: true },
    });
    return this.toListItem(user);
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserListItem> {
    const current = await this.prisma.user.findUnique({
      where: { id },
      include: { registrarAssignments: true },
    });
    if (!current) {
      throw new NotFoundException('User not found');
    }
    const role = dto.role ?? current.role;
    const employeeId = dto.employeeId !== undefined ? dto.employeeId : current.employeeId;
    const registrarScopes =
      dto.registrarScopes !== undefined
        ? normalizeRegistrarScopes(role, dto.registrarScopes)
        : normalizeRegistrarScopes(
            role,
            current.registrarAssignments.map((row) => ({
              warehouseId: row.warehouseId,
              categoryId: row.categoryId,
              orgUnitId: row.orgUnitId,
            })),
          );
    await assertUserAccessRules(this.prisma, {
      role,
      employeeId,
      registrarScopes,
      excludeUserId: id,
    });
    const passwordHash = dto.password ? await bcrypt.hash(dto.password, 10) : undefined;
    await this.prisma.registrarAssignment.deleteMany({ where: { userId: id } });
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        role: dto.role,
        employeeId: dto.employeeId,
        isActive: dto.isActive,
        registrarAssignments:
          registrarScopes.length > 0
            ? {
                create: registrarScopes.map((scope) => ({
                  warehouseId: scope.warehouseId,
                  categoryId: scope.categoryId,
                  orgUnitId: scope.orgUnitId ?? null,
                })),
              }
            : undefined,
      },
      include: { registrarAssignments: true },
    });
    return this.toListItem(user);
  }

  private toListItem(
    user: User & {
      registrarAssignments: {
        warehouseId: string;
        categoryId: string;
        orgUnitId: string | null;
      }[];
    },
  ): UserListItem {
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      employeeId: user.employeeId,
      isActive: user.isActive,
      registrarScopes: user.registrarAssignments.map((row) => ({
        warehouseId: row.warehouseId,
        categoryId: row.categoryId,
        orgUnitId: row.orgUnitId,
      })),
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    };
  }
}
