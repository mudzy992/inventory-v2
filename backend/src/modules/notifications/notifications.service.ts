import { Inject, Injectable, NotFoundException, forwardRef } from '@nestjs/common';
import type { Notification, NotificationType } from '../../../generated/prisma/client';
import { LocationResolutionService } from '../../common/services/location-resolution.service';
import { RegistrarScopeService } from '../../common/services/registrar-scope.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { PrismaService } from '../../prisma/prisma.service';
import {
  collectTransferPendingRecipients,
  collectTransferSignedRecipients,
} from './notification-recipients.util';
import {
  collectCommitteeMemberUserIds,
  collectDisposalCommissionMemberUserIds,
  collectInventorySessionStakeholderUserIds,
} from './notification-inventory-recipients.util';
import { SettingsService } from '../settings/settings.service';
import { NotificationsGateway } from './notifications.gateway';

export interface NotificationResponse {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  relatedId: string | null;
  createdAt: string;
}

interface TransferRecipientSource {
  signerId: string;
  fromPersonId: string | null;
  toPersonId: string | null;
  toType: string;
  equipmentId: string;
  id: string;
  documentNumber: string;
  equipment: {
    inventoryNumber: string;
    categoryId: string;
    currentHolder: { orgUnitId: string } | null;
    warehouse?: { cityId: string } | null;
    warehouseId?: string | null;
  };
  fromPerson: { orgUnitId: string } | null;
  toPerson: { orgUnitId: string } | null;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registrarScope: RegistrarScopeService,
    private readonly locationResolutionService: LocationResolutionService,
    private readonly gateway: NotificationsGateway,
    @Inject(forwardRef(() => SettingsService))
    private readonly settingsService: SettingsService,
  ) {}

  async findAllForUser(user: AuthenticatedUser): Promise<NotificationResponse[]> {
    const rows = await this.prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((row) => this.toResponse(row));
  }

  async markRead(user: AuthenticatedUser, id: string): Promise<NotificationResponse> {
    const row = await this.getOwnedNotification(user.id, id);
    if (row.read) {
      return this.toResponse(row);
    }
    const updated = await this.prisma.notification.update({
      where: { id },
      data: { read: true },
    });
    this.gateway.emitNotificationRead(user.id, id);
    return this.toResponse(updated);
  }

  async markAllRead(user: AuthenticatedUser): Promise<{ count: number }> {
    const unread = await this.prisma.notification.findMany({
      where: { userId: user.id, read: false },
      select: { id: true },
    });
    if (unread.length === 0) {
      return { count: 0 };
    }
    await this.prisma.notification.updateMany({
      where: { userId: user.id, read: false },
      data: { read: true },
    });
    for (const row of unread) {
      this.gateway.emitNotificationRead(user.id, row.id);
    }
    return { count: unread.length };
  }

  async notifyTransferPending(transferId: string): Promise<void> {
    if (!(await this.areNotificationsEnabled())) {
      return;
    }
    const transfer = await this.loadTransferContext(transferId);
    const recipients = await collectTransferPendingRecipients(
      this.prisma,
      this.registrarScope,
      await this.buildRecipientContext(transfer),
    );
    const equipmentLabel = transfer.equipment.inventoryNumber;
    await this.createForUsers(recipients, {
      type: 'transfer_pending',
      title: 'Novi prenos na potpis',
      message: `Prenos opreme ${equipmentLabel} (${transfer.documentNumber}) čeka potpis.`,
      relatedId: transfer.id,
    });
  }

  async notifyTransferSignedUploadPending(transferId: string): Promise<void> {
    if (!(await this.areNotificationsEnabled())) {
      return;
    }
    const transfer = await this.prisma.transfer.findUnique({
      where: { id: transferId },
      select: {
        id: true,
        documentNumber: true,
        scannedDocUrl: true,
        status: true,
        equipment: { select: { inventoryNumber: true } },
      },
    });
    if (!transfer || transfer.scannedDocUrl || transfer.status !== 'raw') {
      return;
    }
    const fullTransfer = await this.loadTransferContext(transferId);
    const recipients = await collectTransferPendingRecipients(
      this.prisma,
      this.registrarScope,
      await this.buildRecipientContext(fullTransfer),
    );
    const equipmentLabel = transfer.equipment.inventoryNumber;
    await this.createForUsers(recipients, {
      type: 'transfer_signed_upload_pending',
      title: 'Prenosnica čeka potpisani PDF',
      message: `Upload potpisane prenosnice ${transfer.documentNumber} (${equipmentLabel}).`,
      relatedId: transfer.id,
    });
  }

  async notifyTransferSigned(transferId: string): Promise<void> {
    if (!(await this.areNotificationsEnabled())) {
      return;
    }
    const transfer = await this.loadTransferContext(transferId);
    const context = await this.buildRecipientContext(transfer);
    const recipients = await collectTransferSignedRecipients(
      this.prisma,
      this.registrarScope,
      context,
    );
    const equipmentLabel = transfer.equipment.inventoryNumber;
    await this.createForUsers(recipients, {
      type: 'transfer_complete',
      title: 'Prenos potpisan',
      message: `Prenos opreme ${equipmentLabel} (${transfer.documentNumber}) je potpisan.`,
      relatedId: transfer.id,
    });
    if (transfer.toPersonId && transfer.toType === 'osoba') {
      const assignee = await this.prisma.user.findFirst({
        where: { employeeId: transfer.toPersonId, isActive: true },
        select: { id: true },
      });
      if (assignee) {
        await this.createForUsers([assignee.id], {
          type: 'equipment_assigned',
          title: 'Nova oprema zadužena',
          message: `Zaduženi ste opremom ${equipmentLabel}.`,
          relatedId: transfer.equipmentId,
        });
      }
    }
  }

  emitPublicSettingUpdated(key: string, value: string | number | boolean): void {
    this.gateway.emitSettingsUpdated(key, value);
  }

  async notifyInventoryTransferUploadPending(
    transferId: string,
    committeeId: string,
  ): Promise<void> {
    if (!(await this.areNotificationsEnabled())) {
      return;
    }
    const transfer = await this.prisma.transfer.findUnique({
      where: { id: transferId },
      select: {
        id: true,
        documentNumber: true,
        scannedDocUrl: true,
        equipment: { select: { inventoryNumber: true } },
      },
    });
    if (!transfer || transfer.scannedDocUrl) {
      return;
    }
    const recipients = await collectCommitteeMemberUserIds(this.prisma, committeeId);
    if (recipients.length === 0) {
      return;
    }
    const equipmentLabel = transfer.equipment.inventoryNumber;
    await this.createForUsers(recipients, {
      type: 'inventory_transfer_upload_pending',
      title: 'Prenosnica čeka upload',
      message: `Upload potpisane prenosnice ${transfer.documentNumber} (${equipmentLabel}) prije zatvaranja sesije.`,
      relatedId: transfer.id,
    });
  }

  async notifyInventorySessionClosed(sessionId: string, sessionName: string): Promise<void> {
    if (!(await this.areNotificationsEnabled())) {
      return;
    }
    const session = await this.prisma.inventorySession.findUnique({
      where: { id: sessionId },
      select: { orgUnitId: true },
    });
    if (!session) {
      return;
    }
    const effectiveCityId = await this.locationResolutionService.getEffectiveLocationForOrgUnit(
      session.orgUnitId,
    );
    const recipients = await collectInventorySessionStakeholderUserIds(
      this.prisma,
      this.registrarScope,
      sessionId,
      effectiveCityId,
    );
    await this.createForUsers(recipients, {
      type: 'inventory_session_closed',
      title: 'Sesija popisa zatvorena',
      message: `Sesija „${sessionName}" je zatvorena. Prenosnice i rashod su primijenjeni u pozadini.`,
      relatedId: sessionId,
    });
  }

  async notifyEmployeeRelocationActionRequired(input: {
    userId: string;
    employeeName: string;
    caseId: string;
    messageSuffix?: string;
  }): Promise<void> {
    if (!(await this.areNotificationsEnabled())) {
      return;
    }
    await this.createForUsers([input.userId], {
      type: 'employee_relocation_action_required',
      title: 'Promjena org. jedinice — potrebna akcija',
      message: `Radnik ${input.employeeName} promijenio org. jedinicu. Potrebna akcija za zaduženu opremu${input.messageSuffix ?? ''}.`,
      relatedId: input.caseId,
    });
  }

  async notifyEmployeeRelocationIncoming(input: {
    userId: string;
    employeeName: string;
    inventoryNumber: string;
    lineId: string;
  }): Promise<void> {
    if (!(await this.areNotificationsEnabled())) {
      return;
    }
    await this.createForUsers([input.userId], {
      type: 'employee_relocation_incoming',
      title: 'Nova oprema za prihvat',
      message: `Oprema ${input.inventoryNumber} (radnik ${input.employeeName}) čeka prihvat na vaše skladište.`,
      relatedId: input.lineId,
    });
  }

  async notifyEmployeeRelocationAdminAlert(input: {
    userIds: string[];
    title: string;
    message: string;
    relatedId: string;
  }): Promise<void> {
    if (!(await this.areNotificationsEnabled())) {
      return;
    }
    await this.createForUsers(input.userIds, {
      type: 'employee_relocation_admin_alert',
      title: input.title,
      message: input.message,
      relatedId: input.relatedId,
    });
  }

  async notifyWarehouseStockReceived(lotId: string): Promise<void> {
    if (!(await this.areNotificationsEnabled())) {
      return;
    }
    const lot = await this.prisma.warehouseStockLot.findUnique({
      where: { id: lotId },
      include: { category: true, warehouse: true },
    });
    if (!lot) {
      return;
    }
    const categoryIds = await this.registrarScope.expandCategoryIds([lot.categoryId]);
    const assignments = await this.prisma.registrarAssignment.findMany({
      where: {
        warehouseId: lot.warehouseId,
        categoryId: { in: [...categoryIds] },
        user: { role: 'evidenticar', isActive: true },
      },
      select: { userId: true },
    });
    const userIds = assignments.map((row) => row.userId);
    if (userIds.length === 0) {
      return;
    }
    await this.createForUsers(userIds, {
      type: 'warehouse_stock_received',
      title: 'Nova roba na skladištu',
      message: `${lot.quantityReceived}× ${lot.productName} (${lot.category.name}) — ${lot.warehouse.name}. Definišite specifikaciju.`,
      relatedId: lotId,
    });
  }

  async notifyDisposalApprovalPending(
    approvalId: string,
    disposalCommissionId: string,
    equipmentInventoryNumber: string,
  ): Promise<void> {
    if (!(await this.areNotificationsEnabled())) {
      return;
    }
    const recipients = await collectDisposalCommissionMemberUserIds(
      this.prisma,
      disposalCommissionId,
    );
    if (recipients.length === 0) {
      return;
    }
    await this.createForUsers(recipients, {
      type: 'disposal_approval_pending',
      title: 'Rashod čeka odobrenje',
      message: `Oprema ${equipmentInventoryNumber} čeka odobrenje komisije za rashod (popis).`,
      relatedId: approvalId,
    });
  }

  async emitInventoryCloseJobProgress(
    sessionId: string,
    job: {
      status: string;
      appliedCount: number;
      failedCount: number;
      totalCount: number;
    },
  ): Promise<void> {
    const session = await this.prisma.inventorySession.findUnique({
      where: { id: sessionId },
      select: { orgUnitId: true, name: true },
    });
    if (!session) {
      return;
    }
    const effectiveCityId = await this.locationResolutionService.getEffectiveLocationForOrgUnit(
      session.orgUnitId,
    );
    const recipients = await collectInventorySessionStakeholderUserIds(
      this.prisma,
      this.registrarScope,
      sessionId,
      effectiveCityId,
    );
    this.gateway.emitInventoryCloseJobUpdated(recipients, {
      sessionId,
      status: job.status,
      appliedCount: job.appliedCount,
      failedCount: job.failedCount,
      totalCount: job.totalCount,
    });
    if (job.status === 'done') {
      await this.notifyInventorySessionClosed(sessionId, session.name);
      this.gateway.emitInventoryDisposalInboxUpdated(recipients, { sessionId });
    }
  }

  async emitInventoryDisposalInboxRefresh(sessionId: string): Promise<void> {
    const session = await this.prisma.inventorySession.findUnique({
      where: { id: sessionId },
      select: { orgUnitId: true },
    });
    if (!session) {
      return;
    }
    const effectiveCityId = await this.locationResolutionService.getEffectiveLocationForOrgUnit(
      session.orgUnitId,
    );
    const recipients = await collectInventorySessionStakeholderUserIds(
      this.prisma,
      this.registrarScope,
      sessionId,
      effectiveCityId,
    );
    this.gateway.emitInventoryDisposalInboxUpdated(recipients, { sessionId });
  }

  private async createForUsers(
    userIds: string[],
    input: {
      type: NotificationType;
      title: string;
      message: string;
      relatedId?: string;
    },
  ): Promise<void> {
    const uniqueIds = [...new Set(userIds)];
    for (const userId of uniqueIds) {
      const row = await this.prisma.notification.create({
        data: {
          userId,
          type: input.type,
          title: input.title,
          message: input.message,
          relatedId: input.relatedId,
        },
      });
      this.gateway.emitNotificationCreated(userId, this.toResponse(row));
    }
  }

  private async areNotificationsEnabled(): Promise<boolean> {
    return this.settingsService.getBooleanValue('notifications.enabled', true);
  }

  private async getOwnedNotification(userId: string, id: string): Promise<Notification> {
    const row = await this.prisma.notification.findFirst({ where: { id, userId } });
    if (!row) {
      throw new NotFoundException('Notification not found');
    }
    return row;
  }

  private async loadTransferContext(transferId: string) {
    const transfer = await this.prisma.transfer.findUnique({
      where: { id: transferId },
      include: {
        equipment: { include: { currentHolder: true, warehouse: true } },
        fromPerson: true,
        toPerson: true,
      },
    });
    if (!transfer) {
      throw new NotFoundException('Transfer not found');
    }
    return transfer;
  }

  private async buildRecipientContext(transfer: TransferRecipientSource) {
    let equipmentCityId: string | null = null;
    if (transfer.equipment.currentHolder) {
      equipmentCityId = await this.locationResolutionService.getEffectiveLocationForOrgUnit(
        transfer.equipment.currentHolder.orgUnitId,
      );
    } else if (transfer.equipment.warehouse) {
      equipmentCityId = transfer.equipment.warehouse.cityId;
    } else if (transfer.equipment.warehouseId) {
      const warehouse = await this.prisma.warehouse.findUnique({
        where: { id: transfer.equipment.warehouseId },
        select: { cityId: true },
      });
      equipmentCityId = warehouse?.cityId ?? null;
    }
    return {
      signerId: transfer.signerId,
      fromPersonId: transfer.fromPersonId,
      toPersonId: transfer.toPersonId,
      equipmentCategoryId: transfer.equipment.categoryId,
      equipmentCityId,
    };
  }

  private toResponse(row: Notification): NotificationResponse {
    return {
      id: row.id,
      userId: row.userId,
      type: row.type,
      title: row.title,
      message: row.message,
      read: row.read,
      relatedId: row.relatedId,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
