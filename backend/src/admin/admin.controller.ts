import { Controller, Get, Post, Body, Param, Put, Delete, UseGuards, Req, Ip, Query } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminApiKeyGuard } from '../auth/admin-api-key.guard';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { UpdateUserBanDto, ApproveDepositDto, RejectDepositDto, UpdateSettingDto, SendNotificationDto, UpdateUserBalanceDto } from './dto/admin.dto';

@Controller('admin/api')
@UseGuards(ThrottlerGuard, AdminApiKeyGuard)
@Throttle({ default: { limit: 50, ttl: 60000 } })
export class AdminController {
  constructor(private adminService: AdminService) {}

  // ===================== AUDIT LOGS =====================
  @Get('audit-logs')
  getAuditLogs(
    @Query('page') page = 1,
    @Query('limit') limit = 50,
    @Query('action') action?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) {
    return this.adminService.getAuditLogs(Number(page), Number(limit), action, startDate, endDate);
  }

  @Get('audit-logs/:id')
  getAuditLogDetails(@Param('id') id: string) {
    return this.adminService.getAuditLogDetails(id);
  }

  // ===================== USER MANAGEMENT =====================
  @Get('users')
  getUsers(@Query('page') page = 1, @Query('limit') limit = 50) {
    return this.adminService.getAllUsers(Number(page), Number(limit));
  }

  @Get('users/:id')
  getUserDetails(@Param('id') id: string) {
    return this.adminService.getUserDetails(id);
  }

  @Put('users/:id/ban')
  updateUserBan(@Param('id') id: string, @Body() body: UpdateUserBanDto, @Req() req: any, @Ip() ip: string) {
    return this.adminService.updateUserBan(id, body.isBanned, req.apiKey, ip);
  }

  @Put('users/:id/balance')
  updateUserBalance(@Param('id') id: string, @Body() body: UpdateUserBalanceDto, @Req() req: any, @Ip() ip: string) {
    return this.adminService.updateUserBalance(id, body.balance, req.apiKey, ip);
  }

  @Delete('users/:id')
  deleteUser(@Param('id') id: string, @Req() req: any, @Ip() ip: string) {
    return this.adminService.deleteUser(id, req.apiKey, ip);
  }


  @Get('users/:id/activity')
  getUserActivity(@Param('id') id: string) {
    return this.adminService.getUserActivity(id);
  }

  @Get('users/:id/transactions')
  getUserTransactions(@Param('id') id: string) {
    return this.adminService.getUserTransactions(id);
  }

  // ===================== DEPOSIT MANAGEMENT =====================
  @Get('deposits')
  getDeposits(@Query('page') page = 1, @Query('limit') limit = 50, @Query('status') status?: string) {
    return this.adminService.getAllDeposits(Number(page), Number(limit), status);
  }

  @Get('deposits/:id')
  getDepositDetails(@Param('id') id: string) {
    return this.adminService.getDepositDetails(id);
  }

  @Put('deposits/:id/approve')
  approveDeposit(@Param('id') id: string, @Body() body: ApproveDepositDto, @Req() req: any, @Ip() ip: string) {
    return this.adminService.approveDeposit(id, req.apiKey, ip, body.notes);
  }

  @Put('deposits/:id/reject')
  rejectDeposit(@Param('id') id: string, @Body() body: RejectDepositDto, @Req() req: any, @Ip() ip: string) {
    return this.adminService.rejectDeposit(id, body.reason, req.apiKey, ip);
  }

  // ===================== WITHDRAWAL MANAGEMENT =====================
  @Get('withdrawals')
  getWithdrawals(@Query('page') page = 1, @Query('limit') limit = 50, @Query('status') status?: string) {
    return this.adminService.getAllWithdrawals(Number(page), Number(limit), status);
  }


  @Get('withdrawals/:id')
  getWithdrawalDetails(@Param('id') id: string) {
    return this.adminService.getWithdrawalDetails(id);
  }

  @Put('withdrawals/:id/approve')
  approveWithdrawal(@Param('id') id: string, @Req() req: any, @Ip() ip: string) {
    return this.adminService.approveWithdrawal(id, req.apiKey, ip);
  }

  @Put('withdrawals/:id/reject')
  rejectWithdrawal(@Param('id') id: string, @Body('reason') reason: string, @Req() req: any, @Ip() ip: string) {
    return this.adminService.rejectWithdrawal(id, reason, req.apiKey, ip);
  }

  // ===================== UNIFIED TRANSACTIONS =====================
  @Get('transactions')
  getAllTransactions(@Query('page') page = 1, @Query('limit') limit = 50, @Query('status') status?: string) {
    return this.adminService.getAllTransactions(Number(page), Number(limit), status);
  }

  // ===================== MATCH HISTORY =====================
  @Get('matches')
  getMatches(@Query('page') page = 1, @Query('limit') limit = 50) {
    return this.adminService.getAllMatches(Number(page), Number(limit));
  }

  @Get('matches/stats')
  getMatchStats() {
    return this.adminService.getMatchStats();
  }

  @Get('matches/:id')
  getMatchDetails(@Param('id') id: string) {
    return this.adminService.getMatchDetails(id);
  }

  // ===================== ACTIVE GAMES =====================
  @Get('games/active')
  getLiveGames() {
    return this.adminService.getLiveGames();
  }

  @Get('games/active/:gameId')
  getActiveGameDetails(@Param('gameId') gameId: string) {
    return this.adminService.getActiveGameDetails(gameId);
  }

