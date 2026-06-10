import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { DisposalCommissionsModule } from '../disposal-commissions/disposal-commissions.module';
import { EmployeeRelocationModule } from '../employee-relocation/employee-relocation.module';
import { NavController } from './nav.controller';
import { NavService } from './nav.service';

@Module({
  imports: [CommonModule, EmployeeRelocationModule, DisposalCommissionsModule],
  controllers: [NavController],
  providers: [NavService],
})
export class NavModule {}
