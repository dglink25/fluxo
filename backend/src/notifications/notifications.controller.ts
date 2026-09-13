import { Controller, Get, Patch, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  /** Liste des notifications (toutes, lues ou non) */
  @Get()
  findAll(@CurrentUser() user: any) {
    return this.notificationsService.findUnread(user.userId);
  }

  /** Nombre de notifications non lues */
  @Get('unread-count')
  countUnread(@CurrentUser() user: any) {
    return this.notificationsService.countUnread(user.userId).then((count) => ({ count }));
  }

  /** Marquer toutes les notifications comme lues */
  @Patch('read-all')
  markAllRead(@CurrentUser() user: any) {
    return this.notificationsService.markRead(user.userId);
  }

  /** Marquer une notification spécifique comme lue */
  @Patch(':id/read')
  markRead(@CurrentUser() user: any, @Param('id') id: string) {
    return this.notificationsService.markRead(user.userId, id);
  }
}