  @Post('games/:gameId/force-end')
  forceEndGame(@Param('gameId') gameId: string, @Req() req: any, @Ip() ip: string) {
    return this.adminService.forceEndGame(gameId, req.apiKey, ip);
  }

  // ===================== REVENUE ANALYTICS =====================
  @Get('revenue/overview')
  getRevenueOverview() {
    return this.adminService.getRevenueOverview();
  }

  @Get('revenue/daily')
  getDailyRevenue() {
    return this.adminService.getDailyRevenue();
  }

  @Get('revenue/monthly')
  getMonthlyRevenue() {
    return this.adminService.getMonthlyRevenue();
  }

  @Get('revenue/games')
  getRevenueByGame() {
    return this.adminService.getRevenueByGame();
  }

  @Get('revenue/detailed')
  getDetailedRevenue(
    @Query('period') period?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) {
    return this.adminService.getDetailedRevenue(period, startDate, endDate);
  }

  @Get('reports/finances')
  getFinancialReport(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) {
    return this.adminService.getFinancialReport(startDate, endDate);
  }

  @Get('revenue/trends')
  getRevenueTrends(
    @Query('days') days?: string,
    @Query('groupBy') groupBy?: string
  ) {
    return this.adminService.getRevenueTrends(days, groupBy);
  }

  @Get('revenue/commission')
  getCommissionAnalytics(
    @Query('period') period?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) {
    return this.adminService.getCommissionAnalytics(period, startDate, endDate);
  }

  // ===================== SYSTEM SETTINGS =====================
  @Get('settings')
  getSettings() {
    return this.adminService.getSettings();
  }

  @Put('settings/:key')
  updateSetting(@Param('key') key: string, @Body() body: UpdateSettingDto, @Req() req: any, @Ip() ip: string) {
    body.key = key; // ensure key from URL is used
    return this.adminService.updateSetting(body.key, body.value, req.apiKey, ip);
  }

  @Post('settings/bulk')
  updateMultipleSettings(@Body() settings: Record<string, string>, @Req() req: any, @Ip() ip: string) {
    return this.adminService.updateMultipleSettings(settings, req.apiKey, ip);
  }

  @Get('maintenance')
  getMaintenanceStatus() {
    return this.adminService.getMaintenanceStatus();
  }

  // ===================== NOTIFICATIONS =====================
  @Post('notifications/send')
  sendNotification(@Body() body: SendNotificationDto, @Req() req: any, @Ip() ip: string) {
    return this.adminService.sendNotification(body, req.apiKey, ip);
  }

  @Get('notifications/history')
  getNotificationHistory(@Query('page') page = 1, @Query('limit') limit = 50) {
    return this.adminService.getNotificationHistory(Number(page), Number(limit));
  }

  @Get('notifications/admin/users')
  getAdminUsersForNotifications() {
    return this.adminService.getUsersForNotifications();
  }

  @Post('notifications/broadcast')
  broadcastNotification(@Body() body: { title: string; message: string }, @Req() req: any, @Ip() ip: string) {
    const dto = new SendNotificationDto();
    dto.title = body.title;
    dto.body = body.message;
    dto.targetUsers = 'all';
    return this.adminService.sendNotification(dto, req.apiKey, ip);
  }

  // ===================== BOT MANAGEMENT =====================
  @Get('bots/stats')
  getBotStats() {
    return this.adminService.getBotStats();
  }

  @Post('bots/spawn')
  spawnBots(@Body('count') count: number, @Body('type') type: string, @Body('gameType') gameType: string) {
    return this.adminService.spawnBots(count || 5, type || 'NORMAL', gameType || 'BINGO');
  }

  @Get('bots/system/status')
  getBotSystemStatus() {
    return this.adminService.getBotSystemStatus();
  }

  @Get('bots/target-counts')
  getBotTargetCounts() {
    return this.adminService.getBotTargetCounts();
  }

  @Post('bots/target-counts')
  updateBotTargetCounts(@Body() body: Record<string, number>, @Req() req: any, @Ip() ip: string) {
    return this.adminService.updateBotTargetCounts(body, req.apiKey, ip);
  }

  @Post('bots/system/start')
  startBotSystem(@Req() req: any, @Ip() ip: string) {
    return this.adminService.startBotSystem(req.apiKey, ip);
  }

  @Post('bots/system/stop')
  stopBotSystem(@Req() req: any, @Ip() ip: string) {
    return this.adminService.stopBotSystem(req.apiKey, ip);
  }

  @Put('bots/:id/config')
  updateBotConfig(
    @Param('id') id: string,
    @Body() config: any,
    @Req() req: any,
    @Ip() ip: string,
  ) {
    return this.adminService.updateBotConfig(id, config, req.apiKey, ip);
  }

  @Delete('bots/:id')
  deleteBot(@Param('id') id: string, @Req() req: any, @Ip() ip: string) {
    return this.adminService.deleteBot(id, req.apiKey, ip);
  }

  @Post('bots/:id/start')
  startBot(@Param('id') id: string, @Req() req: any, @Ip() ip: string) {
    return this.adminService.setBotActiveStatus(id, true, req.apiKey, ip);
  }

  @Post('bots/:id/stop')
  stopBot(@Param('id') id: string, @Req() req: any, @Ip() ip: string) {
    return this.adminService.setBotActiveStatus(id, false, req.apiKey, ip);
  }
}
