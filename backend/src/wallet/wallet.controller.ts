import { Controller, Get, Post, Body, UseGuards, Request } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private walletService: WalletService) {}

  @Get('balance')
  getBalance(@Request() req) {
    return this.walletService.getBalance(req.user.userId);
  }

  @Post('deposit')
  deposit(@Request() req, @Body('amount') amount: number) {
    return this.walletService.deposit(req.user.userId, amount);
  }

  @Post('withdraw')
  withdraw(@Request() req, @Body('amount') amount: number) {
    return this.walletService.withdraw(req.user.userId, amount);
  }

  @Post('transfer')
  transfer(@Request() req, @Body('targetUsername') targetUsername: string, @Body('amount') amount: number) {
    return this.walletService.transfer(req.user.userId, targetUsername, amount);
  }

  @Get('transactions')
  getTransactions(@Request() req) {
    return this.walletService.getTransactions(req.user.userId);
  }
}
