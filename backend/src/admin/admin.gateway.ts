import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: 'admin',
})
@Injectable()
export class AdminGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AdminGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`Admin client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Admin client disconnected: ${client.id}`);
  }

  broadcastRegistration(userData: any) {
    this.logger.log(`Broadcasting new registration: ${userData.username || userData.phoneNumber}`);
    this.server.emit('user_registered', userData);
  }

  broadcastDeposit(depositData: any) {
    this.server.emit('new_deposit', depositData);
  }

  broadcastWithdrawal(withdrawalData: any) {
    this.server.emit('new_withdrawal', withdrawalData);
  }
}
