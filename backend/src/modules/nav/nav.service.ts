import { Injectable } from '@nestjs/common';
import type { NotificationType } from '../../../generated/prisma/client';
import { RegistrarScopeService } from '../../common/services/registrar-scope.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { PrismaService } from '../../prisma/prisma.service';
import { EmployeeRelocationService } from '../employee-relocation/employee-relocation.service';

const NOTIFICATION_TYPES_BY_PAGE: Record<string, NotificationType[]> = {
  transfers: ['transfer_pending', 'transfer_signed_upload_pending'],
  equipment: ['equipment_assigned', 'employee_deactivation_equipment_required'],
  'registrar-stock': ['warehouse_stock_received'],
  'inventory-count': ['inventory_transfer_upload_pending', 'inventory_session_closed', 'disposal_approval_pending'],
  'employee-relocation': [
    'employee_relocation_action_required',
    'employee_relocation_incoming',
    'employee_relocation_admin_alert',
  ],
};

@Injectable()
export class NavService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registrarScope: RegistrarScopeService,
    private readonly relocationService: EmployeeRelocationService,
  ) {}

  async getModuleBadges(user: AuthenticatedUser): Promise<Record<string, number>> {
    const badges: Record<string, number> = {};
    const unreadByType = await this.prisma.notification.groupBy({
      by: ['type'],
      where: { userId: user.id, read: false },
      _count: { _all: true },
    });
    const unreadCountByType = new Map(
      unreadByType.map((row) => [row.type, row._count._all]),
    );
    for (const [pageId, types] of Object.entries(NOTIFICATION_TYPES_BY_PAGE)) {
      const count = types.reduce((sum, type) => sum + (unreadCountByType.get(type) ?? 0), 0);
      if (count > 0) {
        badges[pageId] = (badges[pageId] ?? 0) + count;
      }
    }
    const transferWhere = await this.registrarScope.buildTransferWhere(user);
    const pendingTransfers = await this.prisma.transfer.count({
      where: {
        AND: [transferWhere, { status: { in: ['raw', 'printed'] } }],
      },
    });
    if (pendingTransfers > 0) {
      badges.transfers = (badges.transfers ?? 0) + pendingTransfers;
    }
    if (user.role === 'admin') {
      try {
        const alerts = await this.relocationService.getAdminAlerts();
        const relocationCount =
          alerts.openCases + alerts.pendingDest + alerts.unmappedCatalogLines;
        if (relocationCount > 0) {
          badges['employee-relocation'] = (badges['employee-relocation'] ?? 0) + relocationCount;
        }
      } catch {
        // feature disabled
      }
    }
    return Object.fromEntries(Object.entries(badges).filter(([, count]) => count > 0));
  }
}
