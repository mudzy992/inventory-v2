import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { detectCrossServiceTransfer } from '../../common/utils/transfer-cross-service.util';
import { LocationResolutionService } from '../../common/services/location-resolution.service';
import { InventoryFreezeService } from '../../common/services/inventory-freeze.service';
import { OrgScopeService } from '../../common/services/org-scope.service';
import { RegistrarScopeService } from '../../common/services/registrar-scope.service';
import { SignerResolutionService } from '../../common/services/signer-resolution.service';
import { WarehouseResolutionService } from '../../common/services/warehouse-resolution.service';
import { assertRazduzenjeWarehouseCoverage } from '../../common/utils/warehouse-coverage.util';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import {
  assertCanReadEquipment,
  assertCanWriteEquipment,
} from '../equipment/equipment-access.util';
import { PrismaService } from '../../prisma/prisma.service';
import { DisposalCommissionsService } from '../disposal-commissions/disposal-commissions.service';
import { InventoryCountService } from '../inventory-count/inventory-count.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { ListTransfersQueryDto } from './dto/list-transfers-query.dto';
import { SignTransferDto } from './dto/sign-transfer.dto';
import {
  buildEquipmentUpdateOnFinalize,
  validateEquipmentForTransfer,
  validateTransferShape,
} from './transfer-validation.util';
import { resolveTransferSignerId } from './utils/resolve-transfer-signer.util';
import { allocateTransferDocumentNumberInTx } from './utils/allocate-transfer-document-number.util';
import { assertTransferCreationAllowed } from './utils/transfer-generation-policy.util';
import { resolveDocumentWarehouseId } from './utils/resolve-document-warehouse.util';
import { TransferDocumentGenerationService } from './transfer-document-generation.service';
import { buildTransferRawDocumentHtml } from './utils/transfer-raw-document.util';

const transferInclude = {
  equipment: { include: { currentHolder: true, warehouse: true } },
  signer: true,
  fromPerson: true,
  toPerson: true,
  disposalApproval: true,
} satisfies Prisma.TransferInclude;

