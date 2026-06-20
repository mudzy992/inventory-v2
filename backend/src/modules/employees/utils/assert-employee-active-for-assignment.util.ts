import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../../prisma/prisma.service';
import { EMPLOYEE_MESSAGES } from '../../../common/utils/employee-messages.util';

export const assertEmployeeActiveForAssignment = async (
  prisma: PrismaService,
  employeeId: string,
): Promise<void> => {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { isActive: true },
  });
  if (!employee) {
    throw new NotFoundException('Employee not found');
  }
  if (!employee.isActive) {
    throw new BadRequestException(EMPLOYEE_MESSAGES.deactivateInactiveEmployeeTarget);
  }
};
