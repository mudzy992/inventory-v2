import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '../../../generated/prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateCatalogItemDto } from './dto/create-catalog-item.dto';
import { SearchCatalogQueryDto } from './dto/search-catalog-query.dto';
import { UpdateCatalogItemDto } from './dto/update-catalog-item.dto';
import { EquipmentCatalogService } from './equipment-catalog.service';

@Controller('equipment-catalog')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EquipmentCatalogController {
  constructor(private readonly catalogService: EquipmentCatalogService) {}

  @Get()
  @Roles(UserRole.admin, UserRole.moderator, UserRole.evidenticar, UserRole.skladistar)
  search(@Query() query: SearchCatalogQueryDto) {
    return this.catalogService.findAll(query);
  }

  @Get(':id')
  @Roles(UserRole.admin, UserRole.moderator, UserRole.evidenticar, UserRole.skladistar)
  findOne(@Param('id') id: string) {
    return this.catalogService.findOne(id);
  }

  @Post()
  @Roles(UserRole.admin)
  create(@Body() body: CreateCatalogItemDto) {
    return this.catalogService.create(body);
  }

  @Patch(':id')
  @Roles(UserRole.admin)
  update(@Param('id') id: string, @Body() body: UpdateCatalogItemDto) {
    return this.catalogService.update(id, body);
  }

  @Delete(':id')
  @Roles(UserRole.admin)
  remove(@Param('id') id: string) {
    return this.catalogService.remove(id);
  }
}
