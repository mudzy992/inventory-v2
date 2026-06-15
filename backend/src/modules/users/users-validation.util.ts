import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { UserRole } from '../../../generated/prisma/client';
import type { CoordinatorScopeAssignment } from '../../common/types/coordinator-scope.type';
import type { RegistrarScopeAssignment } from '../../common/types/registrar-scope.type';
import type { PrismaService } from '../../prisma/prisma.service';
import { assertRegistrarScopesValid } from './registrar-assignment-validation.util';

interface ValidateUserAccessInput {
  role: UserRole;
  employeeId?: string | null;
  registrarScopes?: RegistrarScopeAssignment[];
  coordinatorAssignments?: CoordinatorScopeAssignment[];
  excludeUserId?: string;
}

export const normalizeRegistrarScopes = (
  role: UserRole,
  registrarScopes?: RegistrarScopeAssignment[],
): RegistrarScopeAssignment[] => {
  if (role !== 'evidenticar') {
    return [];
  }
  return registrarScopes ?? [];
};

export const normalizeCoordinatorAssignments = (
  role: UserRole,
  coordinatorAssignments?: CoordinatorScopeAssignment[],
): CoordinatorScopeAssignment[] => {
  if (role !== 'popis_koordinator') {
    return [];
  }
  return coordinatorAssignments ?? [];
};

export const assertUserAccessRules = async (
  prisma: PrismaService,
  input: ValidateUserAccessInput,
): Promise<void> => {
  if (
    (input.role === 'user' ||
      input.role === 'evidenticar' ||
      input.role === 'skladistar' ||
      input.role === 'popis_koordinator') &&
    !input.employeeId
  ) {
    throw new BadRequestException('Uloga zahtijeva povezanog radnika');
  }
  if (input.role === 'evidenticar' && (input.registrarScopes?.length ?? 0) === 0) {
    throw new BadRequestException(
      'Evidentičar mora imati barem jednu dodjelu (skladište + kategorija)',
    );
  }
  if (input.role === 'popis_koordinator' && (input.coordinatorAssignments?.length ?? 0) === 0) {
    throw new BadRequestException('Koordinator popisa mora imati barem jedno dodijeljeno skladište');
  }
  if (input.role !== 'evidenticar' && (input.registrarScopes?.length ?? 0) > 0) {
    throw new BadRequestException('Dodjele evidentičara su dozvoljene samo za evidentičara');
  }
  if (input.role !== 'popis_koordinator' && (input.coordinatorAssignments?.length ?? 0) > 0) {
    throw new BadRequestException('Dodjele koordinatora su dozvoljene samo za popis_koordinator');
  }
  if (input.employeeId) {
    const employee = await prisma.employee.findUnique({ where: { id: input.employeeId } });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
    const existingUser = await prisma.user.findFirst({
      where: {
        employeeId: input.employeeId,
        ...(input.excludeUserId ? { NOT: { id: input.excludeUserId } } : {}),
      },
    });
    if (existingUser) {
      throw new ConflictException('Radnik već ima korisnički račun');
    }
  }
  const scopes = input.registrarScopes ?? [];
  if (scopes.length > 0) {
    const warehouseIds = [...new Set(scopes.map((row) => row.warehouseId))];
    const categoryIds = [...new Set(scopes.map((row) => row.categoryId))];
    const orgUnitIds = [
      ...new Set(scopes.map((row) => row.orgUnitId).filter((id): id is string => Boolean(id))),
    ];
    const warehouseCount = await prisma.warehouse.count({ where: { id: { in: warehouseIds } } });
    const categoryCount = await prisma.category.count({ where: { id: { in: categoryIds } } });
    const orgUnitCount =
      orgUnitIds.length > 0
        ? await prisma.orgUnit.count({ where: { id: { in: orgUnitIds } } })
        : orgUnitIds.length;
    if (
      warehouseCount !== warehouseIds.length ||
      categoryCount !== categoryIds.length ||
      orgUnitCount !== orgUnitIds.length
    ) {
      throw new BadRequestException('Jedno ili više skladišta/kategorija/org jedinica ne postoji');
    }
    await assertRegistrarScopesValid(prisma, scopes);
  }
  const coordinatorScopes = input.coordinatorAssignments ?? [];
  if (coordinatorScopes.length > 0) {
    const warehouseIds = [...new Set(coordinatorScopes.map((row) => row.warehouseId))];
    const orgUnitIds = [
      ...new Set(coordinatorScopes.map((row) => row.orgUnitId).filter((id): id is string => Boolean(id))),
    ];
    const warehouseCount = await prisma.warehouse.count({ where: { id: { in: warehouseIds } } });
    const orgUnitCount =
      orgUnitIds.length > 0
        ? await prisma.orgUnit.count({ where: { id: { in: orgUnitIds } } })
        : orgUnitIds.length;
    if (warehouseCount !== warehouseIds.length || orgUnitCount !== orgUnitIds.length) {
      throw new BadRequestException('Jedno ili više skladišta/org jedinica ne postoji');
    }
  }
};
