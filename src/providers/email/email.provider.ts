import nodemailer, { type Transporter } from 'nodemailer';
import { configuration } from '../../config/configuration';
import { errorMessage } from '../../common/utils';
import { logger } from '../../logger/logger';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export class EmailProvider {
  private readonly transporter: Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: configuration.mail.host,
      port: configuration.mail.port,
      secure: false,
      pool: true,
      maxConnections: 3,
    });
  }

  async verify(): Promise<void> {
    try {
      await this.transporter.verify();
      logger.info('SMTP transport ready');
    } catch (error) {
      logger.warn('SMTP transport not reachable yet', { error: errorMessage(error) });
    }
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transporter.sendMail({ from: configuration.mail.from, ...message });
  }

  close(): void {
    this.transporter.close();
  }
}

export const emailProvider = new EmailProvider();
