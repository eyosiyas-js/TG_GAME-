import { Controller, Get, Post, Param, UseGuards, Req } from '@nestjs/common';
import { GameService } from './game.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('game')
export class GameController {
  constructor(private gameService: GameService) {}

  @UseGuards(JwtAuthGuard)
  @Get('history')
  getMatchHistory(@Req() req: any) {
    return this.gameService.getMatchHistory(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('stats')
  getStats(@Req() req: any) {
    return this.gameService.getStats(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('active-match')
  getActiveMatch(@Req() req: any) {
    return this.gameService.getActiveMatchForUser(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('forfeit/:matchId')
  async forfeitMatch(@Req() req: any, @Param('matchId') matchId: string) {
    await this.gameService.forfeitMatch(matchId, req.user.userId);
    return { success: true };
  }

  @Get('active')
  getActiveMatches() {
    return this.gameService.getActiveMatches();
  }

  private activePlayerCache: { counts: Record<string, number>; generatedAt: number } | null = null;

  private getActivePlayers(): Record<string, number> {
    const TWO_HOURS = 2 * 60 * 60 * 1000;
    if (!this.activePlayerCache || Date.now() - this.activePlayerCache.generatedAt > TWO_HOURS) {
      this.activePlayerCache = {
        counts: {
          RPS: Math.floor(Math.random() * 51) + 50,
          BINGO: Math.floor(Math.random() * 51) + 50,
          DICE: Math.floor(Math.random() * 51) + 50,
          GUESS: Math.floor(Math.random() * 51) + 50,
        },
        generatedAt: Date.now(),
      };
    }
    return this.activePlayerCache.counts;
  }

  @Get('platform-status')
  async getPlatformStatus() {
    const maintenanceMode = await this.gameService.isMaintenanceMode();
    const gameTypes = ['BINGO', 'RPS', 'DICE', 'GUESS'];
    const disabledGames: string[] = [];
    for (const gt of gameTypes) {
      if (!(await this.gameService.isGameEnabled(gt))) {
        disabledGames.push(gt);
      }
    }
    const betAmounts = await this.gameService.getBetAmounts();
    const activePlayers = this.getActivePlayers();
    return { maintenanceMode, disabledGames, betAmounts, activePlayers };
  }
}
