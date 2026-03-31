import { Body, Controller, Post, HttpCode, HttpStatus, Get, Put, UseGuards, Request } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, SetUsernameDto } from './dto/auth.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

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
}
