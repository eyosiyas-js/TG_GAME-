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

  async deposit(userId: string, amount: number) {
    if (amount <= 0) {
      throw new BadRequestException('Amount must be positive');
    }

    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.update({
        where: { userId },
        data: {
          balance: { increment: amount },
        },
      });

      await tx.transaction.create({
        data: {
          userId,
          amount,
          type: 'DEPOSIT',
        },
      });

      return wallet;
    });
  }

  async withdraw(userId: string, amount: number) {
    if (amount <= 0) {
      throw new BadRequestException('Amount must be positive');
    }

    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({
        where: { userId },
      });

      if (!wallet) {
        throw new NotFoundException('Wallet not found');
      }

      if (new Decimal(wallet.balance.toString()).lessThan(amount)) {
        throw new BadRequestException('Insufficient funds');
      }

      const updatedWallet = await tx.wallet.update({
        where: { userId },
        data: {
          balance: { decrement: amount },
        },
      });

      await tx.transaction.create({
        data: {
          userId,
          amount: -amount,
          type: 'WITHDRAW',
        },
      });

      return updatedWallet;
    });
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
        data: { userId: senderId, amount: -amount, type: 'TRANSFER' },
      });
      
      await tx.transaction.create({
        data: { userId: receiver.id, amount, type: 'TRANSFER' },
      });

      return updatedSenderWallet;
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
