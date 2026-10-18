import type { Transporter } from "nodemailer";
import { logger } from "@/lib/logger";
import type { MailMessage, Mailer } from "@/server/ports/mailer";

/** Development mailer: logs the message (including links) instead of sending it. */
export class ConsoleMailer implements Mailer {
  readonly isConfigured = false;

  async send(message: MailMessage): Promise<void> {
    logger.info({ to: message.to, subject: message.subject }, `[mail] ${message.subject}\n${message.text}`);
  }
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
}

export class SmtpMailer implements Mailer {
  readonly isConfigured = true;
  private transporter: Promise<Transporter> | null = null;

  constructor(private readonly config: SmtpConfig) {}

  private getTransporter(): Promise<Transporter> {
    this.transporter ??= import("nodemailer").then((nodemailer) =>
      nodemailer.createTransport({
        host: this.config.host,
        port: this.config.port,
        secure: this.config.secure,
        auth: this.config.user ? { user: this.config.user, pass: this.config.pass } : undefined,
      }),
    );
    return this.transporter;
  }

  async send(message: MailMessage): Promise<void> {
    const transporter = await this.getTransporter();
    await transporter.sendMail({ from: this.config.from, ...message });
  }
}
