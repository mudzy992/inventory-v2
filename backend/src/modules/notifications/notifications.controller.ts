import { Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: ListNotificationsQueryDto) {
    return this.notificationsService.findAllForUser(user, query);
  }

  @Patch(':id/read')
  markRead(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.notificationsService.markRead(user, id);
  }

  @Post('read-all')
  markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.markAllRead(user);
  }
}
