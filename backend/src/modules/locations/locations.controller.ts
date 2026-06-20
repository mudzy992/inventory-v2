import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '../../../generated/prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateCantonDto } from './dto/create-canton.dto';
import { SearchLocationsQueryDto } from './dto/search-locations-query.dto';
import { CreateCityDto } from './dto/create-city.dto';
import { UpdateCantonDto } from './dto/update-canton.dto';
import { UpdateCityDto } from './dto/update-city.dto';
import { LocationsService } from './locations.service';

@Controller('locations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Get('cantons')
  @Roles(UserRole.admin, UserRole.moderator, UserRole.evidenticar, UserRole.skladistar)
  findCantons() {
    return this.locationsService.findCantons();
  }

  @Get('cantons/search')
  @Roles(UserRole.admin, UserRole.moderator, UserRole.evidenticar, UserRole.skladistar)
  searchCantons(@Query() query: SearchLocationsQueryDto) {
    return this.locationsService.searchCantons(query);
  }

  @Get('cities')
  @Roles(UserRole.admin, UserRole.moderator, UserRole.evidenticar, UserRole.skladistar)
  findCities() {
    return this.locationsService.findCities();
  }

  @Get('cities/search')
  @Roles(UserRole.admin, UserRole.moderator, UserRole.evidenticar, UserRole.skladistar)
  searchCities(@Query() query: SearchLocationsQueryDto) {
    return this.locationsService.searchCities(query);
  }

  @Post('cantons')
  @Roles(UserRole.admin)
  createCanton(@Body() body: CreateCantonDto) {
    return this.locationsService.createCanton(body);
  }

  @Patch('cantons/:id')
  @Roles(UserRole.admin)
  updateCanton(@Param('id') id: string, @Body() body: UpdateCantonDto) {
    return this.locationsService.updateCanton(id, body);
  }

  @Delete('cantons/:id')
  @Roles(UserRole.admin)
  deleteCanton(@Param('id') id: string) {
    return this.locationsService.deleteCanton(id);
  }

  @Post('cities')
  @Roles(UserRole.admin)
  createCity(@Body() body: CreateCityDto) {
    return this.locationsService.createCity(body);
  }

  @Patch('cities/:id')
  @Roles(UserRole.admin)
  updateCity(@Param('id') id: string, @Body() body: UpdateCityDto) {
    return this.locationsService.updateCity(id, body);
  }

  @Delete('cities/:id')
  @Roles(UserRole.admin)
  deleteCity(@Param('id') id: string) {
    return this.locationsService.deleteCity(id);
  }
}
