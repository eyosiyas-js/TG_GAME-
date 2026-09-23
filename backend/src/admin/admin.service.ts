import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GameService } from '../game/game.service';
import * as bcrypt from 'bcrypt';
import { SendNotificationDto } from './dto/admin.dto';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => GameService))
    private gameService: GameService
  ) {}

  // ===================== AUDIT LOGGING =====================
  async logAction(apiKey: string, action: string, target: string, details: any = null, ipAddress: string) {
    await (this.prisma as any).auditLog.create({
      data: {
        apiKey,
        action,
        target,
        details,
        ipAddress,
      },
    });
  }

  // ===================== HELPER =====================
  private paginate(page: number, limit: number) {
    const skip = (page - 1) * limit;
    return { skip, take: limit };
  }

  private getPeriodDates(period?: string, start?: string, end?: string) {
    const defaultDays = 30;
    let startDate = new Date();
    let endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    if (start && end) {
      startDate = new Date(start);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(end);
      endDate.setHours(23, 59, 59, 999);
      return { start: startDate, end: endDate, label: 'custom' };
    }

    let days = defaultDays;
    if (period) {
      const match = period.match(/^(\d+)d$/);
      if (match) days = parseInt(match[1]);
    }

    startDate.setDate(endDate.getDate() - days + 1);
    startDate.setHours(0, 0, 0, 0);

    return { start: startDate, end: endDate, label: `${days}d` };
  }

  private generateDailySeries(start: Date, end: Date) {
    const series: { date: string }[] = [];
    const curr = new Date(start);
    while (curr <= end) {
      series.push({ date: curr.toISOString().split('T')[0] });
      curr.setDate(curr.getDate() + 1);
    }
    return series;
  }

  // ===================== AUDIT LOGS =====================
  async getAuditLogs(page: number, limit: number, action?: string, startDate?: string, endDate?: string) {
    const { skip, take } = this.paginate(page, limit);
    const where: any = {};
    if (action) where.action = action;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) {
        const endDay = new Date(endDate);
        endDay.setHours(23, 59, 59, 999);
        where.createdAt.lte = endDay;
      }
    }

    const total = await (this.prisma as any).auditLog.count({ where });
    const data = await (this.prisma as any).auditLog.findMany({
      where, skip, take, orderBy: { createdAt: 'desc' },
    });

    return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getAuditLogDetails(id: string) {
    const log = await (this.prisma as any).auditLog.findUnique({ where: { id } });
    if (!log) throw new NotFoundException('Audit log not found');
    return log;
  }

  // ===================== USER MANAGEMENT =====================
  async getAllUsers(page: number, limit: number) {
    const { skip, take } = this.paginate(page, limit);
    const where = { isBot: false };
    const total = await (this.prisma as any).user.count({ where });
    const data = await (this.prisma as any).user.findMany({
      where,
      skip,
      take,
      include: { wallet: true },
      orderBy: { createdAt: 'desc' },
    });

    return {
      data: data.map((u: any) => ({
        id: u.id,
        username: u.username,
        phoneNumber: u.phoneNumber,
        level: u.level,
        exp: u.exp,
        isBanned: u.isBanned,
        createdAt: u.createdAt,
        walletBalance: u.wallet?.balance || 0,
        botConfig: u.botConfig,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getUserDetails(id: string) {
    const user = await (this.prisma as any).user.findUnique({
      where: { id },
      include: { wallet: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateUserBan(id: string, isBanned: boolean, apiKey: string, ip: string) {
    const user = await (this.prisma as any).user.update({
      where: { id },
      data: { isBanned },
    });

    if (isBanned) {
      try {
        await (this.gameService as any).forceDisconnectUser(id);
      } catch (e) {
        console.error(`[ADMIN_SERVICE] Failed to force disconnect banned user ${id}:`, e);
      }
    }

    await this.logAction(apiKey, isBanned ? 'BAN_USER' : 'UNBAN_USER', id, null, ip);
    return user;
  }

  async updateUserBalance(id: string, balance: number, apiKey: string, ip: string) {
    const user = await (this.prisma as any).user.findUnique({
      where: { id },
      include: { wallet: true }
    });
    if (!user) throw new NotFoundException('User not found');

    const result = await (this.prisma as any).wallet.update({
      where: { userId: id },
      data: { balance },
    });

    await this.logAction(apiKey, 'UPDATE_USER_BALANCE', id, { oldBalance: user.wallet?.balance, newBalance: balance }, ip);
    return result;
  }

  async registerPlayer(data: any, apiKey: string, ip: string) {
    const existing = await this.prisma.user.findUnique({ where: { phoneNumber: data.phoneNumber } });
    if (existing) throw new ConflictException('Phone number already registered');
    
    // Hash exactly as standard auth does
    const passwordHash = data.password ? await bcrypt.hash(data.password, 10) : await bcrypt.hash('defaultpass123', 10);
    
    const user = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          username: data.username,
          phoneNumber: data.phoneNumber,
          passwordHash,
          isBot: false,
        },
      });

      await tx.wallet.create({
        data: {
          userId: newUser.id,
          balance: 0.00,
          bonusBalance: 0.00,
        },
      });

      return newUser;
    });

    await this.logAction(apiKey, 'CREATE_PLAYER', user.id, { username: user.username }, ip);
    return user;
  }

  async deleteUser(id: string, apiKey: string, ip: string) {
    const user = await (this.prisma as any).user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    try {
      await (this.gameService as any).forceDisconnectUser(id);
    } catch (e) {
      console.error(`[ADMIN_SERVICE] Failed to force disconnect leaving user ${id}:`, e);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await (tx as any).matchMove.deleteMany({ where: { userId: id } });
      await (tx as any).matchParticipant.deleteMany({ where: { userId: id } });
      await (tx as any).transaction.deleteMany({ where: { userId: id } });
      await (tx as any).notification.deleteMany({ where: { userId: id } });
      await (tx as any).depositRequest.deleteMany({ where: { userId: id } });
      await (tx as any).withdrawalRequest.deleteMany({ where: { userId: id } });
      await (tx as any).wallet.deleteMany({ where: { userId: id } });
      
      return (tx as any).user.delete({ where: { id } });
    });

    await this.logAction(apiKey, 'DELETE_USER', id, null, ip);
    return { success: true, deletedUser: result };
  }

  async targetUserForBots(id: string, forceBotMatch: boolean, apiKey: string, ip: string) {
    const user = await (this.prisma as any).user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    const updated = await (this.prisma as any).user.update({
      where: { id },
      data: {
        botConfig: {
          ...(user.botConfig as object || {}),
          forceBotMatch,
        },
      },
      select: { id: true, botConfig: true }
    });

    await this.logAction(apiKey, forceBotMatch ? 'TARGET_USER_BOTS' : 'UNTARGET_USER_BOTS', id, null, ip);
    return { success: true, forceBotMatch: updated.botConfig?.forceBotMatch };
  }

  async getUserActivity(id: string) {
    return (this.prisma as any).matchParticipant.findMany({
      where: { userId: id },
      include: { match: { include: { participants: { include: { user: { select: { username: true, isBot: true } } } } } } },
      orderBy: { match: { createdAt: 'desc' } },
      take: 50,
    });
  }

  async getUserTransactions(id: string) {
    return (this.prisma as any).transaction.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  // ===================== REFERRAL MANAGEMENT =====================
  async getReferralStats(page: number, limit: number) {
    const { skip, take } = this.paginate(page, limit);
    
    const users = await (this.prisma as any).user.findMany({
      where: { isBot: false },
      select: {
        id: true,
        username: true,
        phoneNumber: true,
        isInfluencer: true,
        _count: {
          select: { referrals: true }
        },
        wallet: {
          select: { balance: true }
        }
      },
      orderBy: {
        referrals: { _count: 'desc' }
      },
      skip,
      take,
    });

    const total = await (this.prisma as any).user.count({ where: { isBot: false } });

    const formattedData = users.map((u: any) => ({
      id: u.id,
      username: u.username,
      phoneNumber: u.phoneNumber,
      isInfluencer: u.isInfluencer,
      referralCount: u._count.referrals,
      totalEarnings: Number(u.wallet?.balance || 0),
    }));

    return {
      data: formattedData,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
    };
  }

  async toggleInfluencerStatus(userId: string, isInfluencer: boolean, apiKey: string, ip: string) {
    const user = await (this.prisma as any).user.update({
      where: { id: userId },
      data: { isInfluencer },
    });

    await this.logAction(apiKey, isInfluencer ? 'SET_INFLUENCER' : 'REMOVE_INFLUENCER', userId, null, ip);
    return user;
  }

  // ===================== DEPOSIT MANAGEMENT =====================
  async getAllDeposits(page: number, limit: number, status?: string) {
    const { skip, take } = this.paginate(page, limit);
    const where: any = {};
    if (status) where.status = status;

    const total = await (this.prisma as any).depositRequest.count({ where });
    const data = await (this.prisma as any).depositRequest.findMany({
      where, skip, take,
      include: { user: { select: { username: true, phoneNumber: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getDepositDetails(id: string) {
    const deposit = await (this.prisma as any).depositRequest.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!deposit) throw new NotFoundException('Deposit not found');
    return deposit;
  }

  async approveDeposit(id: string, apiKey: string, ip: string, notes?: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const deposit = await (tx as any).depositRequest.findUnique({ where: { id } });
      if (!deposit || deposit.status !== 'PENDING') {
        throw new BadRequestException('Deposit not found or not pending');
      }

      await (tx as any).depositRequest.update({
        where: { id },
        data: { status: 'APPROVED' },
      });

      await (tx as any).wallet.update({
        where: { userId: deposit.userId },
        data: { balance: { increment: deposit.amount } },
      });

      await (tx as any).transaction.create({
        data: {
          userId: deposit.userId,
          amount: deposit.amount,
          type: 'DEPOSIT',
          status: 'APPROVED',
          approvedBy: apiKey,
          approvedAt: new Date(),
        },
      });

      return deposit;
    });

    await this.logAction(apiKey, 'APPROVE_DEPOSIT', id, { amount: result.amount, notes }, ip);
    return { success: true };
  }

  async rejectDeposit(id: string, reason: string, apiKey: string, ip: string) {
    const deposit = await (this.prisma as any).depositRequest.findUnique({ where: { id } });
    if (!deposit || deposit.status !== 'PENDING') {
      throw new BadRequestException('Deposit not found or not pending');
    }

    await (this.prisma as any).depositRequest.update({
      where: { id },
      data: { status: 'REJECTED' },
    });
    await this.logAction(apiKey, 'REJECT_DEPOSIT', id, { reason }, ip);
    return { success: true };
  }

  async resetCommissions(apiKey: string, ip: string) {
    // Drop all strictly 'COMMISSION' flagged transactions
    await (this.prisma as any).transaction.deleteMany({
      where: { type: 'COMMISSION' }
    });
    await this.logAction(apiKey, 'RESET_COMMISSIONS', 'global', {}, ip);
    return { success: true, message: 'All commission transactions purged.' };
  }

  // ===================== WITHDRAWAL MANAGEMENT =====================
  async getAllWithdrawals(page: number, limit: number, status?: string) {
    const { skip, take } = this.paginate(page, limit);
    const where: any = {};
    if (status) where.status = status;

    const total = await (this.prisma as any).withdrawalRequest.count({ where });
    const data = await (this.prisma as any).withdrawalRequest.findMany({
      where, skip, take,
      include: { user: { select: { username: true, phoneNumber: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }


  async getWithdrawalDetails(id: string) {
    const withdrawal = await (this.prisma as any).withdrawalRequest.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');
    return withdrawal;
  }

  async approveWithdrawal(id: string, apiKey: string, ip: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const withdrawal = await (tx as any).withdrawalRequest.findUnique({ where: { id } });
      if (!withdrawal || withdrawal.status !== 'PENDING') {
        throw new BadRequestException('Withdrawal not found or not pending');
      }

      await (tx as any).withdrawalRequest.update({
        where: { id },
        data: { status: 'APPROVED' },
      });

      await (tx as any).transaction.create({
        data: {
          userId: withdrawal.userId,
          amount: -Number(withdrawal.amount),
          type: 'WITHDRAW',
          status: 'APPROVED',
          approvedBy: apiKey,
          approvedAt: new Date(),
        },
      });

      return withdrawal;
    });

    await this.logAction(apiKey, 'APPROVE_WITHDRAWAL', id, { amount: result.amount }, ip);
    return { success: true };
  }

  async rejectWithdrawal(id: string, reason: string, apiKey: string, ip: string) {
    const withdrawal = await (this.prisma as any).withdrawalRequest.findUnique({ where: { id } });
    if (!withdrawal || withdrawal.status !== 'PENDING') {
      throw new BadRequestException('Withdrawal not found or not pending');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const req = await (tx as any).withdrawalRequest.update({
        where: { id },
        data: { status: 'REJECTED' },
      });

      await (tx as any).wallet.update({
        where: { userId: req.userId },
        data: { balance: { increment: req.amount } },
      });

      return req;
    });

    await this.logAction(apiKey, 'REJECT_WITHDRAWAL', id, { reason }, ip);
    return result;
  }

  async getAllTransactions(page: number, limit: number, status?: string) {
    const { skip, take } = this.paginate(page, limit);
    const where: any = {};
    if (status) where.status = status;

    const total = await (this.prisma as any).transaction.count({ where });
    const data = await (this.prisma as any).transaction.findMany({
      where,
      skip,
      take,
      include: { user: { select: { username: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return { 
      data: data.map((t: any) => ({
        id: t.id,
        userId: t.userId,
        username: t.user?.username,
        amount: Number(t.amount),
        type: t.type,
        status: t.status,
        createdAt: t.createdAt,
        method: t.method,
        senderName: t.senderName,
        transactionId: t.transactionId,
        phoneNumber: t.phoneNumber,
        withdrawTo: t.withdrawTo,
        receiptUrl: t.receiptUrl
      })), 
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } 
    };
  }

  // ===================== MATCH HISTORY =====================
  async getAllMatches(page: number, limit: number, gameType?: string) {
    const { skip, take } = this.paginate(page, limit);
    const where: any = {};
    if (gameType) {
      where.gameType = gameType.toUpperCase();
    }
    const total = await (this.prisma as any).match.count({ where });
    const rawData = await (this.prisma as any).match.findMany({
      where,
      skip, take,
      include: { participants: { include: { user: { select: { username: true, isBot: true } } } } },
      orderBy: { createdAt: 'desc' },
    });

    const data = rawData.map((m: any) => {
      let winnerName = null;
      let winnerIsBot = false;
      if (m.winnerId) {
        const wp = m.participants.find((p: any) => p.userId === m.winnerId);
        if (wp && wp.user) {
          winnerName = wp.user.username;
          winnerIsBot = wp.user.isBot || false;
        }
      }
      
      const betAmount = Number(m.stake || 0);
      let winAmount = 0;
      if (m.winnerId && m.participants) {
         // rough calculation based on total stake minus some commission
         const totalPot = betAmount * m.participants.length;
         winAmount = totalPot * 0.9; // Assuming 10% commission
      }

      return {
        ...m,
        winnerName,
        winnerIsBot,
        betAmount,
        winAmount
      };
    });

    return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getMatchStats() {
    const totalMatches = await (this.prisma as any).match.count();
    const activeMatches = await (this.prisma as any).match.count({ where: { status: 'PLAYING' } });
    return { totalMatches, activeMatches };
  }

  async getMatchDetails(id: string) {
    return (this.prisma as any).match.findUnique({
      where: { id },
      include: {
        participants: { include: { user: { select: { username: true } } } },
        moves: { include: { user: { select: { username: true } } } },
      },
    });
  }

  async getGameMoves(page: number, limit: number, gameType?: string) {
    const { skip, take } = this.paginate(page, limit);
    const where: any = {};
    if (gameType) {
      where.match = { gameType };
    }

    const total = await (this.prisma as any).matchMove.count({ where });
    const data = await (this.prisma as any).matchMove.findMany({
      where,
      skip,
      take,
      include: {
        user: { select: { username: true } },
        match: { select: { gameType: true, createdAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  // ===================== ACTIVE GAMES =====================
  getLiveGames() {
    return this.gameService.getAdminLiveGames();
  }

  async getActiveGameDetails(gameId: string) {
    const games = await this.gameService.getAdminLiveGames();
    return games.find((g: any) => g.id === gameId);
  }

  async forceEndGame(gameId: string, apiKey: string, ip: string) {
    // Requires gameService to implement forceEndGame, or we just update DB.
    // For safety, let's just update DB if there's no game logic available.
    // The socket might still be open, ideally gameService should handle this.
    // Assuming gameService has forceEndMatch:
    // await this.gameService.forceEndMatch(gameId); // if exists
    
    const match = await (this.prisma as any).match.update({
      where: { id: gameId },
      data: { status: 'FINISHED', endedAt: new Date() },
    });
    
    await this.logAction(apiKey, 'FORCE_END_GAME', gameId, null, ip);
    return match;
  }

  // ===================== REVENUE ANALYTICS =====================
  async getRevenueOverview() {
    const totalResult = await (this.prisma as any).transaction.aggregate({
      where: { type: 'COMMISSION' },
      _sum: { amount: true },
      _count: true,
    });
    return {
      totalRevenue: Number(totalResult._sum.amount || 0),
      totalCommissions: totalResult._count || 0,
    };
  }

  async getDailyRevenue() {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayResult = await (this.prisma as any).transaction.aggregate({
      where: { type: 'COMMISSION', createdAt: { gte: startOfToday } },
      _sum: { amount: true },
    });
    return { todayRevenue: Number(todayResult._sum.amount || 0) };
  }

  async getMonthlyRevenue() {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const monthResult = await (this.prisma as any).transaction.aggregate({
      where: { type: 'COMMISSION', createdAt: { gte: startOfMonth } },
      _sum: { amount: true },
    });
    return { monthRevenue: Number(monthResult._sum.amount || 0) };
  }

  async getRevenueByGame() {
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
    return Object.entries(byGame).map(([gameType, data]) => ({
      gameType,
      totalRevenue: Math.round(data.total * 100) / 100,
      matchCount: data.count,
    }));
  }

  async getDetailedRevenue(period?: string, startDate?: string, endDate?: string) {
    const { start, end, label } = this.getPeriodDates(period, startDate, endDate);
    
    const deposits = await (this.prisma as any).transaction.aggregate({
      where: { type: 'DEPOSIT', status: 'APPROVED', createdAt: { gte: start, lte: end } },
      _sum: { amount: true },
    });
    
    const withdrawals = await (this.prisma as any).transaction.aggregate({
      where: { type: 'WITHDRAW', status: 'APPROVED', createdAt: { gte: start, lte: end } },
      _sum: { amount: true },
    });
    
    const commissions = await (this.prisma as any).transaction.aggregate({
      where: { type: 'COMMISSION', createdAt: { gte: start, lte: end } },
      _sum: { amount: true },
    });

    const totDeposits = Number(deposits._sum.amount || 0);
    const totWithdrawals = Math.abs(Number(withdrawals._sum.amount || 0));
    const totCommission = Number(commissions._sum.amount || 0);

    const txs = await (this.prisma as any).transaction.findMany({
      where: { 
        type: { in: ['DEPOSIT', 'WITHDRAW', 'COMMISSION'] },
        status: { in: ['APPROVED', 'PENDING'] }, 
        createdAt: { gte: start, lte: end } 
      },
      select: { createdAt: true, type: true, amount: true, status: true }
    });

    const dailyMap: Record<string, { deposits: number; withdrawals: number, commission: number }> = {};
    const series = this.generateDailySeries(start, end);
    series.forEach(d => dailyMap[d.date] = { deposits: 0, withdrawals: 0, commission: 0 });

    for (const t of txs) {
      const dateStr = t.createdAt.toISOString().split('T')[0];
      if (dailyMap[dateStr]) {
        const amt = Number(t.amount);
        if (t.type === 'DEPOSIT' && t.status === 'APPROVED') dailyMap[dateStr].deposits += amt;
        if (t.type === 'WITHDRAW' && t.status === 'APPROVED') dailyMap[dateStr].withdrawals += Math.abs(amt);
        if (t.type === 'COMMISSION') dailyMap[dateStr].commission += amt;
      }
    }

    return {
      period: { start: start.toISOString(), end: end.toISOString(), label },
      totals: { deposits: totDeposits, withdrawals: totWithdrawals, commission: totCommission, netRevenue: totDeposits - totWithdrawals },
      dailyData: Object.entries(dailyMap).map(([date, d]) => ({ date, ...d })).sort((a,b) => a.date.localeCompare(b.date))
    };
  }

  async getRevenueTrends(daysStr?: string, groupBy: string = 'week') {
    const days = parseInt(daysStr || '30');
    const { start, end } = this.getPeriodDates(`${days}d`);
    
    let dateFormat = 'YYYY-MM-DD';
    if (groupBy === 'week') dateFormat = 'IYYY-IW';
    if (groupBy === 'month') dateFormat = 'YYYY-MM';

    const rawData = await this.prisma.$queryRawUnsafe(`
      SELECT 
        to_char("createdAt", $1) as date_group,
        SUM(CASE WHEN type = 'DEPOSIT' AND status = 'APPROVED' THEN amount ELSE 0 END) as deposits,
        SUM(CASE WHEN type = 'WITHDRAW' AND status = 'APPROVED' THEN ABS(amount) ELSE 0 END) as withdrawals,
        COUNT(CASE WHEN type = 'DEPOSIT' AND status = 'APPROVED' THEN 1 END) as deposit_count,
        COUNT(CASE WHEN type = 'WITHDRAW' AND status = 'APPROVED' THEN 1 END) as withdrawal_count
      FROM "Transaction"
      WHERE "createdAt" >= $2 AND "createdAt" <= $3
      GROUP BY date_group
      ORDER BY date_group ASC
    `, dateFormat, start, end);

    let totD = 0; let totW = 0;
    const mappedData = (rawData as any[]).map(row => {
      const d = Number(row.deposits || 0);
      const w = Number(row.withdrawals || 0);
      totD += d; totW += w;
      return {
        date_group: row.date_group,
        deposits: d,
        withdrawals: w,
        deposit_count: Number(row.deposit_count || 0),
        withdrawal_count: Number(row.withdrawal_count || 0)
      };
    });

    return {
      period: `${days} days`,
      groupBy,
      data: mappedData,
      summary: { totalDeposits: totD, totalWithdrawals: totW, netRevenue: totD - totW }
    };
  }

  async getCommissionAnalytics(period?: string, startDate?: string, endDate?: string) {
    const { start, end, label } = this.getPeriodDates(period, startDate, endDate);

    const txs = await (this.prisma as any).transaction.findMany({
      where: { type: 'COMMISSION', createdAt: { gte: start, lte: end } },
      include: { match: { select: { gameType: true } } }
    });

    const dailyMap: Record<string, { commission: number, matches: number }> = {};
    const gameMap: Record<string, { commission: number, matches: number }> = {};
    const series = this.generateDailySeries(start, end);
    series.forEach(d => dailyMap[d.date] = { commission: 0, matches: 0 });

    let totalCommission = 0;
    let totalMatches = 0;

    for (const t of txs) {
      const dateStr = t.createdAt.toISOString().split('T')[0];
      const amt = Number(t.amount);
      const gt = t.match?.gameType || 'UNKNOWN';

      if (dailyMap[dateStr]) {
        dailyMap[dateStr].commission += amt;
        dailyMap[dateStr].matches++;
      }

      if (!gameMap[gt]) gameMap[gt] = { commission: 0, matches: 0 };
      gameMap[gt].commission += amt;
      gameMap[gt].matches++;

      totalCommission += amt;
      totalMatches++;
    }

    const topGames = Object.entries(gameMap)
      .map(([gameType, d]) => ({ gameType, ...d }))
      .sort((a,b) => b.commission - a.commission)
      .slice(0, 5);

    return {
      period: label,
      total: { commission: totalCommission, matches: totalMatches },
      dailyData: Object.entries(dailyMap).map(([date, d]) => ({ date, ...d })).sort((a,b) => a.date.localeCompare(b.date)),
      topGames
    };
  }

  async getFinancialReport(startDate?: string, endDate?: string) {
    const { start, end } = this.getPeriodDates('all', startDate, endDate);
    
    const [deposits, withdrawals, commissions] = await Promise.all([
      (this.prisma as any).transaction.aggregate({
        where: { type: 'DEPOSIT', status: 'APPROVED', createdAt: { gte: start, lte: end } },
        _sum: { amount: true },
        _count: true,
      }),
      (this.prisma as any).transaction.aggregate({
        where: { type: 'WITHDRAW', status: 'APPROVED', createdAt: { gte: start, lte: end } },
        _sum: { amount: true },
        _count: true,
      }),
      (this.prisma as any).transaction.aggregate({
        where: { type: 'COMMISSION', createdAt: { gte: start, lte: end } },
        _sum: { amount: true },
      }),
    ]);

    const totalDeposited = Number(deposits._sum.amount || 0);
    const totalWithdrawn = Math.abs(Number(withdrawals._sum.amount || 0));
    const totalCommission = Number(commissions._sum.amount || 0);

    return {
      period: { start: start.toISOString(), end: end.toISOString() },
      summary: {
        totalDeposited,
        totalWithdrawn,
        netRevenue: totalDeposited - totalWithdrawn,
        netProfit: totalCommission, // User: net profit is the commission
        depositCount: deposits._count,
        withdrawalCount: withdrawals._count,
      },
    };
  }

  // ===================== SYSTEM SETTINGS =====================
  async getSettings() {
    const settings = await (this.prisma as any).systemSetting.findMany();
    const result: Record<string, string> = {};
    settings.forEach((s: any) => {
      result[s.key] = s.value;
    });
    return result;
  }

  async getMaintenanceStatus() {
    const maintenanceSetting = await (this.prisma as any).systemSetting.findUnique({
      where: { key: 'MAINTENANCE_MODE' }
    });
    const maintenanceMode = maintenanceSetting ? maintenanceSetting.value === 'true' : false;
    const liveGames = await this.gameService.getAdminLiveGames();
    return {
      maintenanceMode,
      activeMatchCount: liveGames.length
    };
  }

  async updateSetting(key: string, value: string, apiKey: string, ip: string) {
    const setting = await (this.prisma as any).systemSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
    await this.logAction(apiKey, 'UPDATE_SETTING', key, { value }, ip);
    return setting;
  }

  async updateMultipleSettings(settings: Record<string, string>, apiKey: string, ip: string) {
    const results: any[] = [];
    for (const [key, value] of Object.entries(settings)) {
      results.push(await this.updateSetting(key, value, apiKey, ip));
    }
    return results;
  }

  // ===================== NOTIFICATIONS =====================
  async sendNotification(dto: SendNotificationDto, apiKey: string, ip: string) {
    let users: { id: string }[] = [];
    if (dto.targetUsers === 'all') {
      users = await (this.prisma as any).user.findMany({ select: { id: true } });
    } else if (dto.targetUsers === 'specific' && dto.userIds) {
      users = dto.userIds.map(id => ({ id }));
    }

    if (users.length > 0) {
      await (this.prisma as any).notification.createMany({
        data: users.map(u => ({
          userId: u.id,
          title: dto.title,
          message: dto.body,
          type: 'ADMIN_BROADCAST',
        })),
        skipDuplicates: true,
      });
    }
    
    await this.logAction(apiKey, 'SEND_NOTIFICATION', 'MULTIPLE', { dto, count: users.length }, ip);
    return { success: true, sentCount: users.length };
  }

  async getUsersForNotifications() {
    const users = await (this.prisma as any).user.findMany({
      where: { isBot: false },
      select: { id: true, username: true }
    });
    return users;
  }

  async getNotificationHistory(page: number, limit: number) {
    const { skip, take } = this.paginate(page, limit);
    const total = await (this.prisma as any).notification.count({ where: { type: 'ADMIN_BROADCAST' }});
    const data = await (this.prisma as any).notification.findMany({
      where: { type: 'ADMIN_BROADCAST' },
      skip, take,
      orderBy: { createdAt: 'desc' },
    });
    return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  // ===================== BOT MANAGEMENT =====================
  async getBotStats() {
    return (this.gameService as any).getBotStats();
  }

  async spawnBots(count: number, type: string = 'NORMAL', gameType: string = 'BINGO') {
    return (this.gameService as any).spawnBots(count, type, gameType);
  }

  async updateBotConfig(botId: string, config: any, apiKey: string, ip: string) {
    const result = await (this.gameService as any).updateBotConfig(botId, config);
    await this.logAction(apiKey, 'UPDATE_BOT_CONFIG', botId, config, ip);
    return result;
  }

  async deleteBot(botId: string, apiKey: string, ip: string) {
    const result = await (this.gameService as any).deleteBot(botId);
    await this.logAction(apiKey, 'DELETE_BOT', botId, null, ip);
    return result;
  }

  async setBotActiveStatus(botId: string, enabled: boolean, apiKey: string, ip: string) {
    const result = await (this.gameService as any).setBotActiveStatus(botId, enabled);
    await this.logAction(apiKey, enabled ? 'START_BOT' : 'STOP_BOT', botId, null, ip);
    return result;
  }

  // ===================== BOT TARGET COUNTS =====================
  async getBotTargetCounts() {
    const settings = await (this.prisma as any).systemSetting.findMany({
      where: { key: { startsWith: 'BOT_TARGET_COUNT_' } }
    });
    
    // Default values if settings not found
    const targets: Record<string, number> = {
      'BINGO_NORMAL': 4,
      'BINGO_CHEATER': 4,
      'RPS_NORMAL': 4,
      'RPS_CHEATER': 4,
      'DICE_NORMAL': 4,
      'DICE_CHEATER': 4
    };

    settings.forEach((s: any) => {
      const gameTypeKey = s.key.replace('BOT_TARGET_COUNT_', '');
      targets[gameTypeKey] = parseInt(s.value);
    });

    return targets;
  }

  async updateBotTargetCounts(targets: Record<string, number>, apiKey: string, ip: string) {
    const results: any[] = [];
    for (const [gameTypeKey, count] of Object.entries(targets)) {
      const key = `BOT_TARGET_COUNT_${gameTypeKey}`;
      results.push(await this.updateSetting(key, count.toString(), apiKey, ip));
    }
    return { success: true, updated: results.length };
  }

  getBotSystemStatus() {
    return (this.gameService as any).getBotSystemStatus();
  }

  async startBotSystem(apiKey: string, ip: string) {
    try {
      await this.prisma.$executeRawUnsafe(`
        UPDATE "User"
        SET "botConfig" = jsonb_set("botConfig", '{enabled}', 'true')
        WHERE "isBot" = true
      `);
      await (this.gameService as any).startBotSystem();
      await this.logAction(apiKey, 'START_BOT_SYSTEM', 'ALL', null, ip);
      return { success: true };
    } catch (e) {
      console.error('[ADMIN_SERVICE] startBotSystem error:', e);
      throw e;
    }
  }

  async stopBotSystem(apiKey: string, ip: string) {
    try {
      await this.prisma.$executeRawUnsafe(`
        UPDATE "User"
        SET "botConfig" = jsonb_set("botConfig", '{enabled}', 'false')
        WHERE "isBot" = true
      `);
      await (this.gameService as any).stopBotSystem();
      await this.logAction(apiKey, 'STOP_BOT_SYSTEM', 'ALL', null, ip);
      return { success: true };
    } catch (e) {
      console.error('[ADMIN_SERVICE] stopBotSystem error:', e);
      throw e;
    }
  }
}
