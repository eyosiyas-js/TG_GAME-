import { Injectable, Inject, forwardRef, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { GameType } from '@prisma/client';
import { BotPoolManager } from './bot-pool.manager';
import { GameGateway } from './game.gateway';

export interface DiceState {
  p1: string;
  p2: string;
  p1Rolls: number;
  p2Rolls: number;
  p1Score: number;
  p2Score: number;
  p1Done: boolean;
  p2Done: boolean;
  p1LastRoll: [number, number] | null;
  p2LastRoll: [number, number] | null;
}

@Injectable()
export class GameService implements OnModuleInit {
  private queues: Map<string, string[]> = new Map(); // gameType_stake -> [userIds]
  private bingoQueueTimers: Map<string, NodeJS.Timeout> = new Map(); // key -> fill timer
  private bingoQueueCallbacks: Map<string, (playerIds: string[]) => void> = new Map();

  // Turn-based Bingo state
  private bingoGames: Map<string, {
    players: { userId: string; board: number[] }[];
    calledNumbers: number[];
    currentTurnIndex: number;
    turnOrder: string[];
    forfeitedPlayers: string[];
    winnerId: string | null;
    paused: boolean;
  }> = new Map();

  private onBingoGameStartListeners: ((matchId: string, playerIds: string[]) => void)[] = [];
  private onMatchStartListeners: ((matchId: string, playerIds: string[], gameType: string) => void)[] = [];
  private onMatchFinishListeners: ((matchId: string, playerIds: string[], gameType: string) => void)[] = [];

  private diceGames: Map<string, DiceState> = new Map(); // matchId -> DiceState

  constructor(
    private prisma: PrismaService,
    private walletService: WalletService,
    @Inject(forwardRef(() => BotPoolManager))
    private botPoolManager: BotPoolManager,
    @Inject(forwardRef(() => GameGateway))
    private gameGateway: GameGateway,
  ) {}

  async onModuleInit() {
    // Register the deferred referral bonus listener
    this.onMatchFinish(async (_matchId, playerIds, _gameType) => {
      await this.processReferralBonuses(playerIds);
    });
  }

  /**
   * Deferred referral bonus: award the invitor 10.00 ETB when the
   * referred user completes their FIRST game (any game type).
   * Limited to 5 paid referrals per invitor (unlimited for influencers).
   */
  private async processReferralBonuses(playerIds: string[]) {
    for (const userId of playerIds) {
      try {
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, referredById: true, referralBonusPaid: true, phoneNumber: true, isBot: true },
        });

        // Skip bots, users without a referrer, or already-paid bonuses
        if (!user || user.isBot || !user.referredById || user.referralBonusPaid) continue;

        const invitor = await this.prisma.user.findUnique({
          where: { id: user.referredById },
          select: { id: true, isInfluencer: true },
        });
        if (!invitor) continue;

        // Count how many referral bonuses have already been paid for this invitor
        const paidReferralCount = await this.prisma.user.count({
          where: { referredById: invitor.id, referralBonusPaid: true },
        });

        // Only pay for the first 5 referrals (unlimited for influencers)
        if (paidReferralCount >= 5 && !invitor.isInfluencer) {
          // Mark as processed so we don't re-check every game
          await this.prisma.user.update({
            where: { id: userId },
            data: { referralBonusPaid: true },
          });
          continue;
        }

        // Award the bonus inside a transaction
        await this.prisma.$transaction(async (tx) => {
          await tx.wallet.update({
            where: { userId: invitor.id },
            data: { bonusBalance: { increment: 10.00 } },
          });

          await tx.transaction.create({
            data: {
              userId: invitor.id,
              amount: 10.00,
              type: 'REFERRAL',
              status: 'APPROVED',
              referenceCode: `Invited: ${user.phoneNumber}`,
            },
          });

          await tx.user.update({
            where: { id: userId },
            data: { referralBonusPaid: true },
          });
        });

        console.log(`[REFERRAL] Awarded 10.00 ETB to invitor ${invitor.id} for referred user ${userId} completing first game`);
      } catch (err) {
        console.error(`[REFERRAL] Error processing referral bonus for user ${userId}:`, err);
      }
    }
  }

  async getSetting(key: string, defaultValue: string) {
    const s = await (this.prisma as any).systemSetting.findUnique({ where: { key } });
    return s ? s.value : defaultValue;
  }

  async getTurnTimeMs() { return parseInt(await this.getSetting('TURN_TIMER', '15000'), 10) || 15000; }
  async getDisconnectTimeMs() { return parseInt(await this.getSetting('DISCONNECT_TIMEOUT', '60000'), 10) || 60000; }
  async getBingoQuickPlayers() { return parseInt(await this.getSetting('BINGO_QUICK_PLAYERS', '4'), 10) || 4; }

  async getBetAmounts(): Promise<number[]> {
    const raw = await this.getSetting('BET_AMOUNTS', '50,100,300,500');
    return raw.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0);
  }

  async getCommissionRate(gameType: string): Promise<number> {
    const pct = parseFloat(await this.getSetting(`COMMISSION_${gameType}`, '10'));
    return (isNaN(pct) ? 10 : pct) / 100;
  }

  async isGameEnabled(gameType: string): Promise<boolean> {
    const val = await this.getSetting(`GAME_ENABLED_${gameType}`, 'true');
    return val !== 'false';
  }

  async isMaintenanceMode(): Promise<boolean> {
    const val = await this.getSetting('MAINTENANCE_MODE', 'false');
    return val === 'true';
  }

  async getActiveBanner() {
    return (this.prisma as any).banner.findFirst({
      where: { isActive: true },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async getUserTotalBalance(userId: string): Promise<number> {
    const w = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!w) return 0;
    return Number(w.balance) + Number((w as any).bonusBalance || 0);
  }
  private applyCommission(totalPot: number, commissionRate: number): { winAmount: number; commission: number } {
    const commission = Math.floor(totalPot * commissionRate * 100) / 100;
    const winAmount = totalPot - commission;
    return { winAmount, commission };
  }

  async getAdminLiveGames() {
    const matches = await this.prisma.match.findMany({
      where: { status: 'PLAYING' },
      include: {
        participants: { include: { user: { select: { username: true } } } },
      },
    });
    
    return matches.map(m => {
      let extra = {};
      if (m.gameType === 'BINGO') {
        const state = this.bingoGames.get(m.id);
        if (state)extra = { paused: state.paused, turnIndex: state.currentTurnIndex, calledCount: state.calledNumbers.length };
      }
      return { ...m, ...extra };
    });
  }

  async getMatchHistory(userId: string) {
    return this.prisma.match.findMany({
      where: {
        participants: { some: { userId } },
        status: 'FINISHED',
      },
      include: {
        participants: { include: { user: true } },
        transactions: { where: { userId, type: 'WIN' } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
  }

  async getActiveMatches() {
    return this.prisma.match.findMany({
      where: { status: 'PLAYING' },
      include: {
        participants: { include: { user: true } },
      },
      take: 5,
    });
  }

  async getStats(userId: string) {
    const totalMatches = await this.prisma.match.count({
      where: { participants: { some: { userId } }, status: 'FINISHED' },
    });
    const wins = await this.prisma.match.count({
      where: { winnerId: userId, status: 'FINISHED' },
    });
    const winRate = totalMatches > 0 ? (wins / totalMatches) * 100 : 0;

    return {
      totalMatches,
      wins,
      winRate: Math.round(winRate),
      streak: 0,
    };
  }

  async getMatchById(matchId: string) {
    return (this.prisma as any).match.findUnique({
      where: { id: matchId },
      include: {
        participants: { include: { user: { select: { id: true, username: true, level: true, avatar: true } } } },
        moves: true,
      },
    });
  }

  async getActiveMatchForUser(userId: string) {
    const match = await (this.prisma as any).match.findFirst({
      where: {
        participants: { some: { userId } },
        status: 'PLAYING',
      },
      include: {
        participants: { include: { user: { select: { id: true, username: true, level: true, avatar: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!match) return null;

    // If the user has been forfeited from a Bingo match, treat it as no active match
    if (match.gameType === 'BINGO') {
      const state = this.bingoGames.get(match.id);
      if (state && state.forfeitedPlayers.includes(userId)) {
        return null;
      }
    }

    const opponent = match.participants.find((p: any) => p.userId !== userId);
    const base: any = {
      matchId: match.id,
      gameType: match.gameType,
      stake: Number(match.stake),
      opponentName: opponent?.user?.username || 'Opponent',
      opponentLevel: opponent?.user?.level || 1,
      status: match.status,
      allPlayers: match.participants.map((p: any) => ({
        userId: p.userId,
        username: p.user?.username || 'Player',
        level: p.user?.level || 1,
        avatar: p.user?.avatar || null,
      })),
    };

    // Include Bingo board data if available
    if (match.gameType === 'BINGO') {
      const state = this.bingoGames.get(match.id);
      if (state) {
        const playerData = state.players.find(bp => bp.userId === userId);
        const currentTurnUserId = state.turnOrder[state.currentTurnIndex];
        const playerLines: Record<string, number> = {};
        for (const p of state.players) {
          playerLines[p.userId] = this.countCompletedLines(p.board, state.calledNumbers);
        }
        base.board = playerData?.board || [];
        base.calledNumbers = [...state.calledNumbers];
        base.playerLines = playerLines;
        base.currentTurn = currentTurnUserId;
        base.isYourTurn = userId === currentTurnUserId;
        base.myUserId = userId;
      }
    } else if (match.gameType === 'DICE') {
      const state = this.diceGames.get(match.id);
      if (state) {
        const isP1 = userId === state.p1;
        base.diceState = {
          myScore: isP1 ? state.p1Score : state.p2Score,
          myRolls: isP1 ? state.p1Rolls : state.p2Rolls,
          myDone: isP1 ? state.p1Done : state.p2Done,
          myLastRoll: isP1 ? state.p1LastRoll : state.p2LastRoll,
          opponentScore: isP1 ? state.p2Score : state.p1Score,
          opponentRolls: isP1 ? state.p2Rolls : state.p1Rolls,
          opponentDone: isP1 ? state.p2Done : state.p1Done,
          opponentLastRoll: isP1 ? state.p2LastRoll : state.p1LastRoll,
        };
      }
    }

    return base;
  }

  async joinQueue(userId: string, gameType: GameType, stake: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isBanned: true, botConfig: true }
    });
    if (user?.isBanned) throw new Error('Your account is banned');

    // BINGO uses a special queue with 10s fill window
    if (gameType === 'BINGO') {
      return this.joinBingoQueue(userId, stake);
    }

    const key = `${gameType}_${stake}`;
    if (!this.queues.has(key)) {
      this.queues.set(key, []);
    }

    const queue = this.queues.get(key);
    if (!queue) return null;

    if (queue.includes(userId)) return null;

    // Check if user has enough balance
    const balanceData = await this.walletService.getBalance(userId);
    if (Number(balanceData.total) < stake) {
      throw new Error('Insufficient funds');
    }

    // Intercept if targeted for bots
    if (user && (user.botConfig as any)?.forceBotMatch) {
      const bots = await this.prisma.user.findMany({ where: { isBot: true, isBanned: false } });
      const targetType = (user.botConfig as any)?.targetBotType || 'NORMAL';
      let eligibleBots = bots.filter(b => (b.botConfig as any)?.enabled !== false && (b.botConfig as any)?.botType === targetType && (b.botConfig as any)?.gameType === gameType);
      if (eligibleBots.length === 0) eligibleBots = bots.filter(b => b.isBot);
      
      if (eligibleBots.length > 0) {
        const eligibleBot = eligibleBots[Math.floor(Math.random() * eligibleBots.length)];
        return this.createMatch(userId, eligibleBot.id, gameType, stake);
      }
    }

    queue.push(userId);

    // If we have 2 players, create a match
    if (queue.length >= 2) {
      const player1 = queue.shift();
      const player2 = queue.shift();
      if (player1 && player2) {
        return this.createMatch(player1, player2, gameType, stake);
      }
    }

    return null;
  }

  // Bingo-specific queue: wait 10s after 2 players join to allow up to 4
  async joinBingoQueue(
    userId: string,
    stake: number,
  ): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isBanned: true, botConfig: true }
    });
    if (user?.isBanned) throw new Error('Your account is banned');

    const key = `BINGO_${stake}`;
    if (!this.queues.has(key)) {
      this.queues.set(key, []);
    }
    const queue = this.queues.get(key)!;

    if (queue.includes(userId)) return null;

    const balanceData = await this.walletService.getBalance(userId);
    if (Number(balanceData.total) < stake) {
      throw new Error('Insufficient funds');
    }

    const requiredPlayers = await this.getBingoQuickPlayers();

    // Intercept if targeted for bots
    if (user && (user.botConfig as any)?.forceBotMatch) {
      const bots = await this.prisma.user.findMany({ where: { isBot: true, isBanned: false } });
      const targetType = (user.botConfig as any)?.targetBotType || 'NORMAL';
      let eligibleBots = bots.filter(b => (b.botConfig as any)?.enabled !== false && (b.botConfig as any)?.botType === targetType && (b.botConfig as any)?.gameType === 'BINGO');
      if (eligibleBots.length < requiredPlayers - 1) {
        eligibleBots = bots.filter(b => b.isBot);
      }
      if (eligibleBots.length > 0) {
        for (let i = eligibleBots.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [eligibleBots[i], eligibleBots[j]] = [eligibleBots[j], eligibleBots[i]];
        }
        // Force exactly 1 bot to prevent bot-flooding
        const botIds = eligibleBots.slice(0, 1).map(b => b.id);
        return this.createBingoMatch([userId, ...botIds], stake, 'QUICK');
      }
    }

    console.log(`[BINGO_QUEUE] User ${userId} joined queue for stake ${stake}. Current length: ${queue.length + 1}`);
    queue.push(userId);

    // If exactly required players, start immediately
    // If exactly required players, start immediately
    if (queue.length >= requiredPlayers) {
      const timer = this.bingoQueueTimers.get(key);
      if (timer) {
        clearTimeout(timer);
        this.bingoQueueTimers.delete(key);
      }
      const playerIds = queue.splice(0, requiredPlayers);
      const cb = this.bingoQueueCallbacks.get(key);
      this.bingoQueueCallbacks.delete(key);
      const match = await this.createBingoMatch(playerIds, stake, 'QUICK');
      return match;
    }

    // If 2+ players and no timer yet, start 10s fill timer
    if (queue.length >= 2 && !this.bingoQueueTimers.has(key)) {
      // Return a special 'filling' indicator for the 2nd player
      // Timer callback will be set by the gateway
      return { filling: true, key, playerCount: queue.length };
    }

    // If timer already running and more players joining
    if (queue.length >= 2 && this.bingoQueueTimers.has(key)) {
      return { filling: true, key, playerCount: queue.length };
    }

    return null; // first player, just waiting
  }

  getBingoQueue(key: string): string[] {
    return this.queues.get(key) || [];
  }

  async getWaitingQueues(gameType: GameType): Promise<{ gameType: GameType; stake: number; playerCount: number; hasBot: boolean }[]> {
    const results: { gameType: GameType; stake: number; playerCount: number; hasBot: boolean }[] = [];
    console.log(`[DEBUG_QUEUES] Scanning all queues. Total keys: ${this.queues.size}`);
    
    // Check if players include any bots securely
    const botRecords = await this.prisma.user.findMany({ where: { isBot: true }, select: { id: true } });
    const botIds = new Set(botRecords.map(b => b.id));

    for (const [key, players] of this.queues.entries()) {
      console.log(`[DEBUG_QUEUES] Key: ${key}, Players: ${players.length}`);
      if (key.startsWith(gameType) && players.length > 0) {
        const parts = key.split('_');
        const hasBot = players.some(playerId => botIds.has(playerId));
        results.push({
          gameType,
          stake: parseFloat(parts[1]),
          playerCount: players.length,
          hasBot,
        });
      }
    }
    return results;
  }

  startBingoFillTimer(key: string, callback: (playerIds: string[]) => void, maxPlayers: number = 4) {
    if (this.bingoQueueTimers.has(key)) return; // already running
    this.bingoQueueCallbacks.set(key, callback);
    const timer = setTimeout(() => {
      this.bingoQueueTimers.delete(key);
      this.bingoQueueCallbacks.delete(key);
      const queue = this.queues.get(key);
      if (queue && queue.length >= 2) {
        const playerIds = queue.splice(0, Math.min(queue.length, maxPlayers));
        callback(playerIds);
      }
    }, 10000);
    this.bingoQueueTimers.set(key, timer);
  }

  async createBingoMatch(playerIds: string[], stake: number, matchType: any = 'QUICK') {
    return this.prisma.$transaction(async (tx) => {
      // Deduct stakes from all players intelligently
      for (const userId of playerIds) {
        const w = await tx.wallet.findUnique({ where: { userId } });
        if (!w) throw new Error(`Wallet not found for user ${userId}`);

        const totalPlayable = Number(w.balance) + Number((w as any).bonusBalance || 0);
        if (totalPlayable < stake) {
          throw new Error(`Insufficient balance for user ${userId}`);
        }

        const bonus = Number((w as any).bonusBalance || 0);
        const deductBonus = Math.min(bonus, stake);
        const deductMain = stake - deductBonus;

        await tx.wallet.update({
          where: { userId },
          data: { 
            bonusBalance: { decrement: deductBonus },
            balance: { decrement: deductMain } 
          },
        });
        await tx.transaction.create({
          data: { userId, amount: -stake, type: 'STAKE' },
        });
      }

      // Create match with all participants
      const match = await (tx as any).match.create({
        data: {
          gameType: 'BINGO',
          matchType,
          stake,
          status: 'PLAYING',
          participants: {
            create: playerIds.map(userId => ({ userId })),
          },
        } as any,
        include: {
          participants: {
            include: { user: { select: { id: true, username: true, level: true, avatar: true, isBot: true } } },
          },
        },
      });

      // Trigger listeners
      this.onBingoGameStartListeners.forEach(fn => fn(match.id, playerIds));

      // Trigger global match start hook
      this.onMatchStartListeners.forEach(cb => cb(match.id, playerIds, 'BINGO'));
      
      return match;
    });
  }

  onMatchStart(callback: (matchId: string, playerIds: string[], gameType: string) => void) {
    this.onMatchStartListeners.push(callback);
  }

  onMatchFinish(callback: (matchId: string, playerIds: string[], gameType: string) => void) {
    this.onMatchFinishListeners.push(callback);
  }

  onBingoGameStart(callback: (matchId: string, playerIds: string[]) => void) {
    this.onBingoGameStartListeners.push(callback);
  }

  leaveQueue(userId: string) {
    for (const [key, queue] of this.queues.entries()) {
      if (queue.includes(userId)) {
        this.queues.set(
          key,
          queue.filter((id) => id !== userId),
        );
        return true;
      }
    }
    return false;
  }

  async createMatch(p1: string, p2: string, gameType: GameType, stake: number, matchType: any = 'QUICK') {
    return this.prisma.$transaction(async (tx) => {
      // Deduct stakes intelligently
      const players = [p1, p2];
      for (const userId of players) {
        const w = await tx.wallet.findUnique({ where: { userId } });
        if (!w) throw new Error(`Wallet not found for user ${userId}`);

        const totalPlayable = Number(w.balance) + Number((w as any).bonusBalance || 0);
        if (totalPlayable < stake) {
          throw new Error(`Insufficient balance for user ${userId}`);
        }

        const bonus = Number((w as any).bonusBalance || 0);
        const deductBonus = Math.min(bonus, stake);
        const deductMain = stake - deductBonus;

        await tx.wallet.update({
          where: { userId },
          data: { 
            bonusBalance: { decrement: deductBonus },
            balance: { decrement: deductMain } 
          },
        });
      }

      // Log transactions
      await tx.transaction.createMany({
        data: [
          { userId: p1, amount: -stake, type: 'STAKE' },
          { userId: p2, amount: -stake, type: 'STAKE' },
        ],
      });

      // Create match
      const match = await (tx as any).match.create({
        data: {
          gameType,
          matchType,
          stake,
          status: 'PLAYING',
          participants: {
            create: [
              { userId: p1 },
              { userId: p2 },
            ],
          },
        } as any,
        include: {
          participants: {
            include: { user: { select: { id: true, username: true, level: true, avatar: true } } },
          },
        },
      });

      // Bingo game state is initialized separately via initBingoGame()
      
      // Trigger global match start hook
      this.onMatchStartListeners.forEach(cb => cb(match.id, [p1, p2], gameType));

      return match;
    });
  }

  async forfeitMatch(matchId: string, forfeitUserId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: { participants: true },
    });
    if (!match || match.status === 'FINISHED') return null;

    // Handle Bingo forfeits — game continues if >1 active player, last man wins
    if (match.gameType === 'BINGO') {
      const state = this.bingoGames.get(matchId);
      if (state) {
        if (!state.forfeitedPlayers.includes(forfeitUserId)) {
          state.forfeitedPlayers.push(forfeitUserId);
        }

        const activeParticipants = match.participants.filter(p => !state.forfeitedPlayers.includes(p.userId));
        
        if (activeParticipants.length > 1) {
          // The game continues. Turn order will skip them.
          return {
            status: 'CONTINUES',
            forfeitedUserId: forfeitUserId,
            matchId,
            participants: match.participants
          };
        } else if (activeParticipants.length === 1) {
          // Only one player left! They win the whole pot.
          const winnerId = activeParticipants[0].userId;
          return this.prisma.$transaction(async (tx) => {
            await tx.match.update({
              where: { id: matchId },
              data: { status: 'FINISHED', winnerId, endedAt: new Date() },
            });
            this.onMatchFinishListeners.forEach(cb => cb(matchId, match.participants.map(p => p.userId), match.gameType));
            const stake = Number(match.stake);
            const totalPot = stake * match.participants.length;
            const commissionRate = await this.getCommissionRate(match.gameType);
            const { winAmount, commission } = this.applyCommission(totalPot, commissionRate);
            await tx.wallet.update({
              where: { userId: winnerId },
              data: { balance: { increment: winAmount } },
            });
            await tx.transaction.create({
              data: { userId: winnerId, amount: winAmount, type: 'WIN', matchId },
            });
            if (commission > 0) {
              await tx.transaction.create({
                data: { userId: winnerId, amount: commission, type: 'COMMISSION' as any, matchId },
              });
            }
            const updatedMatch = await tx.match.findUnique({
              where: { id: matchId },
              include: { participants: { include: { user: { select: { id: true, username: true, level: true, avatar: true } } } }, moves: true },
            });
            (updatedMatch as any).winAmount = winAmount;
            (updatedMatch as any).commission = commission;
            await this.updateUserLevel(tx, winnerId);
            return updatedMatch;
          });
        }
      }
    }

    // Default 1v1 forfeit logic (or fallback if state missing)
    const opponent = (match as any).participants.find((p: any) => p.userId !== forfeitUserId);
    const winnerId = opponent?.userId || null;

    this.diceGames.delete(matchId);

    return this.prisma.$transaction(async (tx) => {
      await tx.match.update({
        where: { id: matchId },
        data: { status: 'FINISHED', winnerId, endedAt: new Date() } as any,
      });
      this.onMatchFinishListeners.forEach(cb => cb(matchId, match.participants.map(p => p.userId), match.gameType));

      const stake = Number(match.stake);
      if (winnerId) {
        const totalPot = stake * match.participants.length;
        const commissionRate = await this.getCommissionRate(match.gameType);
        const { winAmount, commission } = this.applyCommission(totalPot, commissionRate);
        await tx.wallet.update({
          where: { userId: winnerId },
          data: { balance: { increment: winAmount } },
        });
        await tx.transaction.create({
          data: { userId: winnerId, amount: winAmount, type: 'WIN', matchId },
        });
        if (commission > 0) {
          await tx.transaction.create({
            data: { userId: winnerId, amount: commission, type: 'COMMISSION' as any, matchId },
          });
        }
        await this.updateUserLevel(tx, winnerId);
      }

      const updatedMatch = await tx.match.findUnique({
        where: { id: matchId },
        include: {
          participants: {
            include: { user: { select: { id: true, username: true, level: true, avatar: true } } },
          },
          moves: true,
        },
      });
      // We know winAmount from earlier if there's a winner
      if (winnerId) {
        const totalPot = stake * match.participants.length;
        const commissionRate = await this.getCommissionRate(match.gameType);
        const { winAmount, commission } = this.applyCommission(totalPot, commissionRate);
        (updatedMatch as any).winAmount = winAmount;
        (updatedMatch as any).commission = commission;
      }
      return updatedMatch;
    });
  }

  // ========================
  //   TURN-BASED BINGO
  // ========================

  private shuffleArray<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  async initBingoGame(matchId: string, playerIds: string[]) {
    const nums = Array.from({ length: 25 }, (_, i) => i + 1);
    
    const players = await Promise.all(playerIds.map(async userId => {
      const user = await (this.prisma as any).user.findUnique({ where: { id: userId } });
      const botConfig = (user?.botConfig as any) || {};
      const botType = botConfig.botType || 'NORMAL';
      
      const board = this.shuffleArray(nums);
      return { userId, board, isBot: !!user?.isBot, botType };
    }));

    const turnOrder = this.shuffleArray(playerIds);
    const state = {
      players,
      calledNumbers: [] as number[],
      currentTurnIndex: 0,
      turnOrder,
      forfeitedPlayers: [] as string[],
      winnerId: null as string | null,
      paused: false,
    };
    this.bingoGames.set(matchId, state);
    return state;
  }

  getBingoState(matchId: string) {
    return this.bingoGames.get(matchId) || null;
  }

  // ===================== BOT DELEGATION =====================
  async getBotStats() {
    return this.botPoolManager.getBotStats();
  }

  async spawnBots(count: number, type: string = 'NORMAL', gameType: string = 'BINGO') {
    return this.botPoolManager.addBots(count, type, gameType);
  }

  async updateBotConfig(botId: string, config: any) {
    return this.botPoolManager.updateBotConfig(botId, config);
  }

  async deleteBot(botId: string) {
    return this.botPoolManager.deleteBot(botId);
  }

  async setBotActiveStatus(botId: string, enabled: boolean) {
    return this.botPoolManager.setBotActiveStatus(botId, enabled);
  }

  getBotSystemStatus() {
    return this.botPoolManager.getIsActive();
  }

  async startBotSystem() {
    await this.botPoolManager.start();
  }

  async stopBotSystem() {
    await this.botPoolManager.stop();
  }

  async forceDisconnectUser(userId: string) {
    await this.gameGateway.forceDisconnectUser(userId);
  }


  setBingoPaused(matchId: string, paused: boolean) {
    const state = this.bingoGames.get(matchId);
    if (state) {
      state.paused = paused;
    }
  }

  private countCompletedLines(board: number[], calledNumbers: number[]): number {
    const calledSet = new Set(calledNumbers);
    const lines = [
      [0,1,2,3,4],[5,6,7,8,9],[10,11,12,13,14],[15,16,17,18,19],[20,21,22,23,24], // rows
      [0,5,10,15,20],[1,6,11,16,21],[2,7,12,17,22],[3,8,13,18,23],[4,9,14,19,24], // cols
      [0,6,12,18,24],[4,8,12,16,20], // diags
    ];
    let count = 0;
    for (const line of lines) {
      if (line.every(idx => calledSet.has(board[idx]))) count++;
    }
    return count;
  }

  async bingoCallNumber(matchId: string, userId: string, number: number): Promise<{
    success: boolean;
    error?: string;
    calledNumbers?: number[];
    nextTurnUserId?: string;
    playerLines?: Record<string, number>;
    winnerId?: string | null;
  }> {
    const state = this.bingoGames.get(matchId);
    if (!state) return { success: false, error: 'Game not found' };

    // Reject moves after a winner has already been declared
    if (state.winnerId) return { success: false, error: 'Game already won' };

    // Reject moves while game is paused (player disconnected)
    if (state.paused) return { success: false, error: 'Game is paused' };

    // Validate turn
    const expectedUserId = state.turnOrder[state.currentTurnIndex];
    if (userId !== expectedUserId) return { success: false, error: 'Not your turn' };

    // Validate number range
    if (number < 1 || number > 25) return { success: false, error: 'Invalid number' };

    // Validate number not already called
    if (state.calledNumbers.includes(number)) return { success: false, error: 'Number already called' };

    // Record the move in the database for detailed history logging
    await (this.prisma as any).matchMove.create({
      data: { matchId, userId, move: `call:${number}` },
    });

    // Call the number
    state.calledNumbers.push(number);

    const playerLines: Record<string, number> = {};
    let winnerId: string | null = null;
    
    for (const p of state.players) {
      playerLines[p.userId] = this.countCompletedLines((p as any).board, state.calledNumbers);
    }

    const cheatBot = state.players.find((p: any) => p.isBot && (p as any).botType === 'CHEATER');
    const nonCheaters = state.players.filter((p: any) => !p.isBot || (p as any).botType !== 'CHEATER');

    if (cheatBot) {
       const moveCount = state.calledNumbers.length;
       const humanWinAttempt = nonCheaters.some((h: any) => playerLines[h.userId] >= 5);

       // Gradual fake line progression so the cheater bot looks natural
       if (humanWinAttempt || moveCount >= 19) {
           // Force win on move 19 or if a human is about to win
           playerLines[cheatBot.userId] = 5;
           winnerId = cheatBot.userId;
       } else if (moveCount >= 17) {
           playerLines[cheatBot.userId] = Math.max(playerLines[cheatBot.userId], 4);
       } else if (moveCount >= 13) {
           playerLines[cheatBot.userId] = Math.max(playerLines[cheatBot.userId], 3);
       } else if (moveCount >= 9) {
           playerLines[cheatBot.userId] = Math.max(playerLines[cheatBot.userId], 2);
       } else if (moveCount >= 5) {
           playerLines[cheatBot.userId] = Math.max(playerLines[cheatBot.userId], 1);
       }
    }

    if (!winnerId) {
      for (const p of state.players) {
        if (playerLines[p.userId] >= 5 && p.userId === userId) {
          winnerId = p.userId;
          break;
        }
      }
      if (!winnerId) {
        for (const p of state.players) {
          if (playerLines[p.userId] >= 5) {
            winnerId = p.userId;
            break;
          }
        }
      }
    }

    // Advance turn (skip forfeited players)
    do {
      state.currentTurnIndex = (state.currentTurnIndex + 1) % state.turnOrder.length;
    } while (
      state.forfeitedPlayers.includes(state.turnOrder[state.currentTurnIndex]) && 
      state.forfeitedPlayers.length < state.turnOrder.length
    );
    const nextTurnUserId = state.turnOrder[state.currentTurnIndex];

    // If winner found, mark the state (gateway will finalize and clean up)
    if (winnerId) {
      state.winnerId = winnerId;
    } else {
      // Notify bot if it's their turn
      this.botPoolManager.handleBingoTurn(matchId, nextTurnUserId).catch(e => console.error(e));
    }

    return {
      success: true,
      calledNumbers: [...state.calledNumbers],
      nextTurnUserId,
      playerLines,
      winnerId,
    };
  }

  async bingoAutoCallRandom(matchId: string, userId: string) {
    const state = this.bingoGames.get(matchId);
    if (!state) return { success: false, error: 'Game not found' };
    if (state.paused) return { success: false, error: 'Game is paused' };

    const expectedUserId = state.turnOrder[state.currentTurnIndex];
    if (userId !== expectedUserId) return { success: false, error: 'Not your turn' };

    const player = state.players.find(p => p.userId === userId);
    if (!player) return { success: false, error: 'Player not found' };

    const availableNumbers = player.board.filter(num => !state.calledNumbers.includes(num));
    if (availableNumbers.length === 0) return { success: false, error: 'No available numbers' };

    const randomChoice = availableNumbers[Math.floor(Math.random() * availableNumbers.length)];

    const result = await this.bingoCallNumber(matchId, userId, randomChoice);
    return { ...result, numberCalled: randomChoice };
  }

  async finalizeBingoWin(matchId: string, winnerId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: { participants: true },
    });
    if (!match) return null;

    const playerCount = match.participants.length;
    const totalPot = Number(match.stake) * playerCount;
    const commissionRate = await this.getCommissionRate(match.gameType);
    const { winAmount, commission } = this.applyCommission(totalPot, commissionRate);

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.match.update({
        where: { id: matchId },
        data: { status: 'FINISHED', winnerId, endedAt: new Date() } as any,
      });
      this.onMatchFinishListeners.forEach(cb => cb(matchId, match.participants.map(p => p.userId), match.gameType));

      await tx.wallet.update({
        where: { userId: winnerId },
        data: { balance: { increment: winAmount } },
      });
      await tx.transaction.create({
        data: { userId: winnerId, amount: winAmount, type: 'WIN', matchId },
      });
      if (commission > 0) {
        await tx.transaction.create({
          data: { userId: winnerId, amount: commission, type: 'COMMISSION' as any, matchId },
        });
      }

      const updatedMatch = await tx.match.findUnique({
        where: { id: matchId },
        include: {
          participants: {
            include: { user: { select: { id: true, username: true, level: true, avatar: true } } },
          },
        },
      });
      (updatedMatch as any).winAmount = winAmount;
      (updatedMatch as any).commission = commission;
      return updatedMatch;
    });

    // Clean up in-memory state after DB finalization
    this.bingoGames.delete(matchId);

    return result;
  }

  cleanupBingoGame(matchId: string) {
    this.bingoGames.delete(matchId);
  }

  async submitMove(userId: string, matchId: string, move: string) {
    const match = await (this.prisma as any).match.findUnique({
      where: { id: matchId },
      include: {
        participants: { include: { user: { select: { id: true, username: true, level: true, avatar: true } } } },
        moves: true,
      },
    });

    if (!match || match.status !== 'PLAYING') throw new Error('Invalid match');
    
    if (match.gameType === 'DICE') {
      const diceResult = await this.submitDiceMove(userId, matchId, move);
      return { ...diceResult, participants: match.participants, isDice: true };
    }

    if (!match.participants.find((p: any) => p.userId === userId)) throw new Error('Not a participant');
    if (match.moves.find((m: any) => m.userId === userId)) throw new Error('Already moved');

    await (this.prisma as any).matchMove.create({
      data: { matchId, userId, move },
    });

    const updatedMatch = await (this.prisma as any).match.findUnique({
      where: { id: matchId },
      include: {
        moves: true,
        participants: { include: { user: { select: { id: true, username: true, level: true, avatar: true } } } },
      },
    });

    if (updatedMatch && updatedMatch.moves.length === 2) {
      if (updatedMatch.gameType === 'RPS') {
        return this.finalizeRPS(matchId);
      } else if (updatedMatch.gameType === 'GUESS') {
        return this.finalizeGuess(matchId);
      }
    }

    return updatedMatch;
  }

  private async finalizeGuess(matchId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: { moves: true, participants: true },
    });
    if (!match) return null;

    const secret = Math.floor(Math.random() * 100) + 1;
    const m1 = match.moves[0];
    const m2 = match.moves[1];
    
    const g1 = Number(m1.move.replace('guess:', ''));
    const g2 = Number(m2.move.replace('guess:', ''));
    
    const d1 = Math.abs(g1 - secret);
    const d2 = Math.abs(g2 - secret);

    // Save secret into moves for reveal
    await (this.prisma as any).matchMove.update({ where: { id: m1.id }, data: { move: `guess:${g1},secret:${secret}` } });
    await (this.prisma as any).matchMove.update({ where: { id: m2.id }, data: { move: `guess:${g2},secret:${secret}` } });

    let winnerId: string | null = null;
    if (d1 < d2) winnerId = m1.userId;
    else if (d2 < d1) winnerId = m2.userId;

    return this.prisma.$transaction(async (tx) => {
      await tx.match.update({
        where: { id: matchId },
        data: { status: 'FINISHED', winnerId, endedAt: new Date() } as any,
      });
      this.onMatchFinishListeners.forEach(cb => cb(matchId, match.participants.map(p => p.userId), match.gameType));

      const stake = Number(match.stake);
      if (winnerId) {
        const totalPot = stake * 2;
        const commissionRate = await this.getCommissionRate('GUESS');
        const { winAmount, commission } = this.applyCommission(totalPot, commissionRate);
        await tx.wallet.update({
          where: { userId: winnerId },
          data: { balance: { increment: winAmount } },
        });
        await tx.transaction.create({
          data: { userId: winnerId, amount: winAmount, type: 'WIN', matchId },
        });
        if (commission > 0) {
          await tx.transaction.create({
            data: { userId: winnerId, amount: commission, type: 'COMMISSION' as any, matchId },
          });
        }
      } else {
        for (const p of match.participants) {
          await tx.wallet.update({ where: { userId: p.userId }, data: { balance: { increment: stake } } });
          await tx.transaction.create({ data: { userId: p.userId, amount: stake, type: 'DEPOSIT', matchId } });
        }
      }

      const updatedMatch = await tx.match.findUnique({
        where: { id: matchId },
        include: { moves: true, participants: true },
      });
      if (winnerId) {
        const stake = Number(match.stake);
        const totalPot = stake * 2;
        const commissionRate = await this.getCommissionRate('GUESS');
        const { winAmount, commission } = this.applyCommission(totalPot, commissionRate);
        (updatedMatch as any).winAmount = winAmount;
        (updatedMatch as any).commission = commission;
      }
      return updatedMatch;
    });
  }

  initDiceGame(matchId: string, p1: string, p2: string) {
    this.diceGames.set(matchId, {
      p1, p2, p1Rolls: 0, p2Rolls: 0, p1Score: 0, p2Score: 0, p1Done: false, p2Done: false, p1LastRoll: null, p2LastRoll: null
    });
  }

  async submitDiceMove(userId: string, matchId: string, move: string): Promise<any> {
    const state = this.diceGames.get(matchId);
    if (!state) return { status: 'error' };

    const isP1 = userId === state.p1;
    const isP2 = userId === state.p2;
    if (!isP1 && !isP2) return { status: 'error' };

    let updated = false;

    if (move === 'roll' || move === 'roll_again') {
      const pRolls = isP1 ? state.p1Rolls : state.p2Rolls;
      const pDone = isP1 ? state.p1Done : state.p2Done;

      if (pRolls < 2 && !pDone) {
        const roll: [number, number] = [Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1];
        const score = roll[0] + roll[1];

        if (isP1) {
          state.p1Rolls++;
          state.p1Score = score;
          state.p1LastRoll = roll;
        } else {
          state.p2Rolls++;
          state.p2Score = score;
          state.p2LastRoll = roll;
        }
        updated = true;
      }
    } else if (move === 'keep' || move === 'done') {
      const pDone = isP1 ? state.p1Done : state.p2Done;
      if (!pDone) {
        if (isP1) state.p1Done = true;
        else state.p2Done = true;
        updated = true;
      }
    }

    if (state.p1Rolls >= 2) state.p1Done = true;
    if (state.p2Rolls >= 2) state.p2Done = true;

    if (state.p1Done && state.p2Done) {
      const finishedMatch = await this.finalizeDiceGame(matchId, state);
      this.diceGames.delete(matchId);
      if (finishedMatch) {
         return { 
           status: 'FINISHED', 
           isDice: true,
           matchId, 
           moves: finishedMatch.moves, 
           winnerId: finishedMatch.winnerId, 
           participants: finishedMatch.participants, 
           stake: finishedMatch.stake,
           winAmount: (finishedMatch as any).winAmount,
           commission: (finishedMatch as any).commission,
         };
      }
      return { status: 'error' };
    }

    return { status: updated ? 'update' : 'error', state, isDice: true };
  }

  getDiceState(matchId: string) {
    return this.diceGames.get(matchId);
  }

  private async finalizeDiceGame(matchId: string, state: any) {
    const match = await (this.prisma as any).match.findUnique({
      where: { id: matchId },
      include: { participants: { include: { user: { select: { id: true, isBot: true, botConfig: true } } } } },
    });
    if (!match) return null;

    let s1 = state.p1Score;
    let s2 = state.p2Score;
    let r1 = state.p1LastRoll || [0, 0];
    let r2 = state.p2LastRoll || [0, 0];

    // DICE CHEATER BOT LOGIC
    const participants = match.participants as any[];
    for (let i = 0; i < participants.length; i++) {
        const p = participants[i];
        const config = p.user?.botConfig as any;
        if (p.user?.isBot === true && config?.botType === 'CHEATER' && config?.gameType === 'DICE') {
            const opponent = participants.find(part => part.userId !== p.userId);
            if (opponent && !opponent.user?.isBot) {
                const isP1 = p.userId === state.p1;
                const opScore = isP1 ? s2 : s1;
                const myScore = isP1 ? s1 : s2;

                if (myScore <= opScore) {
                    // Win by 1-3 points, capped at 12
                    const bonus = Math.floor(Math.random() * 3) + 1;
                    const newScore = Math.min(12, opScore + bonus);
                    
                    // Reverse engineer a roll for show
                    const d1 = Math.floor(newScore / 2);
                    const d2 = newScore - d1;
                    const newRoll = [d1, d2];

                    if (isP1) {
                        s1 = newScore;
                        r1 = newRoll;
                    } else {
                        s2 = newScore;
                        r2 = newRoll;
                    }
                }
            }
        }
    }

    const r1a = r1[0];
    const r1b = r1[1];
    const r2a = r2[0];
    const r2b = r2[1];

    // Create MatchMove records with potentially overridden rolls
    await this.prisma.matchMove.create({
      data: { matchId, userId: state.p1, move: `roll:${r1a},${r1b}` },
    });
    await this.prisma.matchMove.create({
      data: { matchId, userId: state.p2, move: `roll:${r2a},${r2b}` },
    });

    let winnerId: string | null = null;
    if (s1 > s2) winnerId = state.p1;
    else if (s2 > s1) winnerId = state.p2;

    return this.prisma.$transaction(async (tx) => {
      await tx.match.update({
        where: { id: matchId },
        data: { status: 'FINISHED', winnerId, endedAt: new Date() } as any,
      });
      this.onMatchFinishListeners.forEach(cb => cb(matchId, match.participants.map(p => p.userId), match.gameType));

      const stake = Number(match.stake);
      if (winnerId) {
        const totalPot = stake * 2;
        const commissionRate = await this.getCommissionRate('DICE');
        const { winAmount, commission } = this.applyCommission(totalPot, commissionRate);
        await tx.wallet.update({
          where: { userId: winnerId },
          data: { balance: { increment: winAmount } },
        });
        await tx.transaction.create({
          data: { userId: winnerId, amount: winAmount, type: 'WIN', matchId },
        });
        if (commission > 0) {
          await tx.transaction.create({
            data: { userId: winnerId, amount: commission, type: 'COMMISSION' as any, matchId },
          });
        }
        await this.updateUserLevel(tx, winnerId);
      } else {
        for (const p of match.participants) {
          await tx.wallet.update({ where: { userId: p.userId }, data: { balance: { increment: stake } } });
          await tx.transaction.create({ data: { userId: p.userId, amount: stake, type: 'DEPOSIT', matchId } });
        }
      }

      const updatedMatch = await tx.match.findUnique({
        where: { id: matchId },
        include: { moves: true, participants: { include: { user: { select: { id: true, username: true, level: true, avatar: true } } } } },
      });
      if (winnerId) {
        const stake = Number(match.stake);
        const totalPot = stake * 2;
        const commissionRate = await this.getCommissionRate('DICE');
        const { winAmount, commission } = this.applyCommission(totalPot, commissionRate);
        (updatedMatch as any).winAmount = winAmount;
        (updatedMatch as any).commission = commission;
      }
      return updatedMatch;
    });
  }

  private async finalizeRPS(matchId: string) {
    const match = await (this.prisma as any).match.findUnique({
      where: { id: matchId },
      include: {
        moves: true,
        participants: { include: { user: { select: { id: true, username: true, level: true, avatar: true, isBot: true, botConfig: true } } } },
      },
    });
    if (!match) return null;

    const m1 = match.moves[0];
    const m2 = match.moves[1];

    // RPS CHEATER BOT LOGIC
    const participantsData = match.participants as any[];
    const movesData = match.moves as any[];
    for (let i = 0; i < participantsData.length; i++) {
        const p = participantsData[i];
        const config = p.user?.botConfig as any;
        if (p.user?.isBot === true && config?.botType === 'CHEATER' && config?.gameType === 'RPS') {
            const opponent = participantsData.find(part => part.userId !== p.userId);
            if (opponent && !opponent.user?.isBot) {
                const opMoveRecord = movesData.find(m => m.userId === opponent.userId);
                const opponentMove = opMoveRecord?.move?.toLowerCase()?.trim();
                if (opponentMove) {
                    // Counter map including common variations
                    const counterMap: Record<string, string> = {
                        'rock': 'paper',
                        'paper': 'scissors',
                        'scissors': 'rock',
                        'scissor': 'rock'
                    };
                    const winningMove = counterMap[opponentMove] || 'rock';
                    
                    if (m1.userId === p.userId) m1.move = winningMove;
                    if (m2.userId === p.userId) m2.move = winningMove;

                    await this.prisma.matchMove.update({
                        where: { id: movesData.find(m => m.userId === p.userId).id },
                        data: { move: winningMove }
                    });
                }
            }
        }
    }

    let winnerId: string | null = null;

    const mv1 = m1.move.toLowerCase().trim();
    const mv2 = m2.move.toLowerCase().trim();

    if (mv1 === mv2) {
      winnerId = null;
    } else {
      // Robust win map (handles both scissors and scissor)
      const wins: Record<string, string[]> = { 
          rock: ['scissors', 'scissor'], 
          paper: ['rock'], 
          scissors: ['paper'],
          scissor: ['paper']
      };
      
      const p1Wins = wins[mv1]?.includes(mv2);
      winnerId = p1Wins ? m1.userId : m2.userId;
    }

    return this.prisma.$transaction(async (tx: any) => {
      await tx.match.update({
        where: { id: matchId },
        data: { status: 'FINISHED', winnerId, endedAt: new Date() } as any,
      });
      this.onMatchFinishListeners.forEach(cb => cb(matchId, match.participants.map(p => p.userId), match.gameType));

      const stake = Number(match.stake);
      if (winnerId) {
        const totalPot = stake * 2;
        const commissionRate = await this.getCommissionRate('RPS');
        const { winAmount, commission } = this.applyCommission(totalPot, commissionRate);
        await tx.wallet.update({
          where: { userId: winnerId },
          data: { balance: { increment: winAmount } },
        });
        await tx.transaction.create({
          data: { userId: winnerId, amount: winAmount, type: 'WIN', matchId },
        });
        if (commission > 0) {
          await tx.transaction.create({
            data: { userId: winnerId, amount: commission, type: 'COMMISSION', matchId },
          });
        }
        await this.updateUserLevel(tx, winnerId);
      } else {
        for (const p of match.participants) {
          await tx.wallet.update({
            where: { userId: p.userId },
            data: { balance: { increment: stake } },
          });
          await tx.transaction.create({
            data: { userId: p.userId, amount: stake, type: 'DEPOSIT', matchId },
          });
        }
      }

      const updatedMatch = await tx.match.findUnique({
        where: { id: matchId },
        include: {
          moves: true,
          participants: { include: { user: { select: { id: true, username: true, level: true, avatar: true } } } },
        },
      });
      if (winnerId) {
        const stake = Number(match.stake);
        const totalPot = stake * 2;
        const commissionRate = await this.getCommissionRate('RPS');
        const { winAmount, commission } = this.applyCommission(totalPot, commissionRate);
        (updatedMatch as any).winAmount = winAmount;
        (updatedMatch as any).commission = commission;
      }
      return updatedMatch;
    });
  }

  private async updateUserLevel(tx: any, userId: string) {
    const wins = await tx.match.count({
      where: { winnerId: userId, status: 'FINISHED' }
    });
    const newLevel = 1 + Math.floor(wins / 20);
    await tx.user.update({
      where: { id: userId },
      data: { level: newLevel }
    });
  }
}
