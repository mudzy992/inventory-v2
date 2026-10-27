/**
 * N-15: module-level query shapes, sort allow-lists, DTO input types and
 * response mappers extracted from the 3k-line InventoryCountService so the
 * service file stays focused on orchestration and can be split further with
 * the existing characterization specs as a safety net.
 */
import type { Prisma } from '../../../generated/prisma/client';

export const OPEN_INVENTORY_SESSION_STATUSES = ['draft', 'active', 'closing'] as const;

export const INVENTORY_COUNTABLE_EQUIPMENT_STATUS = {
  notIn: ['rashodovano', 'za_rashod'] as const,
} satisfies Prisma.EnumEquipmentStatusFilter;

export const SESSION_LIST_INCLUDE = {
  orgUnit: { include: { effectiveLocationCity: { include: { canton: true } } } },
  _count: { select: { committees: true } },
} satisfies Prisma.InventorySessionInclude;

export const COMMITTEE_LIST_INCLUDE = {
  warehouse: { select: { id: true, name: true } },
  category: { select: { id: true, name: true } },
  members: { include: { employee: { select: { id: true, firstName: true, lastName: true } } } },
  _count: { select: { lines: true } },
} satisfies Prisma.InventoryCommitteeInclude;

export const COMMITTEE_LINE_LIST_INCLUDE = {
  equipment: {
    select: {
      id: true,
      inventoryNumber: true,
      status: true,
      categoryId: true,
      currentHolder: { select: { id: true, firstName: true, lastName: true } },
    },
  },
  pendingAction: { select: { id: true, status: true } },
  generatedTransfer: { select: { id: true, status: true, documentNumber: true, scannedDocUrl: true } },
} satisfies Prisma.InventoryLineInclude;

export const EQUIPMENT_SCOPE_INCLUDE = {
  category: { select: { id: true, name: true } },
  currentHolder: { select: { id: true, firstName: true, lastName: true, orgUnitId: true, title: true } },
  warehouse: { select: { id: true, name: true, cityId: true } },
} satisfies Prisma.EquipmentInclude;

export const PRINT_SCOPE_EQUIPMENT_INCLUDE = {
  ...EQUIPMENT_SCOPE_INCLUDE,
  stockLot: { select: { id: true, productName: true } },
} satisfies Prisma.EquipmentInclude;

export const SESSION_SORT_FIELDS: Record<string, string> = {
  year: 'year',
  createdAt: 'createdAt',
  name: 'name',
};

export const COMMITTEE_SORT_FIELDS: Record<string, string> = {
  createdAt: 'createdAt',
};

export const INVENTORY_LINE_SORT_FIELDS: Record<string, string> = {
  createdAt: 'createdAt',
  status: 'status',
};

export const PENDING_ACTION_RESPONSE_SELECT = {
  id: true,
  sessionId: true,
  committeeId: true,
  equipmentId: true,
  inventoryLineId: true,
  kind: true,
  payload: true,
  status: true,
  attempts: true,
  lastError: true,
  appliedAt: true,
  createdByUserId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.InventoryPendingActionSelect;

export type InventoryCloseJobResponseInput = {
  id: string;
  sessionId: string;
  status: string;
  totalCount: number;
  appliedCount: number;
  failedCount: number;
  skippedCount: number;
  startedAt: Date | null;
  endedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export const toPublicInventoryCloseJob = (job: InventoryCloseJobResponseInput) => ({
  id: job.id,
  sessionId: job.sessionId,
  status: job.status,
  totalCount: job.totalCount,
  appliedCount: job.appliedCount,
  failedCount: job.failedCount,
  skippedCount: job.skippedCount,
  startedAt: job.startedAt,
  endedAt: job.endedAt,
  lastError: job.lastError,
  createdAt: job.createdAt,
  updatedAt: job.updatedAt,
});

export const EQUIPMENT_SCOPE_SORT_FIELDS: Record<string, string> = {
  inventoryNumber: 'inventoryNumber',
  entryDate: 'entryDate',
};

export interface CommitteeMemberInput {
  employeeId: string;
  role: 'predsjednik' | 'clan';
}

export interface CreateSessionInput {
  name: string;
  orgUnitId: string;
  year: number;
}

export interface CreateCommitteeInput {
  sessionId: string;
  warehouseId: string;
  categoryId: string;
  inventoryMembers: CommitteeMemberInput[];
  disposalMembers: CommitteeMemberInput[];
  name?: string;
}

export type UpdateCommitteeInput = Omit<CreateCommitteeInput, 'sessionId'>;
