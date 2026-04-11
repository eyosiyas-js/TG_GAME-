import { Body, Controller, Post, HttpCode, HttpStatus, Get, Put, UseGuards, Request, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, SetUsernameDto, TelegramLoginDto } from './dto/auth.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { extname } from 'path';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Get('leaderboard')
  getLeaderboard() {
    return this.authService.getLeaderboard();
  }

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('telegram-login')
  telegramLogin(@Body() dto: TelegramLoginDto) {
    return this.authService.telegramLogin(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('set-username')
  setUsername(@Request() req, @Body() dto: SetUsernameDto) {
    return this.authService.setUsername(req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Put('change-username')
  changeUsername(@Request() req, @Body('newUsername') newUsername: string) {
    return this.authService.changeUsername(req.user.userId, newUsername);
  }

  @UseGuards(JwtAuthGuard)
  @Put('change-password')
  changePassword(
    @Request() req,
    @Body('currentPassword') currentPassword: string,
    @Body('newPassword') newPassword: string,
  ) {
    return this.authService.changePassword(req.user.userId, currentPassword, newPassword);
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@Request() req) {
    return this.authService.getProfile(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('avatar')
  @UseInterceptors(
    FileInterceptor('avatar', {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, cb) => {
          const uniqueSuffix = `avatar-${uuidv4()}${extname(file.originalname)}`;
          cb(null, uniqueSuffix);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|gif|webp)$/)) {
          return cb(new BadRequestException('Only image files are allowed'), false);
        }
        cb(null, true);
      },
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
    }),
  )
  uploadAvatar(@Request() req, @UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Avatar file is required');
    }
    const avatarUrl = `/uploads/${file.filename}`;
    return this.authService.updateAvatar(req.user.userId, avatarUrl);
  }
}
