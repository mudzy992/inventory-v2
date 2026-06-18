import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { EmployeeRelocationModule } from '../employee-relocation/employee-relocation.module';
import { NavController } from './nav.controller';
import { NavService } from './nav.service';

@Module({
  imports: [CommonModule, EmployeeRelocationModule],
  controllers: [NavController],
  providers: [NavService],
})
export class NavModule {}
