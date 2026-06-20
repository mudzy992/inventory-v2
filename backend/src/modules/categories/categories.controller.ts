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
import { CreateCategoryDto } from './dto/create-category.dto';
import { SearchCategoriesQueryDto } from './dto/search-categories-query.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CategoriesService } from './categories.service';

@Controller('categories')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @Roles(UserRole.admin, UserRole.moderator, UserRole.evidenticar, UserRole.skladistar, UserRole.user)
  findFlat() {
    return this.categoriesService.findFlat();
  }

  @Get('tree')
  @Roles(UserRole.admin, UserRole.moderator, UserRole.evidenticar, UserRole.skladistar, UserRole.user)
  findTree() {
    return this.categoriesService.findTree();
  }

  @Get('search')
  @Roles(UserRole.admin, UserRole.moderator, UserRole.evidenticar, UserRole.skladistar, UserRole.user)
  search(@Query() query: SearchCategoriesQueryDto) {
    return this.categoriesService.search(query);
  }

  @Get(':id')
  @Roles(UserRole.admin, UserRole.moderator, UserRole.evidenticar, UserRole.skladistar, UserRole.user)
  findOne(@Param('id') id: string) {
    return this.categoriesService.findOne(id);
  }

  @Post()
  @Roles(UserRole.admin)
  create(@Body() body: CreateCategoryDto) {
    return this.categoriesService.create(body);
  }

  @Patch(':id')
  @Roles(UserRole.admin)
  update(@Param('id') id: string, @Body() body: UpdateCategoryDto) {
    return this.categoriesService.update(id, body);
  }

  @Delete(':id')
  @Roles(UserRole.admin)
  remove(@Param('id') id: string) {
    return this.categoriesService.remove(id);
  }
}
