import type { Equipment } from '../../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../types/authenticated-user.type';

export const loadKeeperWarehouseIds = async (
  prisma: PrismaService,
  userId: string,
): Promise<Set<string>> => {
  const rows = await prisma.warehouseKeeper.findMany({
    where: { userId },
    select: { warehouseId: true },
  });
  return new Set(rows.map((row) => row.warehouseId));
};

export const canKeeperReadEquipment = (
  equipment: Equipment,
  keeperWarehouseIds: Set<string>,
): boolean => {
  if (!equipment.warehouseId || !keeperWarehouseIds.has(equipment.warehouseId)) {
    return false;
  }
  if (equipment.status === 'skladiste') {
    return true;
  }
  if (equipment.status === 'rashodovano') {
    return (
      equipment.warehouseCondition === 'spremno_za_unistenje' ||
      equipment.warehouseCondition === 'unisteno'
    );
  }
  return false;
};

export const canKeeperWriteEquipment = (
  equipment: Equipment,
  keeperWarehouseIds: Set<string>,
): boolean => {
  if (!canKeeperReadEquipment(equipment, keeperWarehouseIds)) {
    return false;
  }
  return equipment.status === 'skladiste';
};

export const resolveKeeperWarehouseIds = async (
  prisma: PrismaService,
  user: AuthenticatedUser,
): Promise<Set<string> | null> => {
  if (user.role !== 'skladistar') {
    return null;
  }
  return loadKeeperWarehouseIds(prisma, user.id);
};
