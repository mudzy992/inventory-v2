import type { PrismaService } from '../../prisma/prisma.service';
import type { RegistrarScopeService } from '../../common/services/registrar-scope.service';

export const collectCommitteeMemberUserIds = async (
  prisma: PrismaService,
  committeeId: string,
): Promise<string[]> => {
  const members = await prisma.inventoryCommitteeMember.findMany({
    where: { committeeId },
    select: { employeeId: true },
  });
  if (members.length === 0) {
    return [];
  }
  const users = await prisma.user.findMany({
    where: {
      employeeId: { in: members.map((row) => row.employeeId) },
      isActive: true,
    },
    select: { id: true },
  });
  return users.map((row) => row.id);
};

export const collectDisposalCommissionMemberUserIds = async (
  prisma: PrismaService,
  disposalCommissionId: string,
): Promise<string[]> => {
  const members = await prisma.disposalCommissionMember.findMany({
    where: { commissionId: disposalCommissionId },
    select: { employeeId: true },
  });
  if (members.length === 0) {
    return [];
  }
  const users = await prisma.user.findMany({
    where: {
      employeeId: { in: members.map((row) => row.employeeId) },
      isActive: true,
    },
    select: { id: true },
  });
  return users.map((row) => row.id);
};

export const collectInventorySessionStakeholderUserIds = async (
  prisma: PrismaService,
  registrarScope: RegistrarScopeService,
  sessionId: string,
  effectiveCityId: string | null,
): Promise<string[]> => {
  const userIds = new Set<string>();
  const admins = await prisma.user.findMany({
    where: { role: 'admin', isActive: true },
    select: { id: true },
  });
  for (const admin of admins) {
    userIds.add(admin.id);
  }
  const session = await prisma.inventorySession.findUnique({
    where: { id: sessionId },
    select: {
      committees: {
        select: {
          id: true,
          categoryId: true,
        },
      },
    },
  });
  if (!session) {
    return [...userIds];
  }
  for (const committee of session.committees) {
    const memberUsers = await collectCommitteeMemberUserIds(prisma, committee.id);
    for (const id of memberUsers) {
      userIds.add(id);
    }
    if (effectiveCityId) {
      const evidenticarIds = await findEvidenticarUserIds(
        prisma,
        registrarScope,
        effectiveCityId,
        committee.categoryId,
      );
      for (const id of evidenticarIds) {
        userIds.add(id);
      }
    }
  }
  return [...userIds];
};

const findEvidenticarUserIds = async (
  prisma: PrismaService,
  registrarScope: RegistrarScopeService,
  cityId: string,
  categoryId: string,
): Promise<string[]> => {
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
