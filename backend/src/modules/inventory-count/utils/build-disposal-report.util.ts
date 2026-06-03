import type { Prisma } from '../../../../generated/prisma/client';

type DisposalApprovalRow = Prisma.DisposalInventoryApprovalGetPayload<{
  include: {
    equipment: { include: { category: true; warehouse: true } };
    disposalCommission: {
      include: {
        city: true;
        inventoryCommittee: { include: { category: true } };
        members: { include: { employee: true } };
      };
    };
    inventoryLine: true;
    reviewedByUser: { select: { username: true } };
  };
}>;

export interface DisposalReportItem {
  id: string;
  status: string;
  inventoryNumber: string;
  categoryName: string | null;
  warehouseName: string | null;
  lineStatus: string | null;
  lineNote: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  reviewedByUsername: string | null;
  commissionName: string;
  commissionCategoryName: string | null;
}

export interface DisposalReportCommission {
  id: string;
  name: string;
  cityName: string | null;
  categoryName: string | null;
  presidentName: string | null;
  memberNames: string[];
}

export interface DisposalReportPayload {
  session: {
    id: string;
    name: string;
    year: number;
    status: string;
    closedAt: string | null;
    orgUnitName: string | null;
  };
  summary: { pending: number; approved: number; rejected: number; total: number };
  commissions: DisposalReportCommission[];
  items: {
    pending: DisposalReportItem[];
    approved: DisposalReportItem[];
    rejected: DisposalReportItem[];
  };
}

const mapApprovalItem = (row: DisposalApprovalRow): DisposalReportItem => ({
  id: row.id,
  status: row.status,
  inventoryNumber: row.equipment.inventoryNumber,
  categoryName: row.equipment.category?.name ?? null,
  warehouseName: row.equipment.warehouse?.name ?? null,
  lineStatus: row.inventoryLine?.status ?? null,
  lineNote: row.inventoryLine?.note ?? null,
  reviewNote: row.reviewNote,
  reviewedAt: row.reviewedAt?.toISOString() ?? null,
  reviewedByUsername: row.reviewedByUser?.username ?? null,
  commissionName: row.disposalCommission.name,
  commissionCategoryName: row.disposalCommission.inventoryCommittee?.category?.name ?? null,
});

const mapCommission = (commission: DisposalApprovalRow['disposalCommission']): DisposalReportCommission => {
  const president = commission.members.find((member) => member.role === 'predsjednik');
  const clerks = commission.members.filter((member) => member.role === 'clan');
  return {
    id: commission.id,
    name: commission.name,
    cityName: commission.city?.name ?? null,
    categoryName: commission.inventoryCommittee?.category?.name ?? null,
    presidentName: president?.employee
      ? `${president.employee.firstName} ${president.employee.lastName}`
      : null,
    memberNames: clerks.map((member) =>
      member.employee ? `${member.employee.firstName} ${member.employee.lastName}` : member.employeeId,
    ),
  };
};

export const buildDisposalReportPayload = (
  session: {
    id: string;
    name: string;
    year: number;
    status: string;
    closedAt: Date | null;
    orgUnit: { name: string } | null;
  },
  approvals: DisposalApprovalRow[],
): DisposalReportPayload => {
  const commissionMap = new Map<string, DisposalReportCommission>();
  for (const approval of approvals) {
    if (!commissionMap.has(approval.disposalCommissionId)) {
      commissionMap.set(approval.disposalCommissionId, mapCommission(approval.disposalCommission));
    }
  }
  const items = approvals.map(mapApprovalItem);
  const pending = items.filter((row) => row.status === 'pending');
  const approved = items.filter((row) => row.status === 'approved');
  const rejected = items.filter((row) => row.status === 'rejected');
  return {
    session: {
      id: session.id,
      name: session.name,
      year: session.year,
      status: session.status,
      closedAt: session.closedAt?.toISOString() ?? null,
      orgUnitName: session.orgUnit?.name ?? null,
    },
    summary: {
      pending: pending.length,
      approved: approved.length,
      rejected: rejected.length,
      total: items.length,
    },
    commissions: [...commissionMap.values()],
    items: { pending, approved, rejected },
  };
};
