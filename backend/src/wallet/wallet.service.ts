import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Decimal } from 'decimal.js';
import { TelemetryService } from '../telemetry/telemetry.service';

@Injectable()
export class WalletService {
  constructor(
    private prisma: PrismaService,
    private telemetry: TelemetryService,
  ) {}

  async getBalance(userId: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    // Return detailed breakdown
    return {
      total: Number(wallet.balance) + Number((wallet as any).bonusBalance),
      withdrawable: Number(wallet.balance),
      bonus: Number((wallet as any).bonusBalance)
    };
  }

  async getWithdrawableBalance(userId: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    return wallet.balance;
  }

  async createDepositRequest(
    userId: string,
    amount: number,
    method: string,
    senderName: string,
    receiptUrl: string,
    transactionId?: string,
  ) {
    if (amount <= 0) {
      throw new BadRequestException('Amount must be positive');
    }

    if (!method || !senderName || !receiptUrl) {
      throw new BadRequestException('Method, sender name, and receipt are required');
    }

    const deposit = await (this.prisma as any).depositRequest.create({
      data: {
        userId,
        amount,
        method,
        senderName,
        transactionId,
        receiptUrl,
        status: 'PENDING',
      },
    });

    // Notify admin about new deposit request
    this.prisma.user.findUnique({ where: { id: userId }, select: { username: true } }).then(user => {
        this.telemetry.notifyDeposit(user?.username || 'Unknown', amount, method).catch(err => {
            console.error('[WalletService] Failed to send deposit notification:', err);
        });
    });

    return deposit;
  }

