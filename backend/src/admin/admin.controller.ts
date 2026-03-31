import { Controller, Get, Post, Body, Param, Put } from '@nestjs/common';
import { AdminService } from './admin.service';

@Controller('admin')
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('users')
  getUsers() {
    return this.adminService.getAllUsers();
  }

  @Put('users/:id/ban')
  updateUserBan(@Param('id') id: string, @Body() body: { isBanned: boolean }) {
    return this.adminService.updateUserBan(id, body.isBanned);
  }

  @Put('users/:id/balance')
  updateUserBalance(@Param('id') id: string, @Body() body: { balance: number }) {
    return this.adminService.updateUserBalance(id, body.balance);
  }

  @Get('matches')
  getMatches() {
    return this.adminService.getAllMatches();
  }

  @Get('settings')
  getSettings() {
    return this.adminService.getSettings();
  }

  @Put('settings')
  updateSetting(@Body() body: { key: string; value: string }) {
    return this.adminService.updateSetting(body.key, body.value);
  }

  @Get('live-games')
  getLiveGames() {
    return this.adminService.getLiveGames();
  }

  @Get('revenue')
  getRevenue() {
    return this.adminService.getRevenueAnalytics();
  }

  @Get('game-states')
  getGameStates() {
    return this.adminService.getGameStates();
  }

  @Get('maintenance')
  getMaintenanceStatus() {
    return this.adminService.getMaintenanceStatus();
  }

  @Get('tables/:tableName')
  getTableData(@Param('tableName') tableName: string) {
    return this.adminService.getTableData(tableName);
  }

  @Get('deposits')
  getDeposits() {
    return this.adminService.getAllDeposits();
  }

  @Put('deposits/:id/approve')
  approveDeposit(@Param('id') id: string) {
    return this.adminService.approveDeposit(id);
  }

  @Put('deposits/:id/reject')
  rejectDeposit(@Param('id') id: string) {
    return this.adminService.rejectDeposit(id);
  }

  @Get('withdrawals')
  getWithdrawals() {
    return this.adminService.getAllWithdrawals();
  }

  @Put('withdrawals/:id/approve')
  approveWithdrawal(@Param('id') id: string) {
    return this.adminService.approveWithdrawal(id);
  }

  @Put('withdrawals/:id/reject')
  rejectWithdrawal(@Param('id') id: string) {
    return this.adminService.rejectWithdrawal(id);
  }
}
