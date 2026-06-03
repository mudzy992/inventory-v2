import type { PrismaService } from '../../prisma/prisma.service';
import type { RegistrarScopeService } from '../../common/services/registrar-scope.service';

interface TransferRecipientContext {
  signerId: string;
  fromPersonId: string | null;
  toPersonId: string | null;
  equipmentCategoryId: string;
  equipmentCityId: string | null;
}

export const collectTransferPendingRecipients = async (
  prisma: PrismaService,
  registrarScope: RegistrarScopeService,
  context: TransferRecipientContext,
): Promise<string[]> => {
  const userIds = new Set<string>();
  const admins = await prisma.user.findMany({
    where: { role: 'admin', isActive: true },
    select: { id: true },
  });
  for (const admin of admins) {
    userIds.add(admin.id);
  }
  const signerUser = await prisma.user.findFirst({
    where: { employeeId: context.signerId, isActive: true },
    select: { id: true },
  });
  if (signerUser) {
    userIds.add(signerUser.id);
  }
  const evidenticarIds = await findEvidenticarUserIds(
    prisma,
    registrarScope,
    context.equipmentCityId,
    context.equipmentCategoryId,
  );
  for (const id of evidenticarIds) {
    userIds.add(id);
  }
  return [...userIds];
};

export const collectTransferSignedRecipients = async (
  prisma: PrismaService,
  registrarScope: RegistrarScopeService,
  context: TransferRecipientContext,
): Promise<string[]> => {
  const userIds = new Set<string>();
  const admins = await prisma.user.findMany({
    where: { role: 'admin', isActive: true },
    select: { id: true },
  });
  for (const admin of admins) {
    userIds.add(admin.id);
  }
  const signerUser = await prisma.user.findFirst({
    where: { employeeId: context.signerId, isActive: true },
    select: { id: true },
  });
  if (signerUser) {
    userIds.add(signerUser.id);
  }
  const evidenticarIds = await findEvidenticarUserIds(
    prisma,
    registrarScope,
    context.equipmentCityId,
    context.equipmentCategoryId,
  );
  for (const id of evidenticarIds) {
    userIds.add(id);
  }
  if (context.toPersonId) {
    const toUser = await prisma.user.findFirst({
      where: { employeeId: context.toPersonId, isActive: true },
      select: { id: true },
    });
    if (toUser) {
      userIds.add(toUser.id);
    }
  }
  return [...userIds];
};

const findEvidenticarUserIds = async (
  prisma: PrismaService,
  registrarScope: RegistrarScopeService,
  cityId: string | null,
  categoryId: string,
): Promise<string[]> => {
  if (!cityId) {
    return [];
  }
  const evidenticars = await prisma.user.findMany({
    where: { role: 'evidenticar', isActive: true },
    include: { registrarAssignments: true },
  });
  const matched = new Set<string>();
  for (const user of evidenticars) {
    const scopes = user.registrarAssignments.map((row) => ({
      warehouseId: row.warehouseId,
      categoryId: row.categoryId,
      orgUnitId: row.orgUnitId,
    }));
    const { cityIds, categoryIds } = await registrarScope.resolveExpandedScopes(scopes);
    if (cityIds.has(cityId) && categoryIds.has(categoryId)) {
      matched.add(user.id);
    }
  }
  return [...matched];
};