  async getUserDeposits(userId: string) {
    return (this.prisma as any).depositRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createWithdrawalRequest(userId: string, amount: number, method: string) {
    if (amount <= 0) {
      throw new BadRequestException('Amount must be positive');
    }

    if (!method) {
      throw new BadRequestException('Withdrawal method is required');
    }

    return this.prisma.$transaction(async (tx: any) => {
      const wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet) {
        throw new NotFoundException('Wallet not found');
      }

      if (new Decimal(wallet.balance.toString()).lessThan(amount)) {
        throw new BadRequestException('Insufficient funds');
      }

      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) {
        throw new NotFoundException('User not found');
      }

      await tx.wallet.update({
        where: { userId },
        data: { balance: { decrement: amount } },
      });

      const withdrawal = await tx.withdrawalRequest.create({
        data: {
          userId,
          amount,
          method,
          phoneNumber: user.phoneNumber,
          status: 'PENDING',
        },
      });

      // Notify admin about new withdrawal request
      this.telemetry.notifyWithdrawal(user.username || 'Unknown', amount, method).catch(err => {
          console.error('[WalletService] Failed to send withdrawal notification:', err);
      });

      return withdrawal;
    });
  }

  async getUserWithdrawals(userId: string) {
    return (this.prisma as any).withdrawalRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getUserPreview(username: string) {
    if (!username) {
      throw new BadRequestException('Username is required');
    }
    const user = await this.prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        avatar: true,
        level: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async transfer(senderId: string, targetUsername: string, amount: number) {
    if (amount <= 0) {
      throw new BadRequestException('Amount must be positive');
    }

    const receiver = await this.prisma.user.findUnique({ where: { username: targetUsername } });
    if (!receiver) {
      throw new NotFoundException('Target user not found');
    }

    if (receiver.id === senderId) {
      throw new BadRequestException('Cannot transfer to yourself');
    }

    return this.prisma.$transaction(async (tx) => {
      const senderWallet = await tx.wallet.findUnique({ where: { userId: senderId } });
      if (!senderWallet) throw new NotFoundException('Sender wallet not found');

      if (new Decimal(senderWallet.balance.toString()).lessThan(amount)) {
        throw new BadRequestException('Insufficient funds');
      }

      const updatedSenderWallet = await tx.wallet.update({
        where: { userId: senderId },
        data: { balance: { decrement: amount } },
      });

      await tx.wallet.update({
        where: { userId: receiver.id },
        data: { balance: { increment: amount } },
      });

      await tx.transaction.create({
        data: { userId: senderId, amount: -amount, type: 'TRANSFER' as any },
      });
      
      await tx.transaction.create({
        data: { userId: receiver.id, amount, type: 'TRANSFER' as any },
      });

      return updatedSenderWallet;
    });
  }

  async addBalance(userId: string, amount: number, notes: string = 'Adjustment') {
    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.update({
        where: { userId },
        data: { balance: { increment: amount } },
      });
      await tx.transaction.create({
        data: { userId, amount, type: 'DEPOSIT' as any, status: 'APPROVED', notes } as any,
      });
      return wallet;
    });
  }

  async subtractBalance(userId: string, amount: number, notes: string = 'Adjustment') {
    return this.prisma.$transaction(async (tx: any) => {
      const wallet = await tx.wallet.update({
        where: { userId },
        data: { balance: { decrement: amount } },
      });
      await tx.transaction.create({
        data: { userId, amount: -amount, type: 'WITHDRAW' as any, status: 'APPROVED', notes } as any,
      });
      return wallet;
    });
  }

  async getTransactions(userId: string) {
    return this.prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  async getDepositOptions() {
    const keys = [
      'PAY_CBE_1_NUM', 'PAY_CBE_1_NAME', 'PAY_CBE_2_NUM', 'PAY_CBE_2_NAME',
      'PAY_CBEBIRR_1_NUM', 'PAY_CBEBIRR_1_NAME', 'PAY_CBEBIRR_2_NUM', 'PAY_CBEBIRR_2_NAME',
      'PAY_TELEBIRR_1_NUM', 'PAY_TELEBIRR_1_NAME', 'PAY_TELEBIRR_2_NUM', 'PAY_TELEBIRR_2_NAME'
    ];
    
    const settings = await (this.prisma as any).systemSetting.findMany({
      where: { key: { in: keys } }
    });

    const config: Record<string, string> = {};
    settings.forEach((s: any) => { config[s.key] = s.value; });

    return [
      {
        method: 'CBE',
        accounts: [
          { number: config['PAY_CBE_1_NUM'], name: config['PAY_CBE_1_NAME'] },
          { number: config['PAY_CBE_2_NUM'], name: config['PAY_CBE_2_NAME'] }
        ].filter(a => a.number)
      },
      {
        method: 'CBEBIRR',
        accounts: [
          { number: config['PAY_CBEBIRR_1_NUM'], name: config['PAY_CBEBIRR_1_NAME'] },
          { number: config['PAY_CBEBIRR_2_NUM'], name: config['PAY_CBEBIRR_2_NAME'] }
        ].filter(a => a.number)
      },
      {
        method: 'TELEBIRR',
        accounts: [
          { number: config['PAY_TELEBIRR_1_NUM'], name: config['PAY_TELEBIRR_1_NAME'] },
          { number: config['PAY_TELEBIRR_2_NUM'], name: config['PAY_TELEBIRR_2_NAME'] }
        ].filter(a => a.number)
      }
    ];
  }

  async getDepositSettings() {
    const keys = [
      'PAY_CBE_1_NUM', 'PAY_CBE_1_NAME', 'PAY_CBE_2_NUM', 'PAY_CBE_2_NAME',
      'PAY_CBEBIRR_1_NUM', 'PAY_CBEBIRR_1_NAME', 'PAY_CBEBIRR_2_NUM', 'PAY_CBEBIRR_2_NAME',
      'PAY_TELEBIRR_1_NUM', 'PAY_TELEBIRR_1_NAME', 'PAY_TELEBIRR_2_NUM', 'PAY_TELEBIRR_2_NAME'
    ];
    
    const settings = await (this.prisma as any).systemSetting.findMany({
      where: { key: { in: keys } }
    });

    const config: Record<string, string> = {};
    settings.forEach((s: any) => { config[s.key] = s.value; });
    return config;
  }
}
