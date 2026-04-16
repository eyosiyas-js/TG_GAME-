import { IsString, MinLength, Matches, IsOptional } from 'class-validator';

export class RegisterDto {
  @IsString()
  @Matches(/^[0-9]{10,15}$/, { message: 'Phone number must be 10-15 digits' })
  phoneNumber: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsString()
  telegramId?: string;

  @IsOptional()
  @IsString()
  referredBy?: string;
}

export class TelegramLoginDto {
  @IsString()
  telegramId: string;
}

export class LoginDto {
  @IsString()
  phoneNumber: string;

  @IsString()
  password: string;
}

export class SetUsernameDto {
  @IsString()
  @MinLength(3)
  username: string;
}
