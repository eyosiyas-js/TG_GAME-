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
}
