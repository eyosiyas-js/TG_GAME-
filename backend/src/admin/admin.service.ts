import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GameService } from '../game/game.service';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService, private gameService: GameService) {}

  async getAllUsers() {
    return (this.prisma as any).user.findMany({
      include: { wallet: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateUserBan(id: string, isBanned: boolean) {
    return (this.prisma as any).user.update({
      where: { id },
      data: { isBanned },
    });
  }

  async updateUserBalance(userId: string, balance: number) {
    const numericBalance = Number(balance);
    return (this.prisma as any).wallet.upsert({
      where: { userId },
      update: { balance: numericBalance },
      create: { userId, balance: numericBalance },
    });
  }

  async getAllMatches() {
    return (this.prisma as any).match.findMany({
      include: {
        participants: { include: { user: { select: { username: true } } } },
        moves: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getSettings() {
    const settings = await (this.prisma as any).systemSetting.findMany();
    const map = new Map(settings.map((s: any) => [s.key, s.value]));
    return {
      DISCONNECT_TIMEOUT: map.get('DISCONNECT_TIMEOUT') || '60000',
      TURN_TIMER: map.get('TURN_TIMER') || '15000',
      BINGO_QUICK_PLAYERS: map.get('BINGO_QUICK_PLAYERS') || '4',
    };
  }

  async updateSetting(key: string, value: string) {
    return (this.prisma as any).systemSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }

  async getTableData(tableName: string) {
    const allowedModels: Record<string, string> = {
      User: 'user',
      SystemSetting: 'systemSetting',
      Wallet: 'wallet',
      Match: 'match',
      MatchMove: 'matchMove',
      MatchParticipant: 'matchParticipant',
      Transaction: 'transaction',
    };

    const modelName = allowedModels[tableName];
    if (!modelName) {
      throw new Error(`Invalid table name: ${tableName}`);
    }

    return (this.prisma as any)[modelName].findMany();
  }

  getLiveGames() {
    return this.gameService.getAdminLiveGames();
  }
}
