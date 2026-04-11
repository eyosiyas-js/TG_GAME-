import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { RegisterDto, LoginDto, SetUsernameDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { phoneNumber: dto.phoneNumber },
    });

    if (existingUser) {
      throw new ConflictException('Phone number already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          phoneNumber: dto.phoneNumber,
          passwordHash,
          telegramId: dto.telegramId || null,
        },
      });

      await tx.wallet.create({
        data: {
          userId: newUser.id,
          balance: 0.00,
          bonusBalance: 20.00,
        },
      });

      return newUser;
    });

    return this.signToken(user.id, user.username, user.phoneNumber);
  }

  async telegramLogin(dto: { telegramId: string }) {
    const user = await this.prisma.user.findUnique({
      where: { telegramId: dto.telegramId },
    });

    if (!user) {
      throw new UnauthorizedException('Telegram account not registered');
    }

    if (user.isBanned) {
      throw new UnauthorizedException('Your account has been banned');
    }

    return this.signToken(user.id, user.username, user.phoneNumber);
  }

  async login(dto: LoginDto) {
    let user = await this.prisma.user.findUnique({
      where: { phoneNumber: dto.phoneNumber },
    });

    if (!user && dto.phoneNumber.startsWith('09')) {
      user = await this.prisma.user.findUnique({
        where: { phoneNumber: '+251' + dto.phoneNumber.substring(1) },
      });
    }

    if (!user && dto.phoneNumber.startsWith('+2519')) {
      user = await this.prisma.user.findUnique({
        where: { phoneNumber: '0' + dto.phoneNumber.substring(4) },
      });
    }

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.isBanned) {
      throw new UnauthorizedException('Your account has been banned');
    }

    const pwMatches = await bcrypt.compare(dto.password, user.passwordHash);

    if (!pwMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.signToken(user.id, user.username, user.phoneNumber);
  }

  async setUsername(userId: string, dto: SetUsernameDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.username) {
      throw new ConflictException('Username is already set');
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });

    if (existingUser) {
      throw new ConflictException('Username already taken');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { username: dto.username },
    });

    return this.signToken(updatedUser.id, updatedUser.username, updatedUser.phoneNumber);
  }

  async changeUsername(userId: string, newUsername: string) {
    if (!newUsername || newUsername.length < 3) {
      throw new ConflictException('Username must be at least 3 characters');
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { username: newUsername },
    });

    if (existingUser) {
      throw new ConflictException('Username already taken');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { username: newUsername },
    });

    return this.signToken(updatedUser.id, updatedUser.username, updatedUser.phoneNumber);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    if (!newPassword || newPassword.length < 6) {
      throw new ConflictException('New password must be at least 6 characters');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const pwMatches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!pwMatches) {
      throw new UnauthorizedException('Incorrect current password');
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash },
    });

    return { success: true };
  }

  async getLeaderboard() {
    const users = await this.prisma.user.findMany({
      take: 10,
      where: { username: { not: null }, isBot: false },
      include: {
        wallet: true,
        _count: {
          select: { matches: true },
        },
      },
      orderBy: {
        wallet: { balance: 'desc' },
      },
    });

    return users.map((u, i) => ({
      rank: i + 1,
      name: u.username,
      wins: u._count.matches + u.bonusMatches,
      earnings: Number(u.wallet?.balance || 0),
      isYou: false,
    }));
  }

  async updateAvatar(userId: string, avatarUrl: string) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { avatar: avatarUrl },
    });

    return {
      avatar: user.avatar,
      user: {
        id: user.id,
        username: user.username,
        phoneNumber: user.phoneNumber,
        avatar: user.avatar,
      },
    };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, phoneNumber: true, avatar: true, level: true, exp: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }

  async signToken(userId: string, username: string | null, phoneNumber: string) {
    const payload = { sub: userId, username, phoneNumber };
    const token = await this.jwt.signAsync(payload);

    // Fetch avatar to include in response
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatar: true },
    });

    return {
      access_token: token,
      user: {
        id: userId,
        username,
        phoneNumber,
        avatar: user?.avatar || null,
      },
    };
  }
}
