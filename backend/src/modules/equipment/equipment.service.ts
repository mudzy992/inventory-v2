import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Equipment, Prisma } from '../../../generated/prisma/client';
import { InventoryFreezeService } from '../../common/services/inventory-freeze.service';
import { RegistrarScopeService } from '../../common/services/registrar-scope.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { validateSpecifications } from '../../common/utils/category-fields.util';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { WarehousesService } from '../warehouses/warehouses.service';
import { CategoriesService } from '../categories/categories.service';
import { loadKeeperWarehouseIds } from '../../common/utils/warehouse-keeper-access.util';
import {
  assertCanReadEquipment,
  assertCanWriteEquipment,
  canReadEquipment,
} from './equipment-access.util';
import { CreateEquipmentDto } from './dto/create-equipment.dto';
import { ListEquipmentQueryDto } from './dto/list-equipment-query.dto';
import { UpdateEquipmentDto } from './dto/update-equipment.dto';

@Injectable()
export class EquipmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categoriesService: CategoriesService,
    private readonly registrarScope: RegistrarScopeService,
    private readonly configService: ConfigService,
    private readonly warehousesService: WarehousesService,
    private readonly inventoryFreeze: InventoryFreezeService,
    private readonly settingsService: SettingsService,
  ) {}

  async findAll(user: AuthenticatedUser, query: ListEquipmentQueryDto): Promise<Equipment[]> {
    const items = await this.prisma.equipment.findMany({
      where: await this.buildListWhere(user, query),
      include: { currentHolder: true },
      orderBy: { inventoryNumber: 'asc' },
    });
    const filtered: Equipment[] = [];
    for (const item of items) {
      if (await canReadEquipment(user, item, item.currentHolder, this.registrarScope, this.prisma)) {
        filtered.push(item);
      }
    }
    return filtered;
  }

  async findOne(user: AuthenticatedUser, id: string): Promise<Equipment> {
    const equipment = await this.prisma.equipment.findUnique({
      where: { id },
      include: { currentHolder: true },
    });
    if (!equipment) {
      throw new NotFoundException('Equipment not found');
    }
    await assertCanReadEquipment(user, equipment, equipment.currentHolder, this.registrarScope, this.prisma);
    return equipment;
  }

  async create(_user: AuthenticatedUser, _dto: CreateEquipmentDto): Promise<Equipment> {
    await this.settingsService.assertFeatureEnabled('features.equipment');
    throw new ForbiddenException(
      'Oprema se kreira izdavanjem iz skladišnog lota (prijem robe na skladištu, zatim issue)',
    );
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateEquipmentDto): Promise<Equipment> {
    await this.settingsService.assertFeatureEnabled('features.equipment');
    const existing = await this.prisma.equipment.findUnique({
      where: { id },
      include: { currentHolder: true },
    });
    if (!existing) {
      throw new NotFoundException('Equipment not found');
    }
    await assertCanReadEquipment(user, existing, existing.currentHolder, this.registrarScope, this.prisma);
    await assertCanWriteEquipment(user, existing, existing.currentHolder, this.registrarScope, this.prisma);
    const mutatesState =
      dto.status !== undefined ||
      dto.currentHolderId !== undefined ||
      dto.warehouseId !== undefined ||
      dto.warehouseCondition !== undefined;
    if (mutatesState) {
      await this.inventoryFreeze.assertNoEquipmentMutation(existing.id, user, 'equipment_update');
    }
    const categoryId = dto.categoryId ?? existing.categoryId;
    const category = await this.categoriesService.assertLeafCategory(categoryId);
    const specifications = (dto.specifications ?? existing.specifications) as Record<string, string>;
    const { fields, optionalFields } = this.categoriesService.getFieldDefinitions(category);
    validateSpecifications(specifications, fields, optionalFields);
    if (dto.currentHolderId) {
      const holder = await this.getEmployeeOrThrow(dto.currentHolderId);
      const draft = { ...existing, categoryId, currentHolderId: dto.currentHolderId };
      await this.registrarScope.assertCanAccessEquipment(user, draft, holder);
    }
    try {
      return await this.prisma.equipment.update({
        where: { id },
        data: {
          categoryId: dto.categoryId,
          inventoryNumber: dto.inventoryNumber,
          specifications,
          status: dto.status,
          contractNumber: dto.contractNumber,
          entryDate: dto.entryDate ? new Date(dto.entryDate) : undefined,
          currentHolderId: dto.currentHolderId,
          warehouseId: dto.warehouseId,
          warehouseCondition: dto.warehouseCondition,
          notes: dto.notes,
        },
      });
    } catch {
      throw new ConflictException('Inventory number already exists');
    }
  }

  async remove(user: AuthenticatedUser, id: string): Promise<void> {
    await this.settingsService.assertFeatureEnabled('features.equipment');
    const existing = await this.prisma.equipment.findUnique({
      where: { id },
      include: { currentHolder: true },
    });
    if (!existing) {
      throw new NotFoundException('Equipment not found');
    }
    await assertCanReadEquipment(user, existing, existing.currentHolder, this.registrarScope, this.prisma);
    await assertCanWriteEquipment(user, existing, existing.currentHolder, this.registrarScope, this.prisma);
    if (user.role !== 'admin') {
      throw new ForbiddenException('Only admin can delete equipment');
    }
    await this.prisma.equipment.delete({ where: { id } });
  }

  async checkInventoryNumberAvailable(value: string): Promise<{ available: boolean }> {
    await this.settingsService.assertFeatureEnabled('features.equipment');
    const trimmed = value.trim();
    if (!trimmed) {
      return { available: false };
    }
    const existing = await this.prisma.equipment.findUnique({
      where: { inventoryNumber: trimmed },
      select: { id: true },
    });
    return { available: !existing };
  }

  async checkUniqueSpecificationValue(
    categoryId: string,
    fieldId: string,
    value: string,
  ): Promise<{ available: boolean }> {
    await this.settingsService.assertFeatureEnabled('features.equipment');
    const trimmed = value.trim();
    if (!trimmed) {
      return { available: false };
    }
    const category = await this.categoriesService.assertLeafCategory(categoryId);
    const { fields, optionalFields } = this.categoriesService.getFieldDefinitions(category);
    const uniqueFields = [...fields, ...optionalFields].filter((field) => field.unique);
    const field = uniqueFields.find((row) => row.id === fieldId);
    if (!field) {
      throw new BadRequestException('Invalid unique specification field');
    }
    const rows = await this.prisma.equipment.findMany({
      where: { categoryId },
      select: { specifications: true },
    });
    const taken = rows.some((row) => {
      const specifications = row.specifications as Record<string, string>;
      return specifications[fieldId]?.trim() === trimmed;
    });
    return { available: !taken };
  }

  async getQrPayload(user: AuthenticatedUser, id: string): Promise<{
    id: string;
    inventoryNumber: string;
    url: string;
  }> {
    const equipment = await this.findOne(user, id);
    const appUrl = this.configService.get<string>('APP_URL', 'http://localhost:8080');
    return {
      id: equipment.id,
      inventoryNumber: equipment.inventoryNumber,
      url: `${appUrl.replace(/\/$/, '')}/equipment/${equipment.id}`,
    };
  }

  private async buildListWhere(
    user: AuthenticatedUser,
    query: ListEquipmentQueryDto,
  ): Promise<Prisma.EquipmentWhereInput> {
    const base: Prisma.EquipmentWhereInput = {
      status: query.status,
      categoryId: query.categoryId,
      currentHolderId: query.currentHolderId,
    };
    if (user.role !== 'skladistar') {
      return base;
    }
    const keeperIds = [...(await loadKeeperWarehouseIds(this.prisma, user.id))];
    if (keeperIds.length === 0) {
      return { id: { in: [] } };
    }
    return {
      ...base,
      warehouseId: { in: keeperIds },
      OR: [
        { status: 'skladiste' },
        {
          status: 'rashodovano',
          warehouseCondition: { in: ['spremno_za_unistenje', 'unisteno'] },
        },
      ],
    };
  }

  private async getEmployeeOrThrow(id: string) {
    const employee = await this.prisma.employee.findUnique({ where: { id } });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
    return employee;
  }
}
