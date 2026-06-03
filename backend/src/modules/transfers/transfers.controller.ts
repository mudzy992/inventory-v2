import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '../../../generated/prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { ListTransfersQueryDto } from './dto/list-transfers-query.dto';
import { SignTransferDto } from './dto/sign-transfer.dto';
import { TransfersService } from './transfers.service';

@Controller('transfers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TransfersController {
  constructor(private readonly transfersService: TransfersService) {}

  @Get()
  @Roles(UserRole.admin, UserRole.evidenticar, UserRole.user, UserRole.skladistar)
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: ListTransfersQueryDto) {
    return this.transfersService.findAll(user, query);
  }

  @Get(':id')
  @Roles(UserRole.admin, UserRole.evidenticar, UserRole.user, UserRole.skladistar)
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.transfersService.findOne(user, id);
  }

  @Post()
  @Roles(UserRole.admin, UserRole.evidenticar)
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateTransferDto) {
    return this.transfersService.create(user, body);
  }

  @Get(':id/raw-document')
  @Roles(UserRole.admin, UserRole.evidenticar)
  @Header('Content-Type', 'text/html; charset=utf-8')
  getRawDocument(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.transfersService.getRawDocumentHtml(user, id);
  }

  @Patch(':id/mark-printed')
  @Roles(UserRole.admin, UserRole.evidenticar)
  markPrinted(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.transfersService.markPrinted(user, id);
  }

  @Patch(':id/cancel')
  @Roles(UserRole.admin, UserRole.evidenticar)
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.transfersService.cancel(user, id);
  }

  @Patch(':id/sign')
  @Roles(UserRole.admin, UserRole.evidenticar)
  sign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: SignTransferDto,
  ) {
    return this.transfersService.finalize(user, id, body);
  }

  @Patch(':id/finalize')
  @Roles(UserRole.admin, UserRole.evidenticar)
  finalize(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: SignTransferDto,
  ) {
    return this.transfersService.finalize(user, id, body);
  }
}
