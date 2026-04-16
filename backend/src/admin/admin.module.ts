import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { GameModule } from '../game/game.module';
import { AdminGateway } from './admin.gateway';

@Module({
  imports: [GameModule],
  controllers: [AdminController],
  providers: [AdminService, AdminGateway],
  exports: [AdminService, AdminGateway],
})
export class AdminModule {}
