import { BadRequestException } from '@nestjs/common';
import type { DisposalMemberRole } from '../../../../generated/prisma/client';

export interface WarehouseKeeperMemberCandidate {
  userId: string;
  employeeId: string | null;
}

export interface WarehouseCommitteeMemberInput {
  employeeId: string;
  role: DisposalMemberRole;
}

export const buildWarehouseCommitteeMembers = (
  warehouseName: string,
  keepers: WarehouseKeeperMemberCandidate[],
): WarehouseCommitteeMemberInput[] => {
  const withEmployee = keepers.filter((row) => row.employeeId);
  if (withEmployee.length === 0) {
    throw new BadRequestException(
      `Skladište „${warehouseName}": nijedan skladištar nema povezanog zaposlenika (employeeId) — popisna komisija se ne može kreirati`,
    );
  }
  const members: WarehouseCommitteeMemberInput[] = [
    { employeeId: withEmployee[0].employeeId!, role: 'predsjednik' },
  ];
  for (const keeper of withEmployee.slice(1, 3)) {
    members.push({ employeeId: keeper.employeeId!, role: 'clan' });
  }
  return members;
};
