import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('notifications')
export class NotificationController {
  constructor(private notificationService: NotificationService) {}

  // User endpoints
  @UseGuards(JwtAuthGuard)
  @Get()
  getMyNotifications(@Req() req: any) {
    return this.notificationService.getUserNotifications(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('unread-count')
  getUnreadCount(@Req() req: any) {
    return this.notificationService.getUnreadCount(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id/read')
  markAsRead(@Req() req: any, @Param('id') id: string) {
    return this.notificationService.markAsRead(id, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Put('read-all')
  markAllAsRead(@Req() req: any) {
    return this.notificationService.markAllAsRead(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  deleteNotification(@Req() req: any, @Param('id') id: string) {
    return this.notificationService.deleteNotification(id, req.user.userId);
  }

  // Admin endpoints
  @Post('admin/send')
  async adminSend(@Body() body: { target: 'single' | 'multiple' | 'all'; userIds?: string[]; title: string; message: string; type?: string }) {
    const { target, userIds, title, message, type } = body;
    if (target === 'all') {
      return this.notificationService.sendToAll(title, message, type);
    } else if (target === 'multiple' && userIds?.length) {
      return this.notificationService.sendToUsers(userIds, title, message, type);
    } else if (target === 'single' && userIds?.[0]) {
      return this.notificationService.sendToUser(userIds[0], title, message, type);
    }
    return { error: 'Invalid target or missing userIds' };
  }

  @Get('admin/users')
  getAdminUsers() {
    return this.notificationService.getAllUsersForNotification();
  }
}
