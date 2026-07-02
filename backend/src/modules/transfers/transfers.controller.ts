import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { createReadStream } from 'node:fs';
import { UserRole } from '../../../generated/prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { ListTransfersQueryDto } from './dto/list-transfers-query.dto';
import { RecentTransfersQueryDto } from './dto/recent-transfers-query.dto';
import { ManualPreuzeoLabelQueryDto } from './dto/manual-preuzeo-label-query.dto';
import { SignTransferDto } from './dto/sign-transfer.dto';
import { TransferDocumentGenerationService } from './transfer-document-generation.service';
import { TransfersService } from './transfers.service';

@Controller('transfers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TransfersController {
  constructor(
    private readonly transfersService: TransfersService,
    private readonly transferDocumentGeneration: TransferDocumentGenerationService,
  ) {}

  @Get()
  @Roles(UserRole.admin, UserRole.moderator, UserRole.evidenticar, UserRole.user, UserRole.skladistar)
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: ListTransfersQueryDto) {
    return this.transfersService.findAll(user, query);
  }

  @Get('recent')
  @Roles(UserRole.admin, UserRole.moderator, UserRole.evidenticar, UserRole.user, UserRole.skladistar)
  findRecent(@CurrentUser() user: AuthenticatedUser, @Query() query: RecentTransfersQueryDto) {
    return this.transfersService.findRecent(user, query);
  }

  @Get('manual-preuzeo-suggestions')
  @Roles(UserRole.admin, UserRole.evidenticar, UserRole.moderator)
  getManualPreuzeoSuggestions() {
    return this.transfersService.getManualPreuzeoSuggestions();
  }

  @Get('manual-preuzeo-label')
  @Roles(UserRole.admin, UserRole.evidenticar, UserRole.moderator)
  getLastManualPreuzeoLabel(@Query() query: ManualPreuzeoLabelQueryDto) {
    if (!query.equipmentId) {
      return { label: null };
    }
    return this.transfersService
      .getLastManualPreuzeoLabel(query.equipmentId)
      .then((label) => ({ label }));
  }

  @Get(':id')
  @Roles(UserRole.admin, UserRole.moderator, UserRole.evidenticar, UserRole.user, UserRole.skladistar)
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.transfersService.findOne(user, id);
  }

  @Post()
  @Roles(UserRole.admin, UserRole.evidenticar, UserRole.moderator)
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateTransferDto) {
    return this.transfersService.create(user, body);
  }

  @Get(':id/raw-document')
  @Roles(UserRole.admin, UserRole.evidenticar, UserRole.moderator)
  @Header('Content-Type', 'text/html; charset=utf-8')
  getRawDocument(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.transfersService.getRawDocumentHtml(user, id);
  }

  @Get(':id/generated-document')
  @Roles(UserRole.admin, UserRole.evidenticar, UserRole.moderator)
  async getGeneratedDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('format') format?: string,
  ): Promise<StreamableFile> {
    await this.transfersService.findOne(user, id);
    const resolvedFormat = format === 'pdf' ? 'pdf' : 'docx';
    const file = await this.transferDocumentGeneration.getGeneratedFileStream(id, resolvedFormat);
    const stream = createReadStream(file.absolutePath);
    return new StreamableFile(stream, {
      type: file.mime,
      disposition: `attachment; filename="${file.filename}"`,
    });
  }

  @Patch(':id/mark-printed')
  @Roles(UserRole.admin, UserRole.evidenticar, UserRole.moderator)
  markPrinted(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.transfersService.markPrinted(user, id);
  }

  @Patch(':id/cancel')
  @Roles(UserRole.admin, UserRole.evidenticar, UserRole.moderator)
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.transfersService.cancel(user, id);
  }

  @Patch(':id/sign')
  @Roles(UserRole.admin, UserRole.evidenticar, UserRole.moderator)
  sign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: SignTransferDto,
  ) {
    return this.transfersService.finalize(user, id, body);
  }

  @Patch(':id/finalize')
  @Roles(UserRole.admin, UserRole.evidenticar, UserRole.moderator)
  finalize(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: SignTransferDto,
  ) {
    return this.transfersService.finalize(user, id, body);
  }
}
