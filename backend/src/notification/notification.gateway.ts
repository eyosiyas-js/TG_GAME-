import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({ cors: { origin: '*' } })
export class NotificationGateway {
  @WebSocketServer()
  server: Server;

  sendNotificationToUser(userId: string, notification: any) {
    if (this.server) {
      this.server.to(userId).emit('notification', notification);
    }
  }

  sendNotificationToAll(notification: any) {
    if (this.server) {
      this.server.emit('notification', notification);
    }
  }
}
