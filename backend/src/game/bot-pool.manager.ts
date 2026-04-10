import { Injectable, OnModuleInit, Logger, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GameService } from './game.service';
import { GameGateway } from './game.gateway';
import { WalletService } from '../wallet/wallet.service';
import { GameType } from '@prisma/client';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BotPlayerClient } from './bot-player.client';

const ETHIOPIAN_MALE_NAMES = [
  "abe", "tesgish", "yoni", "dawit", "solomon", "mekonnen", "haile", "tadesse", "berhanu", "getachew", "alemayehu", "girma", "fikru", "nigussie", "kifle", "worku", "kebede", "dejene", "tamiru", "yared", "asfaw", "bekele", "endale", "hailu", "tefera", "desta", "mulatu", "belay", "teshome", "melaku", "fisseha", "admassu", "gemechu", "kassahun", "habtamu", "tsegaye", "sisay", "wondimu", "amanuel", "henok", "nahom", "bereket", "natnael", "eyob", "robel", "yonatan", "ephrem", "surafel", "fitsum", "nahusenay", "dawud", "iskinder", "ermias", "abiy", "rediet", "filmon", "simon", "mikael", "gabriel", "samuel", "daniel", "elias", "kidus", "bisrat", "tewodros", "zerihun", "tesfalem", "biruk", "ashenafi", "tamrat"
];

const ETHIOPIAN_FEMALE_NAMES = [
  "selu", "meskrem", "rahel", "hana", "bethlehem", "eden", "saba", "tsion", "mahlet", "birtukan", "fikirte", "genet", "lemlem", "meseret", "almaz", "tigist", "hewan", "samrawit", "meron", "eyerusalem", "zewditu", "roman", "kidist", "wubit", "saron", "mimi", "sosina", "meaza", "hiwot", "selamawit"
];

function getRandomEthiopianName() {
  const isMale = Math.random() > 0.3;
  const firstNames = isMale ? ETHIOPIAN_MALE_NAMES : ETHIOPIAN_FEMALE_NAMES;
  const first = firstNames[Math.floor(Math.random() * firstNames.length)].toLowerCase();
  return first;
}

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
  ) { }

  async onModuleInit() {
    this.logger.log('BotPoolManager initialized');

    // Rename ALL existing bots on startup to cycle names continuously and fix incorrect ones
    const allBots = await (this.prisma as any).user.findMany({ where: { isBot: true } });
    for (const bot of allBots) {
      await (this.prisma as any).user.update({
        where: { id: bot.id },
        data: { username: getRandomEthiopianName() }
      });
    }

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
        username: getRandomEthiopianName(),
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
    
    // Shuffle the bots to prevent the same bot being picked repeatedly
    for (let i = activeBots.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [activeBots[i], activeBots[j]] = [activeBots[j], activeBots[i]];
    }

    activeBots.sort((a: any, b: any) => {
      const aType = a.botConfig?.botType;
      const bType = b.botConfig?.botType;
      if (aType === 'CHEATER' && bType !== 'CHEATER') return -1;
      if (bType === 'CHEATER' && aType !== 'CHEATER') return 1;
      return 0; // retains shuffled order for non-cheaters safely due to stable sort
    });

    for (const bot of activeBots) {
      const activeCount = this.activeBots.get(bot.id) || 0;
      const config = (bot as any).botConfig;
      if (activeCount < (config?.maxConcurrentGames || 1)) {
        const balanceData = await this.walletService.getBalance(bot.id);
        if (Number(balanceData.total) >= stake) {
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

