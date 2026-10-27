import { Inject, Injectable, NotFoundException, forwardRef } from '@nestjs/common';
import type {
  Notification,
  NotificationOutbox,
  NotificationType,
  Prisma,
} from '../../../generated/prisma/client';
import { LocationResolutionService } from '../../common/services/location-resolution.service';
import { RegistrarScopeService } from '../../common/services/registrar-scope.service';
import type { PaginatedResponse } from '../../common/types/paginated-response.type';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import {
  buildOrderBy,
  paginate,
  parsePagination,
  resolveListPageSize,
} from '../../common/utils/pagination.util';
import { PrismaService } from '../../prisma/prisma.service';
import {
  collectTransferPendingRecipients,
  collectTransferSignedRecipients,
} from './notification-recipients.util';
import {
  collectCommitteeMemberUserIds,
  collectInventorySessionStakeholderUserIds,
} from './notification-inventory-recipients.util';
import { SettingsService } from '../settings/settings.service';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';

const NOTIFICATION_SORT_FIELDS: Record<string, string> = {
  createdAt: 'createdAt',
  title: 'title',
};
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
    inventoryNumber: string | null;
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

  async notificationsEnabled(): Promise<boolean> {
    return this.areNotificationsEnabled();
  }

  async enqueueDisposalApprovalPendingOutboxInTx(
    tx: Prisma.TransactionClient,
    input: {
      approvalId: string;
      sessionId: string;
      commissionId: string;
      inventoryLabel: string;
    },
  ): Promise<void> {
    const members = await tx.disposalCommissionMember.findMany({
      where: { commissionId: input.commissionId },
      select: { employeeId: true },
    });
    if (members.length === 0) {
      return;
    }
    const users = await tx.user.findMany({
      where: {
        employeeId: { in: members.map((row) => row.employeeId) },
        isActive: true,
      },
      select: { id: true },
    });
    if (users.length === 0) {
      return;
    }
    const message = `Rashodna komisija je otvorila predmet za ${input.inventoryLabel}. Pregledajte stavku i glasajte.`;
    await tx.notificationOutbox.createMany({
      data: users.map(({ id: userId }) => ({
        idempotencyKey: `inventory-disposal-approval:${input.sessionId}:${input.approvalId}:${userId}`,
        userId,
        type: 'disposal_approval_pending',
        title: 'Nova odluka o rashodu',
        message,
        relatedId: input.approvalId,
        sessionId: input.sessionId,
        refreshDisposalInbox: true,
      })),
      skipDuplicates: true,
    });
  }

  async buildInventorySessionClosedOutboxRows(
    sessionId: string,
  ): Promise<Prisma.NotificationOutboxCreateManyInput[]> {
    if (!(await this.areNotificationsEnabled())) {
      return [];
    }
    return this.prisma.$transaction(async (tx) => {
      const session = await tx.inventorySession.findUnique({
        where: { id: sessionId },
        select: { name: true, orgUnitId: true },
      });
      if (!session) {
        return [];
      }
      const effectiveCityId = await this.locationResolutionService.getEffectiveLocationForOrgUnit(
        session.orgUnitId,
      );
      const recipients = await collectInventorySessionStakeholderUserIds(
        tx,
        this.registrarScope,
        sessionId,
        effectiveCityId,
      );
      const message = `Sesija „${session.name}" je zatvorena. Prenosnice i rashod su primijenjeni u pozadini.`;
      return [...new Set(recipients)].map((userId) => ({
        idempotencyKey: `inventory-session-closed:${sessionId}:${userId}`,
        userId,
        type: 'inventory_session_closed',
        title: 'Sesija popisa zatvorena',
        message,
        relatedId: sessionId,
        sessionId,
      }));
    });
  }

  async deliverOutboxNotification(outbox: NotificationOutbox): Promise<void> {
    const notification = await this.prisma.notification.upsert({
      where: { outboxId: outbox.id },
      create: {
        outboxId: outbox.id,
        userId: outbox.userId,
        type: outbox.type,
        title: outbox.title,
        message: outbox.message,
        relatedId: outbox.relatedId,
      },
      update: {},
    });
    this.gateway.emitNotificationCreated(outbox.userId, this.toResponse(notification));
    if (outbox.refreshDisposalInbox && outbox.sessionId) {
      this.gateway.emitInventoryDisposalInboxUpdated([outbox.userId], {
        sessionId: outbox.sessionId,
      });
    }
  }

  disconnectUserSockets(userId: string): void {
    this.gateway.disconnectUser(userId);
  }

  async findAllForUser(
    user: AuthenticatedUser,
    query: ListNotificationsQueryDto,
  ): Promise<PaginatedResponse<NotificationResponse>> {
    const { pageSize, maxPageSize } = await resolveListPageSize(query.pageSize, this.settingsService);
    const { page, take } = parsePagination(query, { defaultPageSize: pageSize, maxPageSize });
    const where = {
      userId: user.id,
      ...(query.unread ? { read: false } : {}),
    };
    const orderBy = buildOrderBy(query.sortBy, query.sortDir, NOTIFICATION_SORT_FIELDS, 'createdAt');
    const result = await paginate({
      findMany: (args) => this.prisma.notification.findMany(args),
      count: (args) => this.prisma.notification.count(args),
      where,
      orderBy,
      page,
      pageSize: take,
    });
    return {
      items: result.items.map((row) => this.toResponse(row)),
      meta: result.meta,
    };
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

  async enqueueTransferOutboxEventsInTx(
    tx: Prisma.TransactionClient,
    transferId: string,
    action: 'created' | 'signed',
    options: { notificationsEnabled: boolean; includeUploadPending?: boolean },
  ): Promise<void> {
    if (!options.notificationsEnabled) {
      return;
    }
    const transfer = await tx.transfer.findUnique({
      where: { id: transferId },
      include: {
        equipment: { include: { currentHolder: true, warehouse: true } },
        fromPerson: true,
        toPerson: true,
      },
    });
    if (!transfer) {
      return;
    }
    const recipientContext = await this.buildRecipientContext(transfer);
    const rows: Prisma.NotificationOutboxCreateManyInput[] = [];
    const equipmentLabel = transfer.equipment.inventoryNumber;
    const addEvent = (
      userIds: string[],
      type: NotificationType,
      title: string,
      message: string,
      relatedId: string,
    ) => {
      for (const userId of new Set(userIds)) {
        rows.push({
          idempotencyKey: `transfer:${transfer.id}:${type}:${userId}`,
          userId,
          type,
          title,
          message,
          relatedId,
        });
      }
    };

    if (action === 'created') {
      const recipients = await collectTransferPendingRecipients(tx, this.registrarScope, recipientContext);
      addEvent(
        recipients,
        'transfer_pending',
        'Novi prenos na potpis',
        `Prenos opreme ${equipmentLabel} (${transfer.documentNumber}) čeka potpis.`,
        transfer.id,
      );
      if (options.includeUploadPending && !transfer.scannedDocUrl && transfer.status === 'raw') {
        addEvent(
          recipients,
          'transfer_signed_upload_pending',
          'Prenosnica čeka potpisani PDF',
          `Upload potpisane prenosnice ${transfer.documentNumber} (${equipmentLabel}).`,
          transfer.id,
        );
      }
    } else {
      const recipients = await collectTransferSignedRecipients(
        tx,
        this.registrarScope,
        recipientContext,
      );
      addEvent(
        recipients,
        'transfer_complete',
        'Prenos potpisan',
        `Prenos opreme ${equipmentLabel} (${transfer.documentNumber}) je potpisan.`,
        transfer.id,
      );
      if (transfer.toPersonId && transfer.toType === 'osoba') {
        const assignee = await tx.user.findFirst({
          where: { employeeId: transfer.toPersonId, isActive: true },
          select: { id: true },
        });
        if (assignee) {
          addEvent(
            [assignee.id],
            'equipment_assigned',
            'Nova oprema zadužena',
            `Zaduženi ste opremom ${equipmentLabel}.`,
            transfer.equipmentId,
          );
        }
      }
    }

    if (rows.length > 0) {
      await tx.notificationOutbox.createMany({ data: rows, skipDuplicates: true });
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

  async notifyInventoryDraftCreated(
    sessionId: string,
    sessionName: string,
    orgUnitId: string,
  ): Promise<void> {
    if (!(await this.areNotificationsEnabled())) {
      return;
    }
    const adminIds = await this.prisma.user.findMany({
      where: { role: 'admin', isActive: true },
      select: { id: true },
    });
    const coordinatorIds = await this.prisma.user.findMany({
      where: {
        role: 'popis_koordinator',
        isActive: true,
        inventoryCoordinatorAssignments: {
          some: { OR: [{ orgUnitId }, { orgUnitId: null }] },
        },
      },
      select: { id: true },
    });
    const recipients = [...adminIds, ...coordinatorIds].map((row) => row.id);
    await this.createForUsers(recipients, {
      type: 'inventory_draft_created',
      title: 'Kreirana draft sesija popisa',
      message: `Sesija „${sessionName}" je kreirana — definirajte komisije prije aktivacije.`,
      relatedId: sessionId,
    });
  }

  async notifyInventoryCloseBlocked(
    sessionId: string,
    sessionName: string,
    pendingDisposal: number,
    detail?: string,
  ): Promise<void> {
    if (!(await this.areNotificationsEnabled())) {
      return;
    }
    const adminIds = await this.prisma.user.findMany({
      where: { role: 'admin', isActive: true },
      select: { id: true },
    });
    const message =
      pendingDisposal > 0
        ? `Sesija „${sessionName}" nije automatski zatvorena — ${pendingDisposal} rashoda čeka odluku.`
        : `Sesija „${sessionName}" nije automatski zatvorena${detail ? `: ${detail}` : '.'}`;
    await this.createForUsers(
      adminIds.map((row) => row.id),
      {
        type: 'inventory_close_blocked',
        title: 'Zatvaranje popisa blokirano',
        message,
        relatedId: sessionId,
      },
    );
  }

  async notifyInventoryAutoClosed(sessionId: string, sessionName: string): Promise<void> {
    if (!(await this.areNotificationsEnabled())) {
      return;
    }
    const adminIds = await this.prisma.user.findMany({
      where: { role: 'admin', isActive: true },
      select: { id: true },
    });
    await this.createForUsers(
      adminIds.map((row) => row.id),
      {
        type: 'inventory_auto_closed',
        title: 'Sesija popisa automatski zatvorena',
        message: `Sesija „${sessionName}" je automatski prebačena u zatvaranje.`,
        relatedId: sessionId,
      },
    );
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

  async notifyEmployeeDeactivationEquipmentRequired(input: {
    employeeId: string;
    employeeName: string;
    heldCount: number;
    recipientUserIds: string[];
  }): Promise<void> {
    if (!(await this.areNotificationsEnabled())) {
      return;
    }
    if (input.recipientUserIds.length === 0) {
      return;
    }
    await this.createForUsers(input.recipientUserIds, {
      type: 'employee_deactivation_equipment_required',
      title: 'Hitno razduženje — deaktivacija radnika',
      message: `${input.employeeName} čeka deaktivaciju; ${input.heldCount} komada opreme na zaduženju. Hitno evidentirajte razduženje ili prenos.`,
      relatedId: input.employeeId,
    });
  }

  /**
   * N-8: durable counterpart of notifyWarehouseStockReceived(). Built and
   * written INSIDE the stock-receive transaction, so a committed lot always
   * carries its notification. Idempotency keys make replay safe.
   */
  async buildWarehouseStockReceivedOutboxRows(
    tx: Prisma.TransactionClient,
    lotIds: string[],
  ): Promise<Prisma.NotificationOutboxCreateManyInput[]> {
    if (lotIds.length === 0) {
      return [];
    }
    const lots = await tx.warehouseStockLot.findMany({
      where: { id: { in: lotIds } },
      include: { category: true, warehouse: true },
    });
    const rows: Prisma.NotificationOutboxCreateManyInput[] = [];
    for (const lot of lots) {
      const categoryIds = await this.registrarScope.expandCategoryIds([lot.categoryId]);
      const assignments = await tx.registrarAssignment.findMany({
        where: {
          warehouseId: lot.warehouseId,
          categoryId: { in: [...categoryIds] },
          user: { role: 'evidenticar', isActive: true },
        },
        select: { userId: true },
      });
      for (const userId of new Set(assignments.map((row) => row.userId))) {
        rows.push({
          idempotencyKey: `warehouse-stock-received:${lot.id}:${userId}`,
          userId,
          type: 'warehouse_stock_received',
          title: 'Nova roba na skladi\u0161tu',
          message: `${lot.quantityReceived}\u00d7 ${lot.productName} (${lot.category.name}) \u2014 ${lot.warehouse.name}. Defini\u0161ite specifikaciju.`,
          relatedId: lot.id,
        });
      }
    }
    return rows;
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
    this.gateway.emitInventoryCloseJobUpdated(recipients, {
      sessionId,
      status: job.status,
      appliedCount: job.appliedCount,
      failedCount: job.failedCount,
      totalCount: job.totalCount,
    });
    if (job.status === 'done') {
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
    if (uniqueIds.length === 0) {
      return;
    }
    // N-6: one DB round-trip instead of one INSERT per recipient. The
    // in-memory emit loop is cheap and stays per-user by design.
    const rows = await this.prisma.notification.createManyAndReturn({
      data: uniqueIds.map((userId) => ({
        userId,
        type: input.type,
        title: input.title,
        message: input.message,
        relatedId: input.relatedId,
      })),
      select: {
        id: true,
        userId: true,
        type: true,
        title: true,
        message: true,
        read: true,
        relatedId: true,
        outboxId: true,
        createdAt: true,
      },
    });
    for (const row of rows) {
      this.gateway.emitNotificationCreated(row.userId, this.toResponse(row));
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
