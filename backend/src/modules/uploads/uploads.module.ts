import { Module } from '@nestjs/common';
import { TransfersModule } from '../transfers/transfers.module';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

@Module({
  imports: [TransfersModule],
  controllers: [UploadsController],
  providers: [UploadsService],
})
export class UploadsModule {}
