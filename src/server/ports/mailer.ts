export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface Mailer {
  /** Whether real email delivery is configured (SMTP). */
  readonly isConfigured: boolean;
  send(message: MailMessage): Promise<void>;
}
