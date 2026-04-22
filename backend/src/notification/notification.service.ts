import { Injectable, forwardRef, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationGateway } from './notification.gateway';
import { TelemetryService } from '../telemetry/telemetry.service';

@Injectable()
export class NotificationService {
  constructor(
    private prisma: PrismaService,
    private telemetryService: TelemetryService,
    @Inject(forwardRef(() => NotificationGateway)) private notificationGateway: NotificationGateway
  ) {}

  // ... (keep existing read/delete methods) ...
  // Get notifications for a user
  async getUserNotifications(userId: string) {
    return (this.prisma as any).notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  // Get unread count
  async getUnreadCount(userId: string): Promise<number> {
    return (this.prisma as any).notification.count({
      where: { userId, read: false },
    });
  }

  // Mark a single notification as read
  async markAsRead(notificationId: string, userId: string) {
    return (this.prisma as any).notification.updateMany({
      where: { id: notificationId, userId },
      data: { read: true },
    });
  }

  // Mark all notifications as read for a user
  async markAllAsRead(userId: string) {
    return (this.prisma as any).notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
  }

  // Delete a notification
  async deleteNotification(notificationId: string, userId: string) {
    return (this.prisma as any).notification.deleteMany({
      where: { id: notificationId, userId },
    });
  }

  // Admin: send notification to a single user
  async sendToUser(userId: string, title: string, message: string, type: string = 'system') {
    const notification = await (this.prisma as any).notification.create({
      data: { userId, title, message, type },
    });

    // Send to Telegram
    const user = await (this.prisma as any).user.findUnique({
      where: { id: userId },
      select: { telegramId: true }
    });

    if (user?.telegramId) {
      console.log(`[NotificationService] Sending Telegram message to user ${userId} (TG: ${user.telegramId})`);
      const tgMessage = `<b>${title}</b>\n\n${message}`;
      await this.telemetryService.sendMessageToUser(user.telegramId, tgMessage);
    } else {
      console.log(`[NotificationService] User ${userId} has no telegramId. Skipping Telegram delivery.`);
    }

    return notification;
  }

  // Admin: send notification to multiple users
  async sendToUsers(userIds: string[], title: string, message: string, type: string = 'system') {
    const data = userIds.map(userId => ({ userId, title, message, type }));
    await (this.prisma as any).notification.createMany({ data });
    
    // Fetch them back to get IDs and send them
    const newNotifications = await (this.prisma as any).notification.findMany({
      where: { userId: { in: userIds }, title, message, type },
      orderBy: { createdAt: 'desc' },
      take: userIds.length,
    });

    // Send to Telegram for each user
    const users = await (this.prisma as any).user.findMany({
      where: { id: { in: userIds } },
      select: { telegramId: true }
    });

    const tgMessage = `<b>${title}</b>\n\n${message}`;
    for (const user of users) {
      if (user.telegramId) {
        await this.telemetryService.sendMessageToUser(user.telegramId, tgMessage);
      }
    }

    return { count: data.length };
  }

  // Admin: send notification to all users
  async sendToAll(title: string, message: string, type: string = 'system') {
    const users = await (this.prisma as any).user.findMany({ 
      where: { isBot: false },
      select: { id: true, telegramId: true } 
    });
    
    const data = users.map((u: any) => ({ userId: u.id, title, message, type }));
    await (this.prisma as any).notification.createMany({ data });

    // Broadcast to Telegram
    const tgMessage = `<b>${title}</b>\n\n${message}`;
    for (const user of users) {
      if (user.telegramId) {
        await this.telemetryService.sendMessageToUser(user.telegramId, tgMessage);
      }
    }

    return { count: data.length };
  }

  // Admin: get all users (for the user selector in admin UI)
  async getAllUsersForNotification() {
    return (this.prisma as any).user.findMany({
      select: { id: true, username: true },
      orderBy: { username: 'asc' },
    });
  }
}
