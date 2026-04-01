import { Injectable, OnModuleInit, Logger, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GameService } from './game.service';
import { GameGateway } from './game.gateway';
import { WalletService } from '../wallet/wallet.service';
import { GameType } from '@prisma/client';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BotPlayerClient } from './bot-player.client';

@Injectable()
export class BotPoolManager implements OnModuleInit {
  private readonly logger = new Logger(BotPoolManager.name);
  private activeBots: Map<string, number> = new Map(); // userId -> activeGameCount
  private isActive: boolean = true;

  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => GameService))
    private gameService: GameService,
    @Inject(forwardRef(() => GameGateway))
    private gameGateway: GameGateway,
    private walletService: WalletService,
    private botPlayerClient: BotPlayerClient,
  ) {}

  async onModuleInit() {
    this.logger.log('BotPoolManager initialized');
    
    // Automated Bot Provisioning
    const gameTypes = ['BINGO', 'RPS', 'DICE'];
    const botTypes = ['NORMAL', 'CHEATER'];

    for (const gameType of gameTypes) {
      for (const botType of botTypes) {
        // Fetch target from settings or use default (4 each)
        const key = `BOT_TARGET_COUNT_${gameType}_${botType}`;
        const setting = await (this.prisma as any).systemSetting.findUnique({ where: { key } });
        const targetCount = setting ? parseInt(setting.value) : 4;
        
        await this.ensureBotsExist(targetCount, botType, gameType);
      }
    }

    // Generic Match Start Listener for all game types
    this.gameService.onMatchStart(async (matchId, playerIds, gameType) => {
      // Find all bots in this match
      const bots = await this.prisma.user.findMany({
        where: { id: { in: playerIds }, isBot: true },
      });

      for (const bot of bots) {
        await this.botPlayerClient.onGameStart(matchId, bot.id, gameType);
      }
    });

    // Keep the Bingo-specific listener for backward compatibility if needed, 
    // or rely on the generic one and remove this.
    // Let's rely on the generic one.
  }

  async ensureBotsExist(count: number = 5, botType: string = 'NORMAL', gameType: string = 'BINGO') {
    const bots = await this.prisma.user.findMany({ where: { isBot: true } });
    const existingCount = bots.filter((b: any) => 
      (b.botConfig as any)?.botType === botType && 
      (b.botConfig as any)?.gameType === gameType
    ).length;
    
    if (existingCount < count) {
      this.logger.log(`Spawning ${count - existingCount} new bots of type ${botType} for ${gameType}...`);
      for (let i = 0; i < count - existingCount; i++) {
        await this.spawnBot(botType, gameType);
      }
    }
  }

  async spawnBot(botType: string = 'NORMAL', gameType: string = 'BINGO') {
    const id = `bot_${Math.random().toString(36).slice(2, 9)}`;
    const bot = await this.prisma.user.create({
      data: {
        username: `Player_${id}`,
        phoneNumber: `bot_${id}`,
        passwordHash: 'bot_secured_hash',
        isBot: true,
        botConfig: {
          botType,
          gameType,
          minDelay: 1000,
          maxDelay: 3000,
          winRate: botType === 'CHEATER' ? 1.0 : 0.5,
          maxConcurrentGames: 3,
          enabled: true,
        } as any,
      } as any,
    });
    
    // Initial balance
    await this.prisma.wallet.create({
      data: { userId: bot.id, balance: 10000 },
    });
    
    return bot;
  }

  async addBots(count: number, botType: string, gameType: string) {
    this.logger.log(`Manually adding ${count} new bots of type ${botType} for ${gameType}...`);
    const results: any[] = [];
    for (let i = 0; i < count; i++) {
        results.push(await this.spawnBot(botType, gameType));
    }
    return results;
  }


  @Cron(CronExpression.EVERY_5_SECONDS)
  async monitorQueues() {
    this.logger.log('monitorQueues heartbeat');
    if (!this.isActive) return;

    const gameTypes: GameType[] = ['BINGO', 'RPS', 'DICE'];
    
    for (const gType of gameTypes) {
      // 1. Check Matching Queues
      const queues = await (this.gameService as any).getWaitingQueues(gType);
      if (queues.length > 0) {
        this.logger.log(`Found ${queues.length} active ${gType} queues`);
      }
      for (const queue of queues) {
        if (queue.playerCount > 0 && queue.playerCount < 4) {
          this.logger.log(`Found waiting players in ${queue.gameType} queue (Stake: ${queue.stake}). Attempting to assign bot...`);
          await this.assignBotToQueue(queue.gameType, queue.stake);
        }
      }

      // 2. Check Public Rooms
      if (this.gameGateway) {
        const publicRooms = (this.gameGateway as any).getPublicRooms();
        for (const room of publicRooms) {
          if (room.gameType === gType && room.players.length > 0 && room.players.length < room.maxPlayers) {
            // Join if no bots are already in this room to avoid bot-only rooms
            const hasBot = room.players.some((p: any) => p.userId.startsWith('bot_') || p.username.includes('bot'));
            if (!hasBot) {
              this.logger.log(`Found waiting players in ${gType} room ${room.name} (${room.id}). Assigning bot...`);
              await this.assignBotToRoom(room.id, room.stake, room.gameType);
            }
          }
        }
      }
    }
  }

  private async assignBotToRoom(roomId: string, stake: number, gameType: string) {
    const bots = await (this.prisma as any).user.findMany({
      where: { isBot: true, isBanned: false },
      include: { wallet: true },
    });

    const activeBots = bots.filter((b: any) => 
      (b.botConfig as any)?.enabled !== false &&
      (b.botConfig as any)?.gameType === gameType
    );

    for (const bot of activeBots) {
      const activeCount = this.activeBots.get(bot.id) || 0;
      const config = bot.botConfig as any;
      if (activeCount < (config?.maxConcurrentGames || 1)) {
        if (Number(bot.wallet?.balance || 0) >= stake) {
          const joined = (this.gameGateway as any).joinRoomByBot(roomId, bot.id, bot.username || 'Bot');
          if (joined) {
            this.activeBots.set(bot.id, activeCount + 1);
            this.logger.log(`Bot ${bot.username} joined room ${roomId}`);
            break;
          }
        }
      }
    }
  }

  private async assignBotToQueue(gameType: GameType, stake: number) {
    let bots = await (this.prisma as any).user.findMany({
      where: { isBot: true, isBanned: false },
    });

    // Prioritize CHEATER bots so if they exist, they get matched immediately.
    let activeBots = bots.filter((b: any) => 
      (b.botConfig as any)?.enabled !== false &&
      (b.botConfig as any)?.gameType === gameType
    );
    
    activeBots.sort((a: any, b: any) => {
      const aType = a.botConfig?.botType;
      const bType = b.botConfig?.botType;
      if (aType === 'CHEATER' && bType !== 'CHEATER') return -1;
      if (bType === 'CHEATER' && aType !== 'CHEATER') return 1;
      return 0;
    });

    for (const bot of activeBots) {
      const activeCount = this.activeBots.get(bot.id) || 0;
      const config = (bot as any).botConfig;
      if (activeCount < (config?.maxConcurrentGames || 1)) {
        const balance = await this.walletService.getBalance(bot.id);
        if (Number(balance) >= stake) {
          this.logger.log(`Assigning bot ${bot.username} to ${gameType} queue with stake ${stake}`);
          try {
            await (this.gameGateway as any).joinQueueByBot(bot.id, gameType, stake);
            this.activeBots.set(bot.id, activeCount + 1);
            return;
          } catch (e) {
            this.logger.error(`Bot ${bot.username} failed to join queue: ${e.message}`);
          }
        }
      }
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async topUpBots() {
    const bots = await (this.prisma as any).user.findMany({
      where: { isBot: true },
      include: { wallet: true },
    });

    for (const bot of bots) {
      if (Number(bot.wallet.balance) < 1000) {
        this.logger.log(`Topping up bot ${bot.username} balance`);
        await this.walletService.addBalance(bot.id, 5000, 'Top-up');
      }
    }
  }

  async getBotStats() {
    const bots = await (this.prisma as any).user.findMany({
      where: { isBot: true },
      orderBy: { id: 'asc' }, // Stable sorting to prevent jumping
      include: { 
        wallet: true,
        matches: { 
          where: { match: { status: 'FINISHED' } }, 
          include: { match: true },
          take: 10,
          orderBy: { match: { createdAt: 'desc' } }
        },
      },
    });

    return bots.map(b => ({
      id: b.id,
      username: b.username,
      balance: b.wallet?.balance || 0,
      activeGames: this.activeBots.get(b.id) || 0,
      enabled: (b.botConfig as any)?.enabled !== false,
      config: b.botConfig,
      lastMatches: b.matches.map((m: any) => ({
        matchId: m.matchId,
        gameType: m.match.gameType,
        stake: m.match.stake,
        status: m.match.status,
        isWin: m.match.winnerId === b.id,
      })),
    }));
  }


  async updateBotConfig(botId: string, config: any) {
    const active = await this.prisma.user.findUnique({ where: { id: botId } });
    if (!active || !active.isBot) throw new Error('Bot not found');

    const updated = await this.prisma.user.update({
      where: { id: botId },
      data: {
        botConfig: {
          ...(active.botConfig as object),
          ...config,
        },
      },
    });

    return { success: true, config: updated.botConfig };
  }

  async deleteBot(botId: string) {
    const existing = await this.prisma.user.findUnique({ where: { id: botId } });
    if (!existing || !existing.isBot) throw new Error('Bot not found');
    
    // Permanent Hard-Delete including all relations
    await this.prisma.$transaction([
      (this.prisma as any).matchMove.deleteMany({ where: { userId: botId } }),
      (this.prisma as any).matchParticipant.deleteMany({ where: { userId: botId } }),
      (this.prisma as any).botGameState?.deleteMany({ where: { userId: botId } }) || Promise.resolve(),
      (this.prisma as any).transaction.deleteMany({ where: { userId: botId } }),
      (this.prisma as any).depositRequest.deleteMany({ where: { userId: botId } }),
      (this.prisma as any).withdrawalRequest.deleteMany({ where: { userId: botId } }),
      (this.prisma as any).notification.deleteMany({ where: { userId: botId } }),
      (this.prisma as any).wallet.deleteMany({ where: { userId: botId } }),
      (this.prisma as any).user.delete({ where: { id: botId } }),
    ].filter(p => !!p));

    this.activeBots.delete(botId);
    return { success: true, message: `Bot permanently deleted from database` };
  }

  async setBotActiveStatus(botId: string, enabled: boolean) {
    const active = await this.prisma.user.findUnique({ where: { id: botId } });
    if (!active || !active.isBot) throw new Error('Bot not found');

    await this.prisma.user.update({
      where: { id: botId },
      data: {
        botConfig: {
          ...(active.botConfig as object),
          enabled,
        },
      },
    });

    return { success: true, enabled };
  }

  // System Controls
  async start() {
    this.isActive = true;
    // Bulk enable all bots. Handle both NULL and non-NULL botConfig for robustness.
    await this.prisma.$executeRaw`UPDATE "User" SET "botConfig" = '{"enabled": true}'::jsonb WHERE "isBot" = true AND "botConfig" IS NULL`;
    await this.prisma.$executeRaw`UPDATE "User" SET "botConfig" = jsonb_set("botConfig"::jsonb, '{enabled}', 'true') WHERE "isBot" = true AND "botConfig" IS NOT NULL`;
    this.logger.log('Bot system started and all bots enabled');
  }

  async stop() {
    this.isActive = false;
    // Bulk disable all bots
    await this.prisma.$executeRaw`UPDATE "User" SET "botConfig" = '{"enabled": false}'::jsonb WHERE "isBot" = true AND "botConfig" IS NULL`;
    await this.prisma.$executeRaw`UPDATE "User" SET "botConfig" = jsonb_set("botConfig"::jsonb, '{enabled}', 'false') WHERE "isBot" = true AND "botConfig" IS NOT NULL`;
    this.logger.log('Bot system stopped and all bots disabled');
  }

  getIsActive() {
    return this.isActive;
  }
}

