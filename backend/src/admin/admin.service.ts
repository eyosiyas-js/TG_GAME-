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
      COMMISSION_BINGO: map.get('COMMISSION_BINGO') || '10',
      COMMISSION_RPS: map.get('COMMISSION_RPS') || '10',
      COMMISSION_DICE: map.get('COMMISSION_DICE') || '10',
      COMMISSION_GUESS: map.get('COMMISSION_GUESS') || '10',
      GAME_ENABLED_BINGO: map.get('GAME_ENABLED_BINGO') || 'true',
      GAME_ENABLED_RPS: map.get('GAME_ENABLED_RPS') || 'true',
      GAME_ENABLED_DICE: map.get('GAME_ENABLED_DICE') || 'true',
      GAME_ENABLED_GUESS: map.get('GAME_ENABLED_GUESS') || 'true',
      MAINTENANCE_MODE: map.get('MAINTENANCE_MODE') || 'false',
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

  async getRevenueAnalytics() {
    // Total revenue (all-time)
    const totalResult = await (this.prisma as any).transaction.aggregate({
      where: { type: 'COMMISSION' },
      _sum: { amount: true },
      _count: true,
    });

    // Today
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayResult = await (this.prisma as any).transaction.aggregate({
      where: { type: 'COMMISSION', createdAt: { gte: startOfToday } },
      _sum: { amount: true },
      _count: true,
    });

    // This week
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const weekResult = await (this.prisma as any).transaction.aggregate({
      where: { type: 'COMMISSION', createdAt: { gte: startOfWeek } },
      _sum: { amount: true },
      _count: true,
    });

    // This month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const monthResult = await (this.prisma as any).transaction.aggregate({
      where: { type: 'COMMISSION', createdAt: { gte: startOfMonth } },
      _sum: { amount: true },
      _count: true,
    });

    // Per-game breakdown
    const commissionTransactions = await (this.prisma as any).transaction.findMany({
      where: { type: 'COMMISSION', matchId: { not: null } },
      include: { match: { select: { gameType: true } } },
    });

    const byGame: Record<string, { total: number; count: number }> = {};
    for (const t of commissionTransactions) {
      const gt = t.match?.gameType || 'UNKNOWN';
      if (!byGame[gt]) byGame[gt] = { total: 0, count: 0 };
      byGame[gt].total += Number(t.amount);
      byGame[gt].count++;
    }

    const revenueByGame = Object.entries(byGame).map(([gameType, data]) => ({
      gameType,
      totalRevenue: Math.round(data.total * 100) / 100,
      matchCount: data.count,
      avgCommission: data.count > 0 ? Math.round((data.total / data.count) * 100) / 100 : 0,
    }));

    // Recent commissions
    const recentCommissions = await (this.prisma as any).transaction.findMany({
      where: { type: 'COMMISSION' },
      include: { match: { select: { gameType: true, stake: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return {
      totalRevenue: Number(totalResult._sum.amount || 0),
      totalCommissions: totalResult._count || 0,
      todayRevenue: Number(todayResult._sum.amount || 0),
      weekRevenue: Number(weekResult._sum.amount || 0),
      monthRevenue: Number(monthResult._sum.amount || 0),
      revenueByGame,
      recentCommissions: recentCommissions.map((t: any) => ({
        id: t.id,
        amount: Number(t.amount),
        gameType: t.match?.gameType || 'N/A',
        stake: Number(t.match?.stake || 0),
        createdAt: t.createdAt,
      })),
    };
  }

  async getGameStates() {
    const gameTypes = ['BINGO', 'RPS', 'DICE', 'GUESS'];
    const states: Record<string, boolean> = {};
    for (const gt of gameTypes) {
      states[gt] = await this.gameService.isGameEnabled(gt);
    }
    return states;
  }

  async getMaintenanceStatus() {
    const isMaintenanceMode = await this.gameService.isMaintenanceMode();
    const activeMatchCount = await (this.prisma as any).match.count({
      where: { status: 'PLAYING' },
    });
    return {
      maintenanceMode: isMaintenanceMode,
      activeMatchCount,
    };
  }
}
