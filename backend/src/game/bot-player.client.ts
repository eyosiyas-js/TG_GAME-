import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GameService } from './game.service';
import { GameGateway } from './game.gateway';

@Injectable()
export class BotPlayerClient {
  private readonly logger = new Logger(BotPlayerClient.name);

  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => GameService))
    private gameService: GameService,
    @Inject(forwardRef(() => GameGateway))
    private gameGateway: GameGateway,
  ) {}

  async onGameStart(matchId: string, botUserId: string, gameType: string = 'BINGO') {
    this.logger.log(`Bot ${botUserId} handling ${gameType} game start for match ${matchId}`);
    if (gameType === 'BINGO') {
      this.checkTurn(matchId, botUserId);
    } else if (gameType === 'RPS') {
      await this.handleRpsTurn(matchId, botUserId);
    } else if (gameType === 'DICE') {
      await this.handleDiceTurn(matchId, botUserId);
    }
  }

  async checkTurn(matchId: string, botUserId: string) {
    const state = this.gameService.getBingoState(matchId);
    if (!state || state.winnerId) return;

    const currentTurnUserId = state.turnOrder[state.currentTurnIndex];
    if (currentTurnUserId === botUserId) {
      await this.handleBotTurn(matchId, botUserId);
    }
  }

  private async handleBotTurn(matchId: string, botUserId: string) {
    const user = await (this.prisma as any).user.findUnique({ where: { id: botUserId } });
    const config = (user?.botConfig as any) || { minDelay: 1000, maxDelay: 3000 };
    
    let delay = Math.floor(Math.random() * (config.maxDelay - config.minDelay)) + config.minDelay;

    setTimeout(async () => {
      try {
        const state = this.gameService.getBingoState(matchId);
        if (!state || state.winnerId) return;

        if (state.turnOrder[state.currentTurnIndex] !== botUserId) return;

        const botPlayer = state.players.find(p => p.userId === botUserId);
        if (!botPlayer) return;

        const availableNumbers = botPlayer.board.filter(num => !state.calledNumbers.includes(num));
        if (availableNumbers.length === 0) return;

        const numberToCall = availableNumbers[Math.floor(Math.random() * availableNumbers.length)];
        this.logger.log(`Bot ${botUserId} randomly calling number ${numberToCall}`);
        
        await (this.gameGateway as any).handleBingoCall(
          { data: { user: { userId: botUserId } }, emit: () => {} } as any, // Mock Socket
          { matchId, number: numberToCall }
        );
      } catch (e) {
        this.logger.error(`Error in bot turn: ${e.message}`);
      }
    }, delay);
  }

  private async handleRpsTurn(matchId: string, botUserId: string) {
    const user = await (this.prisma as any).user.findUnique({ where: { id: botUserId } });
    const config = (user?.botConfig as any) || { minDelay: 1000, maxDelay: 3000 };
    
    let delay = Math.floor(Math.random() * (config.maxDelay - config.minDelay)) + config.minDelay;

    setTimeout(async () => {
      try {
        const moves = ['rock', 'paper', 'scissors'];
        const randomMove = moves[Math.floor(Math.random() * moves.length)];
        this.logger.log(`Bot ${botUserId} submitting RPS move: ${randomMove}`);

        await (this.gameGateway as any).handleMatchMove(
          { data: { user: { userId: botUserId } }, emit: () => {} } as any, // Mock Socket
          { matchId, move: randomMove }
        );
      } catch (e) {
        this.logger.error(`Error in bot RPS turn: ${e.message}`);
      }
    }, delay);
  }

  private async handleDiceTurn(matchId: string, botUserId: string) {
    const user = await (this.prisma as any).user.findUnique({ where: { id: botUserId } });
    const config = (user?.botConfig as any) || { minDelay: 1000, maxDelay: 3000 };
    
    // First roll
    let delay1 = Math.floor(Math.random() * (config.maxDelay - config.minDelay)) + config.minDelay;
    
    setTimeout(async () => {
      try {
        this.logger.log(`Bot ${botUserId} submitting Dice roll`);
        await (this.gameGateway as any).handleMatchMove(
          { data: { user: { userId: botUserId } }, emit: () => {} } as any,
          { matchId, move: 'roll' }
        );

        // Second roll or keep
        let delay2 = Math.floor(Math.random() * (config.maxDelay - config.minDelay)) + config.minDelay;
        setTimeout(async () => {
           try {
              // Bot strategy: if score is high, it might keep, but let's keep it simple: roll twice for cheaters
              // Actually, cheaters don't care about the real score, they get overridden at the end.
              // So for appearance, let's roll twice 70% of the time.
              const move = Math.random() > 0.3 ? 'roll_again' : 'keep';
              this.logger.log(`Bot ${botUserId} submitting Dice second move: ${move}`);
              await (this.gameGateway as any).handleMatchMove(
                { data: { user: { userId: botUserId } }, emit: () => {} } as any,
                { matchId, move }
              );
           } catch (e) {
              this.logger.error(`Error in bot Dice second roll: ${e.message}`);
           }
        }, delay2);

      } catch (e) {
        this.logger.error(`Error in bot Dice turn: ${e.message}`);
      }
    }, delay1);
  }
}
