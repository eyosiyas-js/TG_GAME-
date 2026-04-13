import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TelemetryService {
  private readonly botToken: string;
  private readonly adminId: string;

  constructor(private config: ConfigService) {
    this.botToken = this.config.get<string>('BOT_TOKEN');
    this.adminId = this.config.get<string>('ADMIN_TELEGRAM_ID');
  }

  async sendAdminMessage(text: string) {
    if (!this.botToken || !this.adminId) {
      console.warn('[Telemetry] Missing BOT_TOKEN or ADMIN_TELEGRAM_ID. Notification skipped.');
      return;
    }

    try {
      const response = await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.adminId,
          text: text,
          parse_mode: 'HTML',
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('[Telemetry] Telegram API error:', error);
      }
    } catch (error) {
      console.error('[Telemetry] Failed to send telegram notification:', error);
    }
  }

  async notifyRegistration(phoneNumber: string, username?: string) {
    const text = `👤 <b>New User Registered!</b>\n\n` +
                 `📱 Phone: <code>${phoneNumber}</code>\n` +
                 `👤 User: <b>${username || 'N/A'}</b>\n` +
                 `⏰ Time: ${new Date().toLocaleString()}`;
    return this.sendAdminMessage(text);
  }

  async notifyDeposit(username: string, amount: number, method: string) {
    const text = `💰 <b>Deposit Request!</b>\n\n` +
                 `👤 User: <b>${username}</b>\n` +
                 `💵 Amount: <b>${amount} ETB</b>\n` +
                 `🏧 Method: <b>${method}</b>\n` +
                 `⏰ Time: ${new Date().toLocaleString()}`;
    return this.sendAdminMessage(text);
  }

  async notifyWithdrawal(username: string, amount: number, method: string) {
    const text = `💸 <b>Withdrawal Request!</b>\n\n` +
                 `👤 User: <b>${username}</b>\n` +
                 `💵 Amount: <b>${amount} ETB</b>\n` +
                 `🏧 Method: <b>${method}</b>\n` +
                 `⏰ Time: ${new Date().toLocaleString()}`;
    return this.sendAdminMessage(text);
  }
}
