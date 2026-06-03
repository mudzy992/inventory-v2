import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { UserRole } from '../../../generated/prisma/client';
import type { RegistrarScopeAssignment } from '../../common/types/registrar-scope.type';
import type { PrismaService } from '../../prisma/prisma.service';

interface ValidateUserAccessInput {
  role: UserRole;
  employeeId?: string | null;
  registrarScopes?: RegistrarScopeAssignment[];
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

export const assertUserAccessRules = async (
  prisma: PrismaService,
  input: ValidateUserAccessInput,
): Promise<void> => {
  if (
    (input.role === 'user' || input.role === 'evidenticar' || input.role === 'skladistar') &&
    !input.employeeId
  ) {
    throw new BadRequestException('Uloga zahtijeva povezanog radnika');
  }
  if (input.role === 'evidenticar' && (input.registrarScopes?.length ?? 0) === 0) {
    throw new BadRequestException(
      'Evidentičar mora imati barem jednu dodjelu (skladište + kategorija)',
    );
  }
  if (input.role !== 'evidenticar' && (input.registrarScopes?.length ?? 0) > 0) {
    throw new BadRequestException('Dodjele su dozvoljene samo za evidentičara');
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
  }
};
