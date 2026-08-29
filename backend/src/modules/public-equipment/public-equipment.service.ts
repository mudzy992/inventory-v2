import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  Employee,
  OrgUnit,
  Transfer,
  Warehouse,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import {
  buildLabeledSpecifications,
  getUniqueFieldsDisplay,
  type UniqueFieldDisplay,
} from '../../common/utils/equipment-display.util';
import { SettingsService } from '../settings/settings.service';
import { resolveEquipmentDisposalReason } from '../../common/utils/resolve-equipment-disposal-reason.util';

export interface PublicEquipmentHolder {
  fullName: string;
  title: string;
  orgUnitPath: string;
}

export interface PublicEquipmentWarehouse {
  name: string;
}

export interface PublicEquipmentMovement {
  date: string;
  type: string;
  status: string;
  fromLabel: string;
  toLabel: string;
  documentNumber: string;
}

export interface PublicEquipmentResponse {
  id: string;
  inventoryNumber: string | null;
  isAccountingTracked: boolean;
  status: string;
  categoryName: string;
  productName: string | null;
  uniqueFields: UniqueFieldDisplay[];
  specifications: Record<string, string>;
  currentHolder: PublicEquipmentHolder | null;
  warehouse: PublicEquipmentWarehouse | null;
  movements: PublicEquipmentMovement[];
  disposalReason: string | null;
}

function employeeFullName(employee: Pick<Employee, 'firstName' | 'lastName'>): string {
  return `${employee.firstName} ${employee.lastName}`.trim();
}

function buildOrgUnitPath(orgUnitsById: Map<string, Pick<OrgUnit, 'id' | 'name' | 'parentId'>>, orgUnitId: string): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  let currentId: string | null = orgUnitId;
  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);
    const unit = orgUnitsById.get(currentId);
    if (!unit) {
      break;
    }
    parts.unshift(unit.name);
    currentId = unit.parentId;
  }
  return parts.join(' → ');
}

function resolveTransferPartyLabel(
  side: 'from' | 'to',
  transfer: Transfer,
  employeesById: Map<string, Pick<Employee, 'firstName' | 'lastName'>>,
  warehousesById: Map<string, Pick<Warehouse, 'name'>>,
): string {
  if (side === 'from') {
    if (transfer.fromType === 'skladiste') {
      const warehouse = transfer.fromWarehouseId ? warehousesById.get(transfer.fromWarehouseId) : null;
      return warehouse ? `Skladište: ${warehouse.name}` : 'Skladište';
    }
    if (transfer.fromPersonId) {
      const person = employeesById.get(transfer.fromPersonId);
      return person ? employeeFullName(person) : '—';
    }
    return '—';
  }

  if (transfer.toType === 'rashod') {
    return 'Rashod';
  }
  if (transfer.toType === 'skladiste') {
    const warehouse = transfer.toWarehouseId ? warehousesById.get(transfer.toWarehouseId) : null;
    return warehouse ? `Skladište: ${warehouse.name}` : 'Skladište';
  }
  if (transfer.toPersonId) {
    const person = employeesById.get(transfer.toPersonId);
    return person ? employeeFullName(person) : '—';
  }
  return '—';
}

