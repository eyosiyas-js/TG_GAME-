import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Decimal } from 'decimal.js';

@Injectable()
export class WalletService {
  constructor(private prisma: PrismaService) {}

  async getBalance(userId: string) {
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

    return (this.prisma as any).depositRequest.create({
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

    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    if (new Decimal(wallet.balance.toString()).lessThan(amount)) {
      throw new BadRequestException('Insufficient funds');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return (this.prisma as any).withdrawalRequest.create({
      data: {
        userId,
        amount,
        method,
        phoneNumber: (user as any).phoneNumber,
        status: 'PENDING',
      },
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
}
