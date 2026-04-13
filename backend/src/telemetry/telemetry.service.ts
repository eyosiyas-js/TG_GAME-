import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TelemetryService {
  private readonly botToken: string | undefined;
  private readonly adminIds: string[];

  constructor(private config: ConfigService) {
    this.botToken = this.config.get<string>('BOT_TOKEN');
    const adminIdString = this.config.get<string>('ADMIN_TELEGRAM_ID') || '';
    this.adminIds = adminIdString.split(',').map(id => id.trim()).filter(id => id.length > 0);
  }

  async sendAdminMessage(text: string, buttons?: { text: string; callback_data: string }[]) {
    if (!this.botToken || this.adminIds.length === 0) {
      console.warn('[Telemetry] Missing BOT_TOKEN or ADMIN_TELEGRAM_ID. Notification skipped.');
      return;
    }

    const reply_markup = buttons && buttons.length > 0 ? {
      inline_keyboard: [
        buttons.map(b => ({
          text: b.text,
          callback_data: b.callback_data
        }))
      ]
    } : undefined;

    console.log(`[Telemetry] Sending notification to ${this.adminIds.length} admins. Buttons: ${!!buttons}`);

    // Notify all admins in the list
    for (const adminId of this.adminIds) {
      try {
        const payload = {
            chat_id: adminId,
            text: text,
            parse_mode: 'HTML',
            reply_markup,
        };

        const response = await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const error = await response.json();
          console.error(`[Telemetry] Telegram API error for admin ${adminId}:`, JSON.stringify(error));
        } else {
          console.log(`[Telemetry] Notification sent successfully to ${adminId}`);
        }
      } catch (error) {
        console.error(`[Telemetry] Failed for admin ${adminId}:`, error);
      }
    }
  }

  async notifyRegistration(phoneNumber: string, username?: string) {
    const text = `👤 <b>New User Registered!</b>\n\n` +
                 `📱 Phone: <code>${phoneNumber}</code>\n` +
                 `👤 User: <b>${username || 'N/A'}</b>\n` +
                 `⏰ Time: ${new Date().toLocaleString()}`;
    return this.sendAdminMessage(text);
  }

  async notifyDeposit(username: string, amount: number, method: string, id: string) {
    const text = `💰 <b>Deposit Request!</b>\n\n` +
                 `👤 User: <b>${username}</b>\n` +
                 `💵 Amount: <b>${amount} ETB</b>\n` +
                 `🏧 Method: <b>${method}</b>\n` +
                 `⏰ Time: ${new Date().toLocaleString()}`;
    
    return this.sendAdminMessage(text, [
      { text: '✅ Approve', callback_data: `approve_dep:${id}` },
      { text: '❌ Reject', callback_data: `reject_dep:${id}` }
    ]);
  }

  async notifyWithdrawal(username: string, amount: number, method: string, id: string) {
    const text = `💸 <b>Withdrawal Request!</b>\n\n` +
                 `👤 User: <b>${username}</b>\n` +
                 `💵 Amount: <b>${amount} ETB</b>\n` +
                 `🏧 Method: <b>${method}</b>\n` +
                 `⏰ Time: ${new Date().toLocaleString()}`;
    
    return this.sendAdminMessage(text, [
      { text: '✅ Approve', callback_data: `approve_wd:${id}` },
      { text: '❌ Reject', callback_data: `reject_wd:${id}` }
    ]);
  }
}
