import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { RegisterDto, LoginDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });

    if (existingUser) {
      throw new ConflictException('Username already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          username: dto.username,
          passwordHash,
        },
      });

      await tx.wallet.create({
        data: {
          userId: newUser.id,
          balance: 1000.00,
        },
      });

      return newUser;
    });

    return this.signToken(user.id, user.username);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const pwMatches = await bcrypt.compare(dto.password, user.passwordHash);

    if (!pwMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.signToken(user.id, user.username);
  }

  async getLeaderboard() {
    const users = await this.prisma.user.findMany({
      take: 10,
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
      wins: u._count.matches, // Approximate wins
      earnings: Number(u.wallet?.balance || 0),
      isYou: false, // Will be handled on frontend
    }));
  }

  async signToken(userId: string, username: string) {
    const payload = { sub: userId, username };
    const token = await this.jwt.signAsync(payload);

    return {
      access_token: token,
      user: {
        id: userId,
        username,
      },
    };
  }
}
