import { Body, Controller, Get, Post } from '@nestjs/common';
import { InitializeSetupDto } from './dto/initialize-setup.dto';
import { SetupService } from './setup.service';

@Controller('setup')
export class SetupController {
  constructor(private readonly setupService: SetupService) {}

  @Get('status')
  getStatus() {
    return this.setupService.getStatus();
  }

  @Post('initialize')
  initialize(@Body() body: InitializeSetupDto) {
    return this.setupService.initialize(body);
  }
}
