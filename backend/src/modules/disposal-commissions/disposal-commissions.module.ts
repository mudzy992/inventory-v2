import { Module } from '@nestjs/common';
import { DisposalCommissionsController } from './disposal-commissions.controller';
import { DisposalCommissionsService } from './disposal-commissions.service';

@Module({
  controllers: [DisposalCommissionsController],
  providers: [DisposalCommissionsService],
  exports: [DisposalCommissionsService],
})
export class DisposalCommissionsModule {}