@Injectable()
export class TransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registrarScope: RegistrarScopeService,
    private readonly locationResolutionService: LocationResolutionService,
    private readonly settingsService: SettingsService,
    private readonly notificationsService: NotificationsService,
    private readonly disposalCommissionsService: DisposalCommissionsService,
    private readonly inventoryCountService: InventoryCountService,
    private readonly signerResolutionService: SignerResolutionService,
    private readonly orgScopeService: OrgScopeService,
    private readonly inventoryFreeze: InventoryFreezeService,
    private readonly warehouseResolutionService: WarehouseResolutionService,
    private readonly transferDocumentGeneration: TransferDocumentGenerationService,
  ) {}

  async markUploadedAfterScan(transferId: string): Promise<void> {
    const transfer = await this.prisma.transfer.findUnique({
      where: { id: transferId },
      select: { status: true },
    });
    if (!transfer || transfer.status === 'potpisan' || transfer.status === 'cancelled') {
      return;
    }
    if (transfer.status === 'raw' || transfer.status === 'printed') {
      await this.prisma.transfer.update({
        where: { id: transferId },
        data: { status: 'uploaded' },
      });
    }
  }

  async findAll(user: AuthenticatedUser, query: ListTransfersQueryDto) {
    const transfers = await this.prisma.transfer.findMany({
      where: {
        equipmentId: query.equipmentId,
        status: query.status,
      },
      include: transferInclude,
      orderBy: { createdAt: 'desc' },
    });
    const filtered = [];
    for (const transfer of transfers) {
      if (await this.canAccessTransfer(user, transfer)) {
        filtered.push(transfer);
      }
    }
    return filtered;
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const transfer = await this.getTransferOrThrow(id);
    if (!(await this.canAccessTransfer(user, transfer))) {
      throw new ForbiddenException('Transfer outside your scope');
    }
    return transfer;
  }

  async create(user: AuthenticatedUser, dto: CreateTransferDto) {
    await this.settingsService.assertFeatureEnabled('features.transfers');
    await assertTransferCreationAllowed(this.settingsService, dto.type, 'api');
    if (user.role === 'user') {
      throw new ForbiddenException('Users cannot create transfers');
    }
    await this.resolveMissingWarehouseIds(dto);
    validateTransferShape(dto);
    const equipment = await this.prisma.equipment.findUnique({
      where: { id: dto.equipmentId },
      include: { currentHolder: true, warehouse: true },
    });
    if (!equipment) {
      throw new NotFoundException('Equipment not found');
    }
    await assertCanWriteEquipment(
      user,
      equipment,
      equipment.currentHolder,
      this.registrarScope,
      this.prisma,
    );
    validateEquipmentForTransfer(equipment, dto);
    await this.registrarScope.assertCanCreateTransferType(user, dto.type);
    await this.inventoryFreeze.assertTransferCreateAllowed(
      dto.equipmentId,
      user,
      dto.type,
      null,
    );
    const isCrossService = await this.resolveCrossServiceFlag(user, dto);
    const signerId = await this.resolveSignerForCreate(dto);
    await this.assertSignerExists(signerId);
    await this.assertWarehouseIds(dto);
    await this.assertWarehouseCoverageForTransfer(dto);
    if (dto.fromPersonId) {
      await this.assertEmployeeInScope(user, dto.fromPersonId);
    }
    if (dto.toPersonId) {
      await this.assertEmployeeInScope(user, dto.toPersonId);
    }
    const draftNumber = `DRAFT-${Date.now()}`;
    const documentWarehouseId = await this.resolveDocumentWarehouseForCreate(dto, equipment);
    await this.assertWarehouseReadyForDocuments(documentWarehouseId);
    const created = await this.prisma.transfer.create({
      data: {
        equipmentId: dto.equipmentId,
        type: dto.type,
        fromType: dto.fromType,
        fromPersonId: dto.fromPersonId,
        toType: dto.toType,
        toPersonId: dto.toPersonId,
        signerId,
        fromWarehouseId: dto.fromWarehouseId ?? null,
        toWarehouseId: dto.toWarehouseId ?? null,
        documentWarehouseId,
        createdByUserId: user.id,
        date: new Date(dto.date),
        reason: dto.reason,
        notes: dto.notes,
        status: 'raw',
        documentNumber: draftNumber,
        isCrossServiceTransfer: isCrossService,
      },
      include: transferInclude,
    });
    if (dto.type === 'rashodovanje') {
      const resolved = await this.disposalCommissionsService.resolveForEquipment(dto.equipmentId);
      if (!resolved.cityId) {
        throw new BadRequestException('Cannot resolve city for disposal');
      }
      await this.disposalCommissionsService.createApprovalForTransfer(created.id, resolved.cityId);
    }
    await this.notificationsService.notifyTransferPending(created.id);
    const requireSignedPdf = await this.settingsService.getBooleanValue(
      'transfer.require_signed_pdf_upload',
      true,
    );
    if (requireSignedPdf) {
      await this.notificationsService.notifyTransferSignedUploadPending(created.id);
    }
    await this.transferDocumentGeneration.generateForTransfer(created.id).catch(() => undefined);
    return this.getTransferOrThrow(created.id);
  }

  async markPrinted(user: AuthenticatedUser, id: string) {
    const transfer = await this.getTransferOrThrow(id);
    if (!(await this.canAccessTransfer(user, transfer))) {
      throw new ForbiddenException('Transfer outside your scope');
    }
    if (transfer.status !== 'raw') {
      throw new BadRequestException('Only raw transfers can be marked printed');
    }
    return this.prisma.transfer.update({
      where: { id },
      data: { status: 'printed', printedAt: new Date() },
      include: transferInclude,
    });
  }

  async cancel(user: AuthenticatedUser, id: string) {
    const transfer = await this.getTransferOrThrow(id);
    if (!(await this.canAccessTransfer(user, transfer))) {
      throw new ForbiddenException('Transfer outside your scope');
    }
    if (!['raw', 'printed', 'uploaded'].includes(transfer.status)) {
      throw new BadRequestException('Transfer cannot be cancelled');
    }
    return this.prisma.transfer.update({
      where: { id },
      data: { status: 'cancelled' },
      include: transferInclude,
    });
  }

  async getRawDocumentHtml(user: AuthenticatedUser, id: string): Promise<string> {
    const transfer = await this.getTransferOrThrow(id);
    if (!(await this.canAccessTransfer(user, transfer))) {
      throw new ForbiddenException('Transfer outside your scope');
    }
    return buildTransferRawDocumentHtml(transfer);
  }

  async sign(user: AuthenticatedUser, id: string, dto: SignTransferDto) {
    return this.finalize(user, id, dto);
  }

  async finalize(user: AuthenticatedUser, id: string, dto: SignTransferDto) {
    if (user.role === 'user') {
      throw new ForbiddenException('Users cannot finalize transfers');
    }
    const transfer = await this.getTransferOrThrow(id);
    if (transfer.status === 'potpisan') {
      throw new BadRequestException('Transfer already finalized');
    }
    if (transfer.status === 'cancelled') {
      throw new BadRequestException('Transfer is cancelled');
    }
    await this.inventoryFreeze.assertTransferFinalizeAllowed(id, user);
    if (transfer.type === 'rashodovanje') {
      await this.disposalCommissionsService.assertCanSignDisposalTransfer(id);
    }
    if (!(await this.canAccessTransfer(user, transfer))) {
      throw new ForbiddenException('Transfer outside your scope');
    }
    if (transfer.isCrossServiceTransfer && user.role !== 'admin') {
      throw new ForbiddenException('Only admin can finalize cross-service transfers');
    }
    await this.assertCanFinalizeUpload(user, transfer);
    const signerId = dto.signerId ?? transfer.signerId;
    await this.assertSignerExists(signerId);
    const signDate = dto.date ? new Date(dto.date) : transfer.date;
    const year = signDate.getFullYear();
    const isRashod = transfer.type === 'rashodovanje';
    const documentWarehouseId =
      transfer.documentWarehouseId ??
      (await this.resolveDocumentWarehouseForTransfer(transfer));
    await this.assertWarehouseReadyForDocuments(documentWarehouseId);
    const equipmentUpdate = buildEquipmentUpdateOnFinalize(
      transfer.type,
      transfer.toPersonId,
      transfer.toWarehouseId,
    );
    const signed = await this.prisma.$transaction(async (tx) => {
      const documentNumber = await allocateTransferDocumentNumberInTx(
        tx,
        documentWarehouseId,
        year,
        isRashod,
      );
      const updated = await tx.transfer.update({
        where: { id },
        data: {
          status: 'potpisan',
          signerId,
          date: signDate,
          documentNumber,
          documentWarehouseId,
          finalizedByUserId: user.id,
        },
        include: transferInclude,
      });
      await tx.equipment.update({
        where: { id: transfer.equipmentId },
        data: equipmentUpdate,
      });
      return updated;
    });
    await this.transferDocumentGeneration.generateForTransfer(signed.id).catch(() => undefined);
    await this.notificationsService.notifyTransferSigned(signed.id);
    return signed;
  }

  private async assertCanFinalizeUpload(
    user: AuthenticatedUser,
    transfer: Awaited<ReturnType<typeof this.getTransferOrThrow>>,
  ): Promise<void> {
    if (transfer.scannedDocUrl) {
      return;
    }
    const allowWithoutUpload = await this.settingsService.getBooleanValue(
      'transfer.allow_finalize_without_upload',
      false,
    );
    if (user.role === 'admin' && allowWithoutUpload) {
      return;
    }
    const requireSignedPdf = await this.settingsService.getBooleanValue(
      'transfer.require_signed_pdf_upload',
      true,
    );
    const legacyRequireUpload = await this.settingsService.getBooleanValue(
      'transfer.require_upload_before_sign',
      false,
    );
    if (requireSignedPdf || legacyRequireUpload) {
      throw new BadRequestException('Upload potpisane prenosnice (PDF) prije finalizacije');
    }
  }

  private async resolveSignerForCreate(dto: CreateTransferDto): Promise<string> {
    if (dto.signerId) {
      return dto.signerId;
    }
    const resolved = await resolveTransferSignerId(this.signerResolutionService, {
      type: dto.type,
      fromPersonId: dto.fromPersonId,
      toPersonId: dto.toPersonId,
    });
    return this.signerResolutionService.assertEffectiveSignerConfigured(resolved);
  }

  private async assertWarehouseIds(dto: CreateTransferDto): Promise<void> {
    const ids = [dto.fromWarehouseId, dto.toWarehouseId].filter(Boolean) as string[];
    if (ids.length === 0) {
      return;
    }
    const count = await this.prisma.warehouse.count({ where: { id: { in: ids } } });
    if (count !== ids.length) {
      throw new BadRequestException('Warehouse not found');
    }
  }

  private async assertWarehouseCoverageForTransfer(dto: CreateTransferDto): Promise<void> {
    if (dto.type !== 'razduzenje' || !dto.toWarehouseId || !dto.fromPersonId) {
      return;
    }
    const holder = await this.prisma.employee.findUnique({
      where: { id: dto.fromPersonId },
      select: { orgUnitId: true },
    });
    if (!holder) {
      throw new BadRequestException('fromPersonId not found');
    }
    await assertRazduzenjeWarehouseCoverage(
      this.prisma,
      this.orgScopeService,
      holder.orgUnitId,
      dto.toWarehouseId,
    );
  }

  private async resolveMissingWarehouseIds(dto: CreateTransferDto): Promise<void> {
    if (dto.type === 'zaduzenje' && !dto.fromWarehouseId) {
      const equipment = await this.prisma.equipment.findUnique({
        where: { id: dto.equipmentId },
        select: { warehouseId: true, status: true },
      });
      if (equipment?.status === 'skladiste' && equipment.warehouseId) {
        dto.fromWarehouseId = equipment.warehouseId;
      }
    }
    if (dto.type === 'razduzenje' && !dto.toWarehouseId && dto.fromPersonId) {
      const resolved = await this.warehouseResolutionService.resolveForEmployee(dto.fromPersonId);
      if (resolved) {
        dto.toWarehouseId = resolved;
      }
    }
  }

  private async resolveCrossServiceFlag(
    user: AuthenticatedUser,
    dto: CreateTransferDto,
  ): Promise<boolean> {
    const orgUnits = await this.prisma.orgUnit.findMany();
    const fromEmployee = dto.fromPersonId
      ? await this.prisma.employee.findUnique({ where: { id: dto.fromPersonId } })
      : null;
    const toEmployee = dto.toPersonId
      ? await this.prisma.employee.findUnique({ where: { id: dto.toPersonId } })
      : null;
    const detected = detectCrossServiceTransfer(fromEmployee, toEmployee, orgUnits);
    const requested = dto.isCrossServiceTransfer === true || detected;
    if (!requested) {
      if (user.role === 'evidenticar' && fromEmployee && toEmployee) {
        const fromCity = await this.locationResolutionService.getEffectiveLocationForOrgUnit(
          fromEmployee.orgUnitId,
        );
        const toCity = await this.locationResolutionService.getEffectiveLocationForOrgUnit(
          toEmployee.orgUnitId,
        );
        if (fromCity && toCity && fromCity !== toCity) {
          const allowCrossCity = await this.settingsService.getBooleanValue(
            'transfer.allow_evidenticar_cross_city',
            false,
          );
          if (!allowCrossCity) {
            throw new ForbiddenException('Evidentičar cannot transfer across different cities');
          }
        }
      }
      return false;
    }
    const featureEnabled = await this.settingsService.getBooleanValue(
      'features.cross_service_transfer',
      true,
    );
    if (!featureEnabled) {
      throw new BadRequestException('Cross-service transfers are disabled');
    }
    if (user.role !== 'admin') {
      throw new ForbiddenException('Only admin can create cross-service transfers');
    }
    return true;
  }

  private async resolveDocumentWarehouseForCreate(
    dto: CreateTransferDto,
    equipment: { warehouseId: string | null },
  ): Promise<string> {
    let resolvedHolderWarehouseId: string | null = null;
    if (dto.type === 'prenos' && dto.fromPersonId) {
      resolvedHolderWarehouseId = await this.warehouseResolutionService.resolveForEmployee(
        dto.fromPersonId,
      );
    }
    return resolveDocumentWarehouseId({
      type: dto.type,
      fromWarehouseId: dto.fromWarehouseId ?? null,
      toWarehouseId: dto.toWarehouseId ?? null,
      equipmentWarehouseId: equipment.warehouseId,
      resolvedHolderWarehouseId,
    });
  }

  private async resolveDocumentWarehouseForTransfer(
    transfer: Awaited<ReturnType<typeof this.getTransferOrThrow>>,
  ): Promise<string> {
    let resolvedHolderWarehouseId: string | null = null;
    if (transfer.type === 'prenos' && transfer.fromPersonId) {
      resolvedHolderWarehouseId = await this.warehouseResolutionService.resolveForEmployee(
        transfer.fromPersonId,
      );
    }
    return resolveDocumentWarehouseId({
      type: transfer.type,
      fromWarehouseId: transfer.fromWarehouseId,
      toWarehouseId: transfer.toWarehouseId,
      equipmentWarehouseId: transfer.equipment.warehouseId,
      resolvedHolderWarehouseId,
    });
  }

  private async assertWarehouseReadyForDocuments(warehouseId: string): Promise<void> {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: warehouseId },
      select: { orgUnitId: true, isActive: true },
    });
    if (!warehouse?.isActive) {
      throw new BadRequestException('Skladište nije pronađeno ili nije aktivno');
    }
    if (!warehouse.orgUnitId) {
      throw new BadRequestException(
        'Skladište mora imati dodijeljenu org. jedinicu prije generisanja prenosnice',
      );
    }
  }

  private async canAccessTransfer(
    user: AuthenticatedUser,
    transfer: Awaited<ReturnType<typeof this.getTransferOrThrow>>,
  ): Promise<boolean> {
    const isEquipmentReadable = await assertCanReadEquipment(
      user,
      transfer.equipment,
      transfer.equipment.currentHolder,
      this.registrarScope,
      this.prisma,
    )
      .then(() => true)
      .catch(() => false);
    if (isEquipmentReadable) {
      return true;
    }
    if (transfer.inventoryLineId) {
      return this.canAccessTransferViaInventoryLine(user, transfer.inventoryLineId);
    }
    return false;
  }

  private async canAccessTransferViaInventoryLine(
    user: AuthenticatedUser,
    inventoryLineId: string,
  ): Promise<boolean> {
    const actor = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { employeeId: true },
    });
    if (!actor?.employeeId) {
      return false;
    }
    const line = await this.prisma.inventoryLine.findUnique({
      where: { id: inventoryLineId },
      select: { committee: { select: { members: { select: { employeeId: true } } } } },
    });
    if (!line) {
      return false;
    }
    return line.committee.members.some((member) => member.employeeId === actor.employeeId);
  }

  private async getTransferOrThrow(id: string) {
    const transfer = await this.prisma.transfer.findUnique({
      where: { id },
      include: transferInclude,
    });
    if (!transfer) {
      throw new NotFoundException('Transfer not found');
    }
    return transfer;
  }

  private async assertSignerExists(signerId: string): Promise<void> {
    const signer = await this.prisma.employee.findUnique({ where: { id: signerId } });
    if (!signer) {
      throw new BadRequestException('Signer employee not found');
    }
  }

  private async assertEmployeeInScope(user: AuthenticatedUser, employeeId: string): Promise<void> {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
    const allowed = await this.registrarScope.canAccessEmployee(user, employee);
    if (user.role === 'evidenticar' && !allowed) {
      throw new ForbiddenException('Employee outside your scope');
    }
  }
}
