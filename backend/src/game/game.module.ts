import { Module } from '@nestjs/common';
import { GameService } from './game.service';
import { GameGateway } from './game.gateway';
import { GameController } from './game.controller';
import { WalletModule } from '../wallet/wallet.module';
import { AuthModule } from '../auth/auth.module';
import { JwtModule } from '@nestjs/jwt';
import { BotPoolManager } from './bot-pool.manager';
import { BotPlayerClient } from './bot-player.client';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    WalletModule,
    AuthModule,
    ScheduleModule.forRoot(),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'super-secret',
      signOptions: { expiresIn: '1d' },
    }),
  ],
  providers: [GameService, GameGateway, BotPoolManager, BotPlayerClient],
  controllers: [GameController],
  exports: [GameService],
})
export class GameModule {}
