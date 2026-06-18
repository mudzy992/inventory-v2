export type CommitteeMemberCandidate = {
  id: string;
  firstName: string;
  lastName: string;
  title: string;
  userId: string | null;
  userIsActive: boolean;
};

export type ResolveEligibleCommitteeMembersInput = {
  warehouseId: string;
  assignmentUserIds: Set<string>;
  employees: CommitteeMemberCandidate[];
};

export type ResolveEligibleCommitteeMembersDeps = {
  resolveEmployeeWarehouseId: (employeeId: string) => Promise<string | null>;
};

export const isEmployeeEligibleForWarehouseCommittee = async (
  employee: CommitteeMemberCandidate,
  input: ResolveEligibleCommitteeMembersInput,
  deps: ResolveEligibleCommitteeMembersDeps,
): Promise<boolean> => {
  const hasAssignment = employee.userId ? input.assignmentUserIds.has(employee.userId) : false;
  if (hasAssignment) {
    return true;
  }
  const effectiveWarehouseId = await deps.resolveEmployeeWarehouseId(employee.id);
  return effectiveWarehouseId === input.warehouseId;
};

export const resolveEligibleCommitteeMembers = async (
  input: ResolveEligibleCommitteeMembersInput,
  deps: ResolveEligibleCommitteeMembersDeps,
): Promise<
  {
    id: string;
    firstName: string;
    lastName: string;
    title: string;
    hasUserAccount: boolean;
  }[]
> => {
  const eligible: {
    id: string;
    firstName: string;
    lastName: string;
    title: string;
    hasUserAccount: boolean;
  }[] = [];
  for (const employee of input.employees) {
    const isEligible = await isEmployeeEligibleForWarehouseCommittee(employee, input, deps);
    if (!isEligible) {
      continue;
    }
    eligible.push({
      id: employee.id,
      firstName: employee.firstName,
      lastName: employee.lastName,
      title: employee.title,
      hasUserAccount: employee.userIsActive,
    });
  }
  return eligible;
};