@Injectable()
export class PublicEquipmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly redisService: RedisService,
  ) {}

  // Javni, neautentifikovani, QR-kod-vođen endpoint (skeniranje sa telefona)
  // — potencijalno najveći anonimni saobraćaj u cijeloj aplikaciji, a svaki
  // poziv bez keša radi: 1 equipment upit sa 4 nivoa relacija (uključujući
  // SVE transfere), + 1 NEOGRANIČEN orgUnit.findMany() (svi org unit-i u
  // sistemu, na svaki poziv, radi izgradnje org-unit path-a). Oprema se
  // mijenja rijetko u odnosu na potencijalnu frekvenciju QR skeniranja, pa
  // je kratak TTL kеš ovdje čist dobitak bez praktičnog rizika po
  // korisničko iskustvo (30-60s stara "trenutna lokacija opreme" na
  // javnoj stranici je zanemarljivo, informativna stranica nije izvor
  // istine za bilo kakvu poslovnu odluku).
  private static readonly CACHE_TTL_SECONDS = 60;

  async findOne(id: string): Promise<PublicEquipmentResponse> {
    const lookupEnabled = await this.settingsService.isFeatureEnabled(
      'features.public_equipment_lookup',
      true,
    );
    if (!lookupEnabled) {
      throw new NotFoundException('Public equipment lookup is disabled');
    }

    return this.redisService.remember(
      `public-equipment:${id}`,
      PublicEquipmentService.CACHE_TTL_SECONDS,
      () => this.buildResponse(id),
    );
  }

  private async buildResponse(id: string): Promise<PublicEquipmentResponse> {
    const equipment = await this.prisma.equipment.findUnique({
      where: { id },
      include: {
        category: true,
        stockLot: { select: { productName: true } },
        currentHolder: {
          include: { orgUnit: true },
        },
        warehouse: true,
        transfers: {
          orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
          include: {
            fromPerson: true,
            toPerson: true,
            fromWarehouse: true,
            toWarehouse: true,
          },
        },
      },
    });
    if (!equipment) {
      throw new NotFoundException('Equipment not found');
    }

    const orgUnits = await this.prisma.orgUnit.findMany({
      select: { id: true, name: true, parentId: true },
    });
    const orgUnitsById = new Map(orgUnits.map((unit) => [unit.id, unit]));

    const employeesById = new Map<string, Pick<Employee, 'firstName' | 'lastName'>>();
    for (const transfer of equipment.transfers) {
      if (transfer.fromPerson) {
        employeesById.set(transfer.fromPerson.id, transfer.fromPerson);
      }
      if (transfer.toPerson) {
        employeesById.set(transfer.toPerson.id, transfer.toPerson);
      }
    }

    const warehousesById = new Map<string, Pick<Warehouse, 'name'>>();
    for (const transfer of equipment.transfers) {
      if (transfer.fromWarehouse) {
        warehousesById.set(transfer.fromWarehouse.id, transfer.fromWarehouse);
      }
      if (transfer.toWarehouse) {
        warehousesById.set(transfer.toWarehouse.id, transfer.toWarehouse);
      }
    }
    if (equipment.warehouse) {
      warehousesById.set(equipment.warehouse.id, equipment.warehouse);
    }

    const specifications = (equipment.specifications ?? {}) as Record<string, string>;
    const disposalReason = await resolveEquipmentDisposalReason(
      this.prisma,
      equipment.id,
      equipment.status,
      equipment.notes,
    );

    return {
      id: equipment.id,
      inventoryNumber: equipment.inventoryNumber,
      isAccountingTracked: equipment.isAccountingTracked,
      status: equipment.status,
      categoryName: equipment.category.name,
      productName: equipment.stockLot?.productName?.trim() || null,
      uniqueFields: getUniqueFieldsDisplay(
        equipment.category.fields,
        equipment.category.optionalFields,
        specifications,
      ),
      specifications: buildLabeledSpecifications(
        equipment.category.fields,
        equipment.category.optionalFields,
        specifications,
        { excludeUnique: true },
      ),
      currentHolder: equipment.currentHolder
        ? {
            fullName: employeeFullName(equipment.currentHolder),
            title: equipment.currentHolder.title,
            orgUnitPath: buildOrgUnitPath(orgUnitsById, equipment.currentHolder.orgUnitId),
          }
        : null,
      warehouse:
        equipment.status === 'skladiste' && equipment.warehouse
          ? { name: equipment.warehouse.name }
          : null,
      movements: equipment.transfers.map((transfer) => ({
        date: transfer.date.toISOString().slice(0, 10),
        type: transfer.type,
        status: transfer.status,
        fromLabel: resolveTransferPartyLabel('from', transfer, employeesById, warehousesById),
        toLabel: resolveTransferPartyLabel('to', transfer, employeesById, warehousesById),
        documentNumber: transfer.documentNumber,
      })),
      disposalReason,
    };
  }
}
