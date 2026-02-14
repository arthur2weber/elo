import TelegramBot from 'node-telegram-bot-api';
import path from 'path';
import Database from 'better-sqlite3';

export interface NotificationConfig {
  telegramBotToken?: string;
  telegramChatId?: string;
  enabled: boolean;
}

export interface NotificationMessage {
  title: string;
  message: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  category: 'security' | 'system' | 'maintenance' | 'info';
  metadata?: Record<string, any>;
}

export class NotificationService {
  private bot?: TelegramBot;
  private config: NotificationConfig;
  private db: Database.Database;

  constructor(config: NotificationConfig, dbPath: string = path.join(process.cwd(), 'data', 'elo.db')) {
    this.config = config;
    this.db = new Database(dbPath);

    if (config.enabled && config.telegramBotToken && config.telegramChatId) {
      this.bot = new TelegramBot(config.telegramBotToken, { polling: false });
      console.log('📱 Telegram notification service initialized');
    } else {
      console.log('📱 Telegram notifications disabled (missing config)');
    }
  }

  /**
   * Send a notification
   */
  async send(notification: NotificationMessage): Promise<boolean> {
    if (!this.bot || !this.config.enabled) {
      console.log('📱 Notification skipped (service disabled):', notification.title);
      return false;
    }

    try {
      // Format message with emoji based on priority/category
      const emoji = this.getEmoji(notification);
      const formattedMessage = `${emoji} **${notification.title}**\n\n${notification.message}`;

      // Send via Telegram
      await this.bot.sendMessage(this.config.telegramChatId!, formattedMessage, {
        parse_mode: 'Markdown',
        disable_notification: notification.priority === 'low'
      });

      // Log to database
      this.logNotification(notification);

      console.log('📱 Notification sent:', notification.title);
      return true;

    } catch (error) {
      console.error('📱 Failed to send notification:', error);
      return false;
    }
  }

  /**
   * Send security alert for unknown person
   */
  async alertUnknownPerson(cameraId: string, confidence: number, imageUrl?: string): Promise<boolean> {
    const notification: NotificationMessage = {
      title: 'Pessoa Desconhecida Detectada',
      message: `Uma pessoa desconhecida foi detectada na câmera ${cameraId} com ${Math.round(confidence * 100)}% de confiança.`,
      priority: 'high',
      category: 'security',
      metadata: { cameraId, confidence, imageUrl }
    };

    return this.send(notification);
  }

  /**
   * Send security alert for blocked action
   */
  async alertBlockedAction(personName: string, deviceId: string, action: string, reason: string): Promise<boolean> {
    const notification: NotificationMessage = {
      title: 'Ação Bloqueada',
      message: `${personName} tentou executar "${action}" no dispositivo ${deviceId}.\n\nMotivo: ${reason}`,
      priority: 'medium',
      category: 'security',
      metadata: { personName, deviceId, action, reason }
    };

    return this.send(notification);
  }

  /**
   * Send system alert
   */
  async alertSystemError(error: string, component: string): Promise<boolean> {
    const notification: NotificationMessage = {
      title: 'Erro do Sistema',
      message: `Erro no componente ${component}:\n\n${error}`,
      priority: 'high',
      category: 'system',
      metadata: { error, component }
    };

    return this.send(notification);
  }

  /**
   * Send maintenance alert
   */
  async alertMaintenance(deviceId: string, issue: string, recommendation: string): Promise<boolean> {
    const notification: NotificationMessage = {
      title: 'Manutenção Necessária',
      message: `Dispositivo ${deviceId} precisa de atenção:\n\n${issue}\n\nRecomendação: ${recommendation}`,
      priority: 'medium',
      category: 'maintenance',
      metadata: { deviceId, issue, recommendation }
    };

    return this.send(notification);
  }

  /**
   * Send info notification
   */
  async sendInfo(title: string, message: string): Promise<boolean> {
    const notification: NotificationMessage = {
      title,
      message,
      priority: 'low',
      category: 'info'
    };

    return this.send(notification);
  }

  private getEmoji(notification: NotificationMessage): string {
    if (notification.category === 'security') {
      return notification.priority === 'critical' ? '🚨' : '🔒';
    }
    if (notification.category === 'system') {
      return '⚠️';
    }
    if (notification.category === 'maintenance') {
      return '🔧';
    }
    return 'ℹ️';
  }

  private logNotification(notification: NotificationMessage): void {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO notifications (title, message, priority, category, metadata, sent_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        notification.title,
        notification.message,
        notification.priority,
        notification.category,
        JSON.stringify(notification.metadata || {}),
        new Date().toISOString()
      );
    } catch (error) {
      console.error('Failed to log notification:', error);
    }
  }

  /**
   * Get recent notifications
   */
  getRecentNotifications(limit: number = 50): any[] {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM notifications
        ORDER BY sent_at DESC
        LIMIT ?
      `);

      return stmt.all(limit);
    } catch (error) {
      console.error('Failed to get notifications:', error);
      return [];
    }
  }
}

// Singleton instance
let notificationService: NotificationService | null = null;

export function getNotificationService(): NotificationService | null {
  return notificationService;
}

export function initNotificationService(config: NotificationConfig, dbPath?: string): NotificationService {
  notificationService = new NotificationService(config, dbPath);
  return notificationService;
}