import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { RegistrarScopeService } from '../../../common/services/registrar-scope.service';
import type { WarehouseResolutionService } from '../../../common/services/warehouse-resolution.service';
import type { NotificationsService } from '../../notifications/notifications.service';
import { EMPLOYEE_MESSAGES } from '../../../common/utils/employee-messages.util';
import {
  findAdminUserIds,
  findRegistrarUserIds,
} from '../../employee-relocation/utils/find-registrar-user-ids.util';

export interface HeldEquipmentRow {
  id: string;
  categoryId: string;
  inventoryNumber: string | null;
  category: { name: string };
}

export interface EmployeeDeactivationDeps {
  prisma: PrismaService;
  registrarScope: RegistrarScopeService;
  warehouseResolution: WarehouseResolutionService;
  notifications: NotificationsService;
}

export const findHeldEquipmentForEmployee = async (
  prisma: PrismaService,
  employeeId: string,
): Promise<HeldEquipmentRow[]> =>
  prisma.equipment.findMany({
    where: { currentHolderId: employeeId, status: 'zaduzeno' },
    select: {
      id: true,
      categoryId: true,
      inventoryNumber: true,
      category: { select: { name: true } },
    },
  });

export const resolveDeactivationNotificationRecipients = async (
  deps: Pick<EmployeeDeactivationDeps, 'prisma' | 'registrarScope' | 'warehouseResolution'>,
  employeeId: string,
  heldEquipment: HeldEquipmentRow[],
): Promise<string[]> => {
  const warehouseId = await deps.warehouseResolution.resolveForEmployee(employeeId);
  if (!warehouseId) {
    return findAdminUserIds(deps.prisma);
  }
  const registrarUserIds = new Set<string>();
  const categoryIds = [...new Set(heldEquipment.map((row) => row.categoryId))];
  for (const categoryId of categoryIds) {
    const userIds = await findRegistrarUserIds(
      deps.prisma,
      deps.registrarScope,
      warehouseId,
      categoryId,
    );
    for (const userId of userIds) {
      registrarUserIds.add(userId);
    }
  }
  if (registrarUserIds.size > 0) {
    return [...registrarUserIds];
  }
  return findAdminUserIds(deps.prisma);
};

export const assertEmployeeCanDeactivateOrNotify = async (
  deps: EmployeeDeactivationDeps,
  employeeId: string,
  employeeName: string,
): Promise<void> => {
  const heldEquipment = await findHeldEquipmentForEmployee(deps.prisma, employeeId);
  if (heldEquipment.length === 0) {
    return;
  }
  const recipientUserIds = await resolveDeactivationNotificationRecipients(
    deps,
    employeeId,
    heldEquipment,
  );
  if (recipientUserIds.length > 0) {
    await deps.notifications.notifyEmployeeDeactivationEquipmentRequired({
      employeeId,
      employeeName,
      heldCount: heldEquipment.length,
      recipientUserIds,
    });
  }
  throw new BadRequestException(EMPLOYEE_MESSAGES.deactivateHasHeldEquipment);
};
