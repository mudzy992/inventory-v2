import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { UserRole } from '../../../generated/prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { SettingsLimitedFileInterceptor } from '../../common/interceptors/settings-limited-file.interceptor';
import { ListUploadsQueryDto } from './dto/list-uploads-query.dto';
import { UploadTransferDocumentDto } from './dto/upload-transfer-document.dto';
import { UploadsService } from './uploads.service';

@Controller('uploads')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post()
  @Roles(UserRole.admin, UserRole.evidenticar, UserRole.user)
  @UseInterceptors(SettingsLimitedFileInterceptor('file'))
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: UploadTransferDocumentDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.uploadsService.uploadTransferDocument(user, body.transferId, file);
  }

  @Get()
  @Roles(UserRole.admin, UserRole.evidenticar, UserRole.user)
  findByEntity(@CurrentUser() user: AuthenticatedUser, @Query() query: ListUploadsQueryDto) {
    return this.uploadsService.findByEntity(user, query.entityType, query.entityId);
  }

  @Get(':id')
  @Roles(UserRole.admin, UserRole.evidenticar, UserRole.user)
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.uploadsService.getFileStream(user, id);
  }
}
