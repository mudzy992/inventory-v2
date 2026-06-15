import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { InventoryCountModule } from '../inventory-count/inventory-count.module';
import { InventorySchedulerService } from './inventory-scheduler.service';

@Module({
  imports: [ScheduleModule.forRoot(), InventoryCountModule],
  providers: [InventorySchedulerService],
})
export class InventorySchedulerModule {}
