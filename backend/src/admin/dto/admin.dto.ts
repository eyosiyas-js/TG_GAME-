import { IsString, IsBoolean, IsOptional, IsNumber, IsUUID, IsArray, IsEnum } from 'class-validator';

export class UpdateUserBanDto {
  @IsBoolean()
  isBanned: boolean;
}

export class ApproveDepositDto {
  @IsOptional()
  @IsString()
  notes?: string;
}

export class RejectDepositDto {
  @IsString()
  reason: string;
}

export class UpdateSettingDto {
  @IsString()
  key: string;

  @IsString()
  value: string;
}

export class SendNotificationDto {
  @IsString()
  title: string;

  @IsString()
  body: string;

  @IsString()
  targetUsers: string; // 'all' | 'specific' | 'role'

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  userIds?: string[];

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  data?: any;
}
