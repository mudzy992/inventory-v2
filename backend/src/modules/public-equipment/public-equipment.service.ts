import { Injectable, NotFoundException } from '@nestjs/common';
import type { Employee, Transfer, Warehouse } from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import {
  buildLabeledSpecifications,
  getUniqueFieldsDisplay,
  type UniqueFieldDisplay,
} from '../../common/utils/equipment-display.util';
import { SettingsService } from '../settings/settings.service';
import { resolveEquipmentDisposalReason } from '../../common/utils/resolve-equipment-disposal-reason.util';
import {
  PUBLIC_EQUIPMENT_ORG_UNIT_MAX_DEPTH,
  assertPublicEquipmentShape,
  buildOrgUnitPath,
  resolvePublicEquipmentMovementLimit,
} from './public-equipment.contract';

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

  /** Bounded at startup; an invalid env value fails the service construction. */
  private readonly movementLimit = resolvePublicEquipmentMovementLimit(
    process.env.PUBLIC_EQUIPMENT_MAX_MOVEMENTS,
  );

  // Javni, neautentifikovani, QR-kod-vođen endpoint (skeniranje sa telefona)
  // — potencijalno najveći anonimni saobraćaj u cijeloj aplikaciji. Ranije
  // je svaki cache miss učitao SVE transfere i CIJELO org stablo; sada se
  // historija ograničava `take` (PUBLIC_EQUIPMENT_MAX_MOVEMENTS), a org
  // putanja gradi samo iz lanca predaka držaoca. Odgovor prolazi kroz
  // assertPublicEquipmentShape() — zamrznuti privacy contract. Oprema se
  // mijenja rijetko, pa je kratak TTL keš čist dobitak: informativna
  // stranica nije izvor istine za bilo kakvu poslovnu odluku.
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
          // The public endpoint must never serialise an unbounded history.
          take: this.movementLimit,
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

    // Only walk the holder's ancestor chain instead of loading every org unit
    // in the system on a public, unauthenticated request.
    const orgUnitsById = equipment.currentHolder
      ? await this.loadOrgUnitAncestors(equipment.currentHolder.orgUnitId)
      : new Map<string, { id: string; name: string; parentId: string | null }>();

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

    const response: PublicEquipmentResponse = {
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
    // Fail closed: never publish an unreviewed field from a public endpoint.
    assertPublicEquipmentShape(response);
    return response;
  }

  private async loadOrgUnitAncestors(
    startId: string,
  ): Promise<Map<string, { id: string; name: string; parentId: string | null }>> {
    const units = new Map<string, { id: string; name: string; parentId: string | null }>();
    const seen = new Set<string>();
    let currentId: string | null = startId;
    while (
      currentId &&
      units.size < PUBLIC_EQUIPMENT_ORG_UNIT_MAX_DEPTH &&
      !seen.has(currentId)
    ) {
      seen.add(currentId);
      const unit: { id: string; name: string; parentId: string | null } | null =
        await this.prisma.orgUnit.findUnique({
          where: { id: currentId },
          select: { id: true, name: true, parentId: true },
        });
      if (!unit) break;
      units.set(unit.id, unit);
      currentId = unit.parentId;
    }
    return units;
  }
}
