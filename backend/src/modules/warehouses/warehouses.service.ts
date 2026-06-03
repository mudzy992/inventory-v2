import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Equipment } from '../../../generated/prisma/client';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { InventoryFreezeService } from '../../common/services/inventory-freeze.service';
import { WarehouseResolutionService } from '../../common/services/warehouse-resolution.service';
import { loadKeeperWarehouseIds } from '../../common/utils/warehouse-keeper-access.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';

@Injectable()
export class WarehousesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryFreeze: InventoryFreezeService,
    private readonly warehouseResolutionService: WarehouseResolutionService,
  ) {}

  async findAll(user: AuthenticatedUser) {
    const warehouses = await this.prisma.warehouse.findMany({
      include: {
        city: { include: { canton: true } },
        keepers: { include: { user: { select: { id: true, username: true } } } },
      },
      orderBy: { name: 'asc' },
    });
    if (user.role === 'skladistar') {
      return warehouses.filter((warehouse) =>
        warehouse.keepers.some((keeper) => keeper.userId === user.id),
      );
    }
    return warehouses;
  }

  async resolveEffective(orgUnitId: string, cityId?: string) {
    const warehouseId = await this.warehouseResolutionService.resolveForOrgUnit(orgUnitId, cityId);
    if (!warehouseId) {
      return { warehouseId: null, warehouse: null };
    }
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: warehouseId },
      include: { city: { include: { canton: true } } },
    });
    return { warehouseId, warehouse };
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const warehouse = await this.getWarehouseOrThrow(id);
    await this.assertCanAccess(user, warehouse.id);
    return warehouse;
  }

  async listReadyForDestruction(user: AuthenticatedUser, warehouseId: string): Promise<Equipment[]> {
    await this.assertCanAccess(user, warehouseId);
    return this.prisma.equipment.findMany({
      where: {
        warehouseId,
        status: 'rashodovano',
        warehouseCondition: 'spremno_za_unistenje',
      },
      orderBy: { inventoryNumber: 'asc' },
    });
  }

  async destroyEquipment(
    user: AuthenticatedUser,
    warehouseId: string,
    equipmentId: string,
  ): Promise<Equipment> {
    await this.assertCanAccess(user, warehouseId);
    if (user.role !== 'admin') {
      await this.assertKeeperCanManageWarehouse(user, warehouseId);
    }
    const equipment = await this.prisma.equipment.findUnique({ where: { id: equipmentId } });
    if (!equipment) {
      throw new NotFoundException('Equipment not found');
    }
    if (equipment.warehouseId !== warehouseId) {
      throw new BadRequestException('Equipment is not in this warehouse');
    }
    if (equipment.status !== 'rashodovano') {
      throw new BadRequestException('Only rashodovano equipment can be destroyed');
    }
    if (equipment.warehouseCondition !== 'spremno_za_unistenje') {
      throw new BadRequestException('Equipment is not marked ready for destruction');
    }
    await this.inventoryFreeze.assertNoEquipmentMutation(equipmentId, user, 'equipment_update');
    const fromCondition = equipment.warehouseCondition;
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.equipment.update({
        where: { id: equipmentId },
        data: { warehouseCondition: 'unisteno' },
      });
      await tx.equipmentEvent.create({
        data: {
          equipmentId,
          warehouseId,
          actorUserId: user.id,
          action: 'unisteno',
          fromCondition,
          toCondition: 'unisteno',
        },
      });
      return updated;
    });
  }

  async create(user: AuthenticatedUser, dto: CreateWarehouseDto) {
    if (user.role !== 'admin') {
      throw new ForbiddenException('Only admin can create warehouses');
    }
    await this.assertCityExists(dto.cityId);
    const warehouse = await this.prisma.warehouse.create({
      data: {
        name: dto.name,
        cityId: dto.cityId,
        orgUnitId: dto.orgUnitId,
        address: dto.address,
        notes: dto.notes,
        isActive: dto.isActive ?? true,
      },
    });
    if (dto.keeperUserIds?.length) {
      await this.replaceKeepers(warehouse.id, dto.keeperUserIds);
    }
    return this.getWarehouseOrThrow(warehouse.id);
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateWarehouseDto) {
    if (user.role !== 'admin') {
      throw new ForbiddenException('Only admin can update warehouses');
    }
    await this.getWarehouseOrThrow(id);
    if (dto.cityId) {
      await this.assertCityExists(dto.cityId);
    }
    await this.prisma.warehouse.update({
      where: { id },
      data: {
        name: dto.name,
        cityId: dto.cityId,
        orgUnitId: dto.orgUnitId,
        address: dto.address,
        notes: dto.notes,
        isActive: dto.isActive,
      },
    });
    if (dto.keeperUserIds) {
      await this.replaceKeepers(id, dto.keeperUserIds);
    }
    return this.getWarehouseOrThrow(id);
  }

  async assertKeeperCanManageWarehouse(user: AuthenticatedUser, warehouseId: string): Promise<void> {
    if (user.role === 'admin') {
      return;
    }
    if (user.role !== 'skladistar') {
      throw new ForbiddenException('Not a warehouse keeper');
    }
    const assignment = await this.prisma.warehouseKeeper.findUnique({
      where: { warehouseId_userId: { warehouseId, userId: user.id } },
    });
    if (!assignment) {
      throw new ForbiddenException('Warehouse outside your assignment');
    }
  }

  async getKeeperWarehouseIds(userId: string): Promise<Set<string>> {
    return loadKeeperWarehouseIds(this.prisma, userId);
  }

  private async replaceKeepers(warehouseId: string, userIds: string[]): Promise<void> {
    const uniqueIds = [...new Set(userIds)];
    for (const userId of uniqueIds) {
      const keeper = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!keeper || keeper.role !== 'skladistar') {
        throw new BadRequestException('Keeper must be an active skladistar user');
      }
    }
    await this.prisma.warehouseKeeper.deleteMany({ where: { warehouseId } });
    if (uniqueIds.length > 0) {
      await this.prisma.warehouseKeeper.createMany({
        data: uniqueIds.map((userId) => ({ warehouseId, userId })),
      });
    }
  }

  private async getWarehouseOrThrow(id: string) {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id },
      include: {
        city: { include: { canton: true } },
        keepers: { include: { user: { select: { id: true, username: true } } } },
      },
    });
    if (!warehouse) {
      throw new NotFoundException('Warehouse not found');
    }
    return warehouse;
  }

  private async assertCanAccess(user: AuthenticatedUser, warehouseId: string): Promise<void> {
    if (user.role === 'admin' || user.role === 'evidenticar') {
      return;
    }
    await this.assertKeeperCanManageWarehouse(user, warehouseId);
  }

  private async assertCityExists(cityId: string): Promise<void> {
    const city = await this.prisma.city.findUnique({ where: { id: cityId } });
    if (!city) {
      throw new BadRequestException('City not found');
    }
  }
}
