import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { UserRole } from '../../../generated/prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SettingsService } from './settings.service';
import { UpdateSettingDto } from './dto/update-setting.dto';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('public')
  getPublicSettings() {
    return this.settingsService.findByScope('public');
  }

  @Get('private')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  getPrivateSettings() {
    return this.settingsService.findByScope('private');
  }

  @Get('effective')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    UserRole.admin,
    UserRole.moderator,
    UserRole.evidenticar,
    UserRole.popis_koordinator,
    UserRole.user,
    UserRole.skladistar,
  )
  getEffectiveSettings() {
    return this.settingsService.findEffective();
  }

  @Patch(':key')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  updateSetting(@Param('key') key: string, @Body() body: UpdateSettingDto) {
    return this.settingsService.updateValue(key, body.value);
  }
}
