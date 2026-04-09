import { Controller, Get, Post, Body, UseGuards, Request, Param, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { extname } from 'path';

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private walletService: WalletService) {}

  @Get('balance')
  getBalance(@Request() req) {
    return this.walletService.getBalance(req.user.userId);
  }

  @Get('withdrawable')
  getWithdrawable(@Request() req) {
    return this.walletService.getWithdrawableBalance(req.user.userId);
  }

  @Get('deposit-options')
  getDepositOptions() {
    return this.walletService.getDepositOptions();
  }

  @Get('settings')
  getDepositSettings() {
    return this.walletService.getDepositSettings();
  }

  @Get('user-preview/:username')
  getUserPreview(@Param('username') username: string) {
    return this.walletService.getUserPreview(username);
  }

  @Post('deposit')
  @UseInterceptors(
    FileInterceptor('receipt', {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, cb) => {
          const uniqueSuffix = uuidv4() + extname(file.originalname);
          cb(null, uniqueSuffix);
        },
      }),
    }),
  )
  deposit(
    @Request() req,
    @Body('amount') amount: string,
    @Body('method') method: string,
    @Body('senderName') senderName: string,
    @UploadedFile() receipt: Express.Multer.File,
    @Body('transactionId') transactionId?: string,
  ) {
    if (!receipt) {
      throw new BadRequestException('Receipt file is required');
    }
    const receiptUrl = `/uploads/${receipt.filename}`;
    return this.walletService.createDepositRequest(
      req.user.userId,
      Number(amount),
      method,
      senderName,
      receiptUrl,
      transactionId,
    );
  }

  @Get('deposits')
  getDeposits(@Request() req) {
    return this.walletService.getUserDeposits(req.user.userId);
  }

  @Post('withdraw')
  withdraw(@Request() req, @Body('amount') amount: number, @Body('method') method: string) {
    return this.walletService.createWithdrawalRequest(req.user.userId, amount, method);
  }

  @Get('withdrawals')
  getWithdrawals(@Request() req) {
    return this.walletService.getUserWithdrawals(req.user.userId);
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
