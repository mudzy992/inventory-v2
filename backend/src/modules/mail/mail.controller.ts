import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '../../../generated/prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import {
  PreviewEmailTemplateDto,
  SaveMailConfigDto,
  SendTestEmailDto,
  SendTransferEmailDto,
  UpdateEmailTemplateDto,
} from './dto/mail.dto';
import { MailConfigService } from './mail-config.service';
import { MailTemplatesService } from './mail-templates.service';
import { MailService } from './mail.service';
import { TransferMailService } from './transfer-mail.service';

@Controller('mail')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MailController {
  constructor(
    private readonly configService: MailConfigService,
    private readonly templatesService: MailTemplatesService,
    private readonly mailService: MailService,
    private readonly transferMailService: TransferMailService,
  ) {}

  // ---- SMTP konfiguracija (samo admin) ----

  @Get('config')
  @Roles(UserRole.admin)
  getConfig() {
    return this.configService.getConfigResponse();
  }

  @Put('config')
  @Roles(UserRole.admin)
  saveConfig(@Body() dto: SaveMailConfigDto) {
    return this.configService.saveConfig(dto);
  }

  @Post('config/test-connection')
  @Roles(UserRole.admin)
  testConnection() {
    return this.mailService.testConnection();
  }

  @Post('test-send')
  @Roles(UserRole.admin)
  sendTest(@CurrentUser() user: AuthenticatedUser, @Body() dto: SendTestEmailDto) {
    return this.mailService.sendTestEmail(dto.to, user.id);
  }

  // ---- Email template-i (samo admin) ----

  @Get('templates')
  @Roles(UserRole.admin)
  listTemplates() {
    return this.templatesService.listTemplates();
  }

  @Get('templates/:key')
  @Roles(UserRole.admin)
  getTemplate(@Param('key') key: string) {
    return this.templatesService.getTemplate(key);
  }

  @Put('templates/:key')
  @Roles(UserRole.admin)
  updateTemplate(@Param('key') key: string, @Body() dto: UpdateEmailTemplateDto) {
    return this.templatesService.updateTemplate(key, dto);
  }

  @Post('templates/:key/reset')
  @Roles(UserRole.admin)
  resetTemplate(@Param('key') key: string) {
    return this.templatesService.resetTemplate(key);
  }

  @Post('templates/:key/preview')
  @Roles(UserRole.admin)
  previewTemplate(@Param('key') key: string, @Body() dto: PreviewEmailTemplateDto) {
    return this.templatesService.previewTemplate(key, dto);
  }

  // ---- Dnevnik slanja (samo admin) ----

  @Get('logs')
  @Roles(UserRole.admin)
  listLogs(@Query('limit') limit?: string) {
    const parsed = Number.parseInt(limit ?? '', 10);
    return this.mailService.listLogs(Number.isFinite(parsed) ? parsed : 50);
  }

  // ---- Slanje prenosnice emailom (osoba koja vrši prenos) ----

  @Post('transfers/:id/send')
  @Roles(UserRole.admin, UserRole.evidenticar, UserRole.moderator)
  sendTransfer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SendTransferEmailDto,
  ) {
    return this.transferMailService.sendTransferCompletedEmail(user, id, dto);
  }
}
