import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { User } from '../entities/user.entity';
import { Provider } from '../entities/provider.entity';
import { Lead } from '../entities/lead.entity';

/** Minimal recipient shape accepted by transactional templates. Both
 *  User (firstName) and Provider (companyName) satisfy this interface. */
export interface EmailRecipient {
  email: string;
  firstName?: string;
  companyName?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private resend: Resend | null = null;
  private fromEmail: string;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    this.fromEmail = process.env.EMAIL_FROM || 'onboarding@settleinpeace.com';

    if (apiKey) {
      this.resend = new Resend(apiKey);
      this.logger.log('Resend email service initialized');
    } else {
      this.logger.warn('RESEND_API_KEY not set — emails will be logged to console only');
    }
  }

  /** Generic sender for transactional/program email (nurture, digests). */
  async sendEmail(toEmail: string, subject: string, html: string): Promise<boolean> {
    if (!this.resend) {
      this.logger.log(`[DEV EMAIL] To: ${toEmail} | Subject: ${subject}`);
      return true;
    }
    try {
      const { error } = await this.resend.emails.send({
        from: this.fromEmail,
        to: toEmail,
        subject,
        html,
      });
      if (error) {
        this.logger.error(`Failed to send email to ${toEmail}: ${error.message}`);
        return false;
      }
      return true;
    } catch (err) {
      this.logger.error(`Email send error: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  async sendOtpEmail(toEmail: string, code: string, firstName?: string): Promise<boolean> {
    const subject = 'Your Settle In Peace verification code';
    const html = this.renderOtpTemplate(code, firstName);

    if (!this.resend) {
      this.logger.log(`[DEV EMAIL] To: ${toEmail} | Subject: ${subject} | Code: ${code}`);
      return true;
    }

    try {
      const { error } = await this.resend.emails.send({
        from: this.fromEmail,
        to: toEmail,
        subject,
        html,
      });

      if (error) {
        this.logger.error(`Failed to send OTP email: ${error.message}`);
        return false;
      }

      this.logger.log(`OTP email sent to ${toEmail}`);
      return true;
    } catch (err) {
      this.logger.error(`Email send error: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  async sendVerificationEmail(toEmail: string, token: string, firstName?: string): Promise<boolean> {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3025';
    const verifyUrl = `${frontendUrl}/verify-email?token=${token}`;
    const subject = 'Verify your email — Settle In Peace';
    const html = this.renderVerificationTemplate(verifyUrl, firstName);

    if (!this.resend) {
      this.logger.log(`[DEV EMAIL] To: ${toEmail} | Subject: ${subject} | Verify URL: ${verifyUrl}`);
      return true;
    }

    try {
      const { error } = await this.resend.emails.send({
        from: this.fromEmail,
        to: toEmail,
        subject,
        html,
      });

      if (error) {
        this.logger.error(`Failed to send verification email: ${error.message}`);
        return false;
      }

      this.logger.log(`Verification email sent to ${toEmail}`);
      return true;
    } catch (err) {
      this.logger.error(`Email send error: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  async sendPasswordResetEmail(toEmail: string, token: string, firstName?: string): Promise<boolean> {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3025';
    const resetUrl = `${frontendUrl}/reset-password?token=${token}`;
    const subject = 'Reset your password — Settle In Peace';
    const html = this.renderPasswordResetTemplate(resetUrl, firstName);

    if (!this.resend) {
      this.logger.log(`[DEV EMAIL] To: ${toEmail} | Subject: ${subject} | Reset URL: ${resetUrl}`);
      return true;
    }

    try {
      const { error } = await this.resend.emails.send({
        from: this.fromEmail,
        to: toEmail,
        subject,
        html,
      });

      if (error) {
        this.logger.error(`Failed to send password reset email: ${error.message}`);
        return false;
      }

      this.logger.log(`Password reset email sent to ${toEmail}`);
      return true;
    } catch (err) {
      this.logger.error(`Email send error: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  async sendWelcomeEmail(toEmail: string, firstName?: string): Promise<boolean> {
    const subject = 'Welcome to Settle In Peace';
    const html = this.renderWelcomeTemplate(firstName);

    if (!this.resend) {
      this.logger.log(`[DEV EMAIL] To: ${toEmail} | Subject: ${subject}`);
      return true;
    }

    try {
      const { error } = await this.resend.emails.send({
        from: this.fromEmail,
        to: toEmail,
        subject,
        html,
      });

      if (error) {
        this.logger.error(`Failed to send welcome email: ${error.message}`);
        return false;
      }

      return true;
    } catch (err) {
      this.logger.error(`Email send error: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  async sendProviderApprovalEmail(toEmail: string, companyName: string): Promise<boolean> {
    const subject = 'Your provider account has been approved — Settle In Peace';
    const html = this.renderProviderApprovalTemplate(companyName);

    if (!this.resend) {
      this.logger.log(`[DEV EMAIL] To: ${toEmail} | Subject: ${subject}`);
      return true;
    }

    try {
      const { error } = await this.resend.emails.send({
        from: this.fromEmail,
        to: toEmail,
        subject,
        html,
      });

      if (error) {
        this.logger.error(`Failed to send provider approval email: ${error.message}`);
        return false;
      }

      this.logger.log(`Provider approval email sent to ${toEmail}`);
      return true;
    } catch (err) {
      this.logger.error(`Email send error: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  async sendProviderRejectionEmail(toEmail: string, companyName: string, reason?: string): Promise<boolean> {
    const subject = 'Your provider application was not approved — Settle In Peace';
    const html = this.renderProviderRejectionTemplate(companyName, reason);

    if (!this.resend) {
      this.logger.log(`[DEV EMAIL] To: ${toEmail} | Subject: ${subject}`);
      return true;
    }

    try {
      const { error } = await this.resend.emails.send({
        from: this.fromEmail,
        to: toEmail,
        subject,
        html,
      });

      if (error) {
        this.logger.error(`Failed to send provider rejection email: ${error.message}`);
        return false;
      }

      this.logger.log(`Provider rejection email sent to ${toEmail}`);
      return true;
    } catch (err) {
      this.logger.error(`Email send error: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  async sendLeadMatchNotification(
    provider: { companyName: string; email: string },
    lead: { totalDebt: number; state: string; debtTypes?: string[] },
    match: { id: string; matchScore: number },
  ): Promise<boolean> {
    const subject = 'New lead match on Settle In Peace';
    const portalUrl = process.env.FRONTEND_URL || 'http://localhost:3025';
    const leadUrl = `${portalUrl}/portal/leads`;
    const html = this.renderLeadMatchTemplate(provider, lead, match, leadUrl);

    if (!this.resend) {
      this.logger.log(
        `[DEV EMAIL] To: ${provider.email} | Subject: ${subject} | Match: ${match.id} | Score: ${match.matchScore}`,
      );
      return true;
    }

    try {
      const { error } = await this.resend.emails.send({
        from: this.fromEmail,
        to: provider.email,
        subject,
        html,
      });

      if (error) {
        this.logger.error(`Failed to send lead match notification: ${error.message}`);
        return false;
      }

      this.logger.log(`Lead match notification sent to ${provider.email} for match ${match.id}`);
      return true;
    } catch (err) {
      this.logger.error(`Email send error: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Coaching subscription confirmation
  // ---------------------------------------------------------------------------

  async sendCoachingWelcome(user: User): Promise<boolean> {
    const subject = 'Welcome to Settle In Peace Coaching 🎯';
    const html = this.renderCoachingWelcomeTemplate(user.firstName);

    if (!this.resend) {
      this.logger.log(`[DEV EMAIL] To: ${user.email} | Subject: ${subject}`);
      return true;
    }

    try {
      const { error } = await this.resend.emails.send({
        from: this.fromEmail,
        to: user.email,
        subject,
        html,
      });

      if (error) {
        this.logger.error(`Failed to send coaching welcome email: ${error.message}`);
        return false;
      }

      this.logger.log(`Coaching welcome email sent to ${user.email}`);
      return true;
    } catch (err) {
      this.logger.error(`Email send error: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Subscription cancellation
  // ---------------------------------------------------------------------------

  async sendSubscriptionCancelled(recipient: EmailRecipient, type: string): Promise<boolean> {
    const subject = 'Your Settle In Peace subscription has been cancelled';
    const html = this.renderSubscriptionCancelledTemplate(recipient, type);

    if (!this.resend) {
      this.logger.log(`[DEV EMAIL] To: ${recipient.email} | Subject: ${subject} | type: ${type}`);
      return true;
    }

    try {
      const { error } = await this.resend.emails.send({
        from: this.fromEmail,
        to: recipient.email,
        subject,
        html,
      });

      if (error) {
        this.logger.error(`Failed to send subscription cancelled email: ${error.message}`);
        return false;
      }

      this.logger.log(`Subscription cancelled email sent to ${recipient.email} (type=${type})`);
      return true;
    } catch (err) {
      this.logger.error(`Email send error: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Payment failure
  // ---------------------------------------------------------------------------

  async sendPaymentFailed(recipient: EmailRecipient, type: string, amount?: number): Promise<boolean> {
    const subject = 'Payment failed - action required';
    const html = this.renderPaymentFailedTemplate(recipient, type, amount);

    if (!this.resend) {
      this.logger.log(
        `[DEV EMAIL] To: ${recipient.email} | Subject: ${subject} | type: ${type} | amount: ${amount ?? 'n/a'}`,
      );
      return true;
    }

    try {
      const { error } = await this.resend.emails.send({
        from: this.fromEmail,
        to: recipient.email,
        subject,
        html,
      });

      if (error) {
        this.logger.error(`Failed to send payment failed email: ${error.message}`);
        return false;
      }

      this.logger.log(`Payment failed email sent to ${recipient.email} (type=${type})`);
      return true;
    } catch (err) {
      this.logger.error(`Email send error: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Lead purchase confirmation (providers)
  // ---------------------------------------------------------------------------

  async sendLeadPurchaseConfirmation(provider: Provider, lead: Lead, price: number): Promise<boolean> {
    const subject = 'Lead purchased - contact details inside';
    const html = this.renderLeadPurchaseConfirmationTemplate(provider, lead, price);

    if (!this.resend) {
      this.logger.log(
        `[DEV EMAIL] To: ${provider.email} | Subject: ${subject} | lead: ${lead.id} | price: ${price}`,
      );
      return true;
    }

    try {
      const { error } = await this.resend.emails.send({
        from: this.fromEmail,
        to: provider.email,
        subject,
        html,
      });

      if (error) {
        this.logger.error(`Failed to send lead purchase confirmation: ${error.message}`);
        return false;
      }

      this.logger.log(`Lead purchase confirmation sent to ${provider.email} for lead ${lead.id}`);
      return true;
    } catch (err) {
      this.logger.error(`Email send error: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Password reset confirmation
  // ---------------------------------------------------------------------------

  async sendPasswordResetConfirmation(user: User): Promise<boolean> {
    const subject = 'Your password has been reset';
    const html = this.renderPasswordResetConfirmationTemplate(user.firstName);

    if (!this.resend) {
      this.logger.log(`[DEV EMAIL] To: ${user.email} | Subject: ${subject}`);
      return true;
    }

    try {
      const { error } = await this.resend.emails.send({
        from: this.fromEmail,
        to: user.email,
        subject,
        html,
      });

      if (error) {
        this.logger.error(`Failed to send password reset confirmation: ${error.message}`);
        return false;
      }

      this.logger.log(`Password reset confirmation sent to ${user.email}`);
      return true;
    } catch (err) {
      this.logger.error(`Email send error: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  private renderVerificationTemplate(verifyUrl: string, firstName?: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="color: #2563eb; font-size: 24px; margin: 0;">Settle<span style="color: #60a5fa;">InPeace</span></h1>
        </div>
        <h2 style="color: #18181b; font-size: 20px;">Verify your email</h2>
        <p style="color: #71717a; font-size: 16px; line-height: 1.6;">
          Hi${firstName ? ` ${firstName}` : ''}, welcome to Settle In Peace! Click the button below to verify your email address.
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${verifyUrl}" style="display: inline-block; background: #2563eb; color: white; text-decoration: none; font-weight: 700; padding: 12px 32px; border-radius: 8px;">Verify Email</a>
        </div>
        <p style="color: #a1a1aa; font-size: 14px;">This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 32px 0;">
        <p style="color: #a1a1aa; font-size: 12px;">Settle In Peace, Inc. — The debt relief marketplace that puts you in control.</p>
      </body>
      </html>
    `;
  }

  private renderPasswordResetTemplate(resetUrl: string, firstName?: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="color: #2563eb; font-size: 24px; margin: 0;">Settle<span style="color: #60a5fa;">InPeace</span></h1>
        </div>
        <h2 style="color: #18181b; font-size: 20px;">Reset your password</h2>
        <p style="color: #71717a; font-size: 16px; line-height: 1.6;">
          Hi${firstName ? ` ${firstName}` : ''}, we received a request to reset your password. Click the button below to choose a new one.
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${resetUrl}" style="display: inline-block; background: #2563eb; color: white; text-decoration: none; font-weight: 700; padding: 12px 32px; border-radius: 8px;">Reset Password</a>
        </div>
        <p style="color: #a1a1aa; font-size: 14px;">This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 32px 0;">
        <p style="color: #a1a1aa; font-size: 12px;">Settle In Peace, Inc. — The debt relief marketplace that puts you in control.</p>
      </body>
      </html>
    `;
  }

  private renderOtpTemplate(code: string, firstName?: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="color: #2563eb; font-size: 24px; margin: 0;">Settle<span style="color: #60a5fa;">InPeace</span></h1>
        </div>
        <h2 style="color: #18181b; font-size: 20px;">Your verification code</h2>
        <p style="color: #71717a; font-size: 16px; line-height: 1.6;">
          Hi${firstName ? ` ${firstName}` : ''}, use the code below to verify your email and continue.
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <div style="display: inline-block; font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #2563eb; background: #eff6ff; padding: 16px 32px; border-radius: 12px;">
            ${code}
          </div>
        </div>
        <p style="color: #a1a1aa; font-size: 14px;">This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 32px 0;">
        <p style="color: #a1a1aa; font-size: 12px;">Settle In Peace, Inc. — The debt relief marketplace that puts you in control.</p>
      </body>
      </html>
    `;
  }

  private renderWelcomeTemplate(firstName?: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="color: #2563eb; font-size: 24px; margin: 0;">Settle<span style="color: #60a5fa;">InPeace</span></h1>
        </div>
        <h2 style="color: #18181b; font-size: 20px;">Welcome${firstName ? `, ${firstName}` : ''}!</h2>
        <p style="color: #71717a; font-size: 16px; line-height: 1.6;">
          Thanks for joining Settle In Peace. We're building the first marketplace for debt relief — compare providers side-by-side with transparent fees, real timelines, and no pressure.
        </p>
        <p style="color: #71717a; font-size: 16px; line-height: 1.6;">
          Take the free assessment to see your options, or browse our marketplace to learn how it works.
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://settleinpeace.com'}/assessment" style="display: inline-block; background: #2563eb; color: white; text-decoration: none; font-weight: 700; padding: 12px 32px; border-radius: 8px;">Take the Free Assessment</a>
        </div>
        <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 32px 0;">
        <p style="color: #a1a1aa; font-size: 12px;">Settle In Peace, Inc. — The debt relief marketplace that puts you in control.</p>
      </body>
      </html>
    `;
  }

  private renderProviderApprovalTemplate(companyName: string): string {
    const portalUrl = process.env.FRONTEND_URL || 'http://localhost:3025';
    return `
      <!DOCTYPE html>
      <html>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="color: #2563eb; font-size: 24px; margin: 0;">Settle<span style="color: #60a5fa;">InPeace</span></h1>
        </div>
        <h2 style="color: #18181b; font-size: 20px;">Your provider account has been approved</h2>
        <p style="color: #71717a; font-size: 16px; line-height: 1.6;">
          Great news! The provider account for <strong>${companyName}</strong> has been reviewed and approved. You can now log in to your provider portal to start receiving leads and managing your marketplace presence.
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${portalUrl}/providers/portal" style="display: inline-block; background: #2563eb; color: white; text-decoration: none; font-weight: 700; padding: 12px 32px; border-radius: 8px;">Go to Provider Portal</a>
        </div>
        <p style="color: #a1a1aa; font-size: 14px;">If you have any questions, our team is here to help.</p>
        <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 32px 0;">
        <p style="color: #a1a1aa; font-size: 12px;">Settle In Peace, Inc. — The debt relief marketplace that puts you in control.</p>
      </body>
      </html>
    `;
  }

  private renderProviderRejectionTemplate(companyName: string, reason?: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="color: #2563eb; font-size: 24px; margin: 0;">Settle<span style="color: #60a5fa;">InPeace</span></h1>
        </div>
        <h2 style="color: #18181b; font-size: 20px;">Your provider application was not approved</h2>
        <p style="color: #71717a; font-size: 16px; line-height: 1.6;">
          Thank you for your interest in joining the Settle In Peace marketplace. After reviewing the application for <strong>${companyName}</strong>, we are unable to approve the account at this time.
        </p>
        ${reason ? `<p style="color: #71717a; font-size: 16px; line-height: 1.6;"><strong>Reason:</strong> ${reason}</p>` : ''}
        <p style="color: #71717a; font-size: 16px; line-height: 1.6;">
          If you believe this was in error or would like to reapply in the future, please contact our team.
        </p>
        <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 32px 0;">
        <p style="color: #a1a1aa; font-size: 12px;">Settle In Peace, Inc. — The debt relief marketplace that puts you in control.</p>
      </body>
      </html>
    `;
  }

  private renderLeadMatchTemplate(
    provider: { companyName: string; email: string },
    lead: { totalDebt: number; state: string; debtTypes?: string[] },
    match: { id: string; matchScore: number },
    leadUrl: string,
  ): string {
    const debtTypes = lead.debtTypes?.length ? lead.debtTypes.join(', ') : 'Not specified';
    const debtAmount = Number(lead.totalDebt || 0).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    });
    return `
      <!DOCTYPE html>
      <html>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="color: #2563eb; font-size: 24px; margin: 0;">Settle<span style="color: #60a5fa;">InPeace</span></h1>
        </div>
        <h2 style="color: #18181b; font-size: 20px;">New lead match on Settle In Peace</h2>
        <p style="color: #71717a; font-size: 16px; line-height: 1.6;">
          Hi <strong>${provider.companyName}</strong>,
        </p>
        <p style="color: #71717a; font-size: 16px; line-height: 1.6;">
          A new lead matched your provider profile. Here is a quick summary:
        </p>
        <table style="width: 100%; border-collapse: collapse; margin: 24px 0; color: #18181b;">
          <tr style="border-bottom: 1px solid #e4e4e7;">
            <td style="padding: 8px 0; font-weight: 600;">Total debt</td>
            <td style="padding: 8px 0; text-align: right;">${debtAmount}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e4e4e7;">
            <td style="padding: 8px 0; font-weight: 600;">State</td>
            <td style="padding: 8px 0; text-align: right;">${lead.state || 'Not specified'}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e4e4e7;">
            <td style="padding: 8px 0; font-weight: 600;">Debt types</td>
            <td style="padding: 8px 0; text-align: right;">${debtTypes}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: 600;">Estimated match score</td>
            <td style="padding: 8px 0; text-align: right; font-weight: 700; color: #2563eb;">${match.matchScore}%</td>
          </tr>
        </table>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${leadUrl}" style="display: inline-block; background: #2563eb; color: white; text-decoration: none; font-weight: 700; padding: 14px 32px; border-radius: 8px;">View Lead in Portal</a>
        </div>
        <p style="color: #a1a1aa; font-size: 14px; line-height: 1.5;">
          <strong>Note:</strong> You must purchase this lead to unlock full contact details. This lead is matched based on the criteria you provided and may be purchased by other providers if you do not act quickly.
        </p>
        <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 32px 0;">
        <p style="color: #a1a1aa; font-size: 12px;">Settle In Peace, Inc. — The debt relief marketplace that puts you in control.</p>
      </body>
      </html>
    `;
  }

  private renderCoachingWelcomeTemplate(firstName?: string): string {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3025';
    const coachingUrl = `${frontendUrl}/coaching`;
    const supportEmail = process.env.SUPPORT_EMAIL || 'support@settleinpeace.com';
    return `
      <!DOCTYPE html>
      <html>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="color: #2563eb; font-size: 24px; margin: 0;">Settle<span style="color: #60a5fa;">InPeace</span></h1>
        </div>
        <h2 style="color: #18181b; font-size: 20px;">Welcome to Settle In Peace Coaching 🎯</h2>
        <p style="color: #71717a; font-size: 16px; line-height: 1.6;">
          Hi${firstName ? ` ${firstName}` : ''}, you're all set! Your coaching subscription is active. Here's everything you now have access to:
        </p>
        <ul style="color: #71717a; font-size: 16px; line-height: 1.8; padding-left: 20px;">
          <li><strong style="color: #18181b;">Budgets</strong> — build a plan that fits your income and goals.</li>
          <li><strong style="color: #18181b;">Goals</strong> — set and track milestones on your path to debt freedom.</li>
          <li><strong style="color: #18181b;">Calculators</strong> — model settlements, timelines, and savings.</li>
          <li><strong style="color: #18181b;">Dashboard</strong> — see your full financial picture in one place.</li>
        </ul>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${coachingUrl}" style="display: inline-block; background: #16a34a; color: white; text-decoration: none; font-weight: 700; padding: 12px 32px; border-radius: 8px;">Go to Your Coaching Dashboard</a>
        </div>
        <p style="color: #71717a; font-size: 16px; line-height: 1.6;">
          Questions? Our team is here to help — just reply to this email or reach us at <a href="mailto:${supportEmail}" style="color: #2563eb;">${supportEmail}</a>.
        </p>
        <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 32px 0;">
        <p style="color: #a1a1aa; font-size: 12px;">Settle In Peace, Inc. — The debt relief marketplace that puts you in control.</p>
      </body>
      </html>
    `;
  }

  private renderSubscriptionCancelledTemplate(recipient: EmailRecipient, type: string): string {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3025';
    const labelMap: Record<string, { name: string; resubscribeUrl: string }> = {
      coaching: { name: 'Coaching', resubscribeUrl: `${frontendUrl}/coaching` },
      provider_credits: { name: 'Provider Credits', resubscribeUrl: `${frontendUrl}/pricing` },
      provider_subscription: { name: 'Provider Subscription', resubscribeUrl: `${frontendUrl}/pricing` },
    };
    const label = labelMap[type]?.name || 'Settle In Peace';
    const resubscribeUrl = labelMap[type]?.resubscribeUrl || `${frontendUrl}/pricing`;
    const portalUrl = `${frontendUrl}/portal/billing`;
    const greeting = recipient.companyName
      ? `Hi ${recipient.companyName}`
      : recipient.firstName
        ? `Hi ${recipient.firstName}`
        : 'Hi there';
    return `
      <!DOCTYPE html>
      <html>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="color: #2563eb; font-size: 24px; margin: 0;">Settle<span style="color: #60a5fa;">InPeace</span></h1>
        </div>
        <h2 style="color: #18181b; font-size: 20px;">Your subscription has been cancelled</h2>
        <p style="color: #71717a; font-size: 16px; line-height: 1.6;">
          ${greeting}, this confirms that your <strong>${label}</strong> subscription has been cancelled.
        </p>
        <p style="color: #71717a; font-size: 16px; line-height: 1.6;">
          You'll keep access to your existing features through the end of your current billing period. After that, the subscription will not renew and access will end.
        </p>
        <p style="color: #71717a; font-size: 16px; line-height: 1.6;">
          Changed your mind? You can resubscribe any time:
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${resubscribeUrl}" style="display: inline-block; background: #2563eb; color: white; text-decoration: none; font-weight: 700; padding: 12px 32px; border-radius: 8px;">Resubscribe</a>
        </div>
        <p style="color: #71717a; font-size: 16px; line-height: 1.6;">
          You can also review your billing history and payment methods in the billing portal:
        </p>
        <div style="text-align: center; margin: 16px 0 32px;">
          <a href="${portalUrl}" style="display: inline-block; background: #e4e4e7; color: #18181b; text-decoration: none; font-weight: 600; padding: 12px 32px; border-radius: 8px;">Go to Billing Portal</a>
        </div>
        <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 32px 0;">
        <p style="color: #a1a1aa; font-size: 12px;">Settle In Peace, Inc. — The debt relief marketplace that puts you in control.</p>
      </body>
      </html>
    `;
  }

  private renderPaymentFailedTemplate(recipient: EmailRecipient, type: string, amount?: number): string {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3025';
    const portalUrl = `${frontendUrl}/portal/billing`;
    const labelMap: Record<string, string> = {
      coaching: 'Coaching',
      provider_credits: 'Provider Credits',
      provider_subscription: 'Provider Subscription',
    };
    const label = labelMap[type] || 'Settle In Peace';
    const greeting = recipient.companyName
      ? `Hi ${recipient.companyName}`
      : recipient.firstName
        ? `Hi ${recipient.firstName}`
        : 'Hi there';
    const amountLine = amount
      ? `<p style="color: #71717a; font-size: 16px; line-height: 1.6;">The failed charge was for <strong>$${amount.toFixed(2)}</strong>.</p>`
      : '';
    return `
      <!DOCTYPE html>
      <html>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="color: #2563eb; font-size: 24px; margin: 0;">Settle<span style="color: #60a5fa;">InPeace</span></h1>
        </div>
        <h2 style="color: #b91c1c; font-size: 20px;">Payment failed — action required</h2>
        <p style="color: #71717a; font-size: 16px; line-height: 1.6;">
          ${greeting}, we weren't able to process payment for your <strong>${label}</strong> subscription.
        </p>
        ${amountLine}
        <p style="color: #71717a; font-size: 16px; line-height: 1.6;">
          Please update your payment method to keep your subscription active. You can do this in the billing portal:
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${portalUrl}" style="display: inline-block; background: #2563eb; color: white; text-decoration: none; font-weight: 700; padding: 12px 32px; border-radius: 8px;">Update Payment Method</a>
        </div>
        <p style="color: #71717a; font-size: 16px; line-height: 1.6;">
          <strong>Note:</strong> You have a <strong>3-day grace period</strong> to update your payment details before your subscription is paused. Please act soon to avoid any interruption.
        </p>
        <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 32px 0;">
        <p style="color: #a1a1aa; font-size: 12px;">Settle In Peace, Inc. — The debt relief marketplace that puts you in control.</p>
      </body>
      </html>
    `;
  }

  private renderLeadPurchaseConfirmationTemplate(provider: Provider, lead: Lead, price: number): string {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3025';
    const portalUrl = `${frontendUrl}/portal`;
    const debtAmount = Number(lead.totalDebt || 0).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    });
    const debtTypes = lead.debtTypes?.length ? lead.debtTypes.join(', ') : 'Not specified';
    const priceFormatted = price.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
    const phoneLine = lead.phone
      ? `<tr style="border-bottom: 1px solid #e4e4e7;"><td style="padding: 8px 0; font-weight: 600;">Phone</td><td style="padding: 8px 0; text-align: right;">${lead.phone}</td></tr>`
      : '';
    return `
      <!DOCTYPE html>
      <html>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="color: #2563eb; font-size: 24px; margin: 0;">Settle<span style="color: #60a5fa;">InPeace</span></h1>
        </div>
        <h2 style="color: #18181b; font-size: 20px;">Lead purchased — contact details inside</h2>
        <p style="color: #71717a; font-size: 16px; line-height: 1.6;">
          Hi <strong>${provider.companyName}</strong>, your lead purchase is confirmed. Here are the details:
        </p>
        <h3 style="color: #18181b; font-size: 16px; margin: 24px 0 8px;">Lead summary</h3>
        <table style="width: 100%; border-collapse: collapse; color: #18181b;">
          <tr style="border-bottom: 1px solid #e4e4e7;"><td style="padding: 8px 0; font-weight: 600;">Total debt</td><td style="padding: 8px 0; text-align: right;">${debtAmount}</td></tr>
          <tr style="border-bottom: 1px solid #e4e4e7;"><td style="padding: 8px 0; font-weight: 600;">State</td><td style="padding: 8px 0; text-align: right;">${lead.state || 'Not specified'}</td></tr>
          <tr style="border-bottom: 1px solid #e4e4e7;"><td style="padding: 8px 0; font-weight: 600;">Debt types</td><td style="padding: 8px 0; text-align: right;">${debtTypes}</td></tr>
          <tr><td style="padding: 8px 0; font-weight: 600;">Purchase price</td><td style="padding: 8px 0; text-align: right;">${priceFormatted}</td></tr>
        </table>
        <h3 style="color: #18181b; font-size: 16px; margin: 24px 0 8px;">Contact information</h3>
        <table style="width: 100%; border-collapse: collapse; color: #18181b;">
          <tr style="border-bottom: 1px solid #e4e4e7;"><td style="padding: 8px 0; font-weight: 600;">Name</td><td style="padding: 8px 0; text-align: right;">${lead.firstName} ${lead.lastName}</td></tr>
          <tr style="border-bottom: 1px solid #e4e4e7;"><td style="padding: 8px 0; font-weight: 600;">Email</td><td style="padding: 8px 0; text-align: right;">${lead.email}</td></tr>
          ${phoneLine}
        </table>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${portalUrl}" style="display: inline-block; background: #2563eb; color: white; text-decoration: none; font-weight: 700; padding: 12px 32px; border-radius: 8px;">View in Portal</a>
        </div>
        <p style="color: #a1a1aa; font-size: 14px; line-height: 1.5;">
          <strong>Reminder:</strong> This lead has been scored for quality. Reach out promptly — exclusive access windows are typically 30 days. Faster outreach tends to convert better.
        </p>
        <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 32px 0;">
        <p style="color: #a1a1aa; font-size: 12px;">Settle In Peace, Inc. — The debt relief marketplace that puts you in control.</p>
      </body>
      </html>
    `;
  }

  private renderPasswordResetConfirmationTemplate(firstName?: string): string {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3025';
    const loginUrl = `${frontendUrl}/login`;
    const supportEmail = process.env.SUPPORT_EMAIL || 'support@settleinpeace.com';
    return `
      <!DOCTYPE html>
      <html>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="color: #2563eb; font-size: 24px; margin: 0;">Settle<span style="color: #60a5fa;">InPeace</span></h1>
        </div>
        <h2 style="color: #18181b; font-size: 20px;">Your password has been reset</h2>
        <p style="color: #71717a; font-size: 16px; line-height: 1.6;">
          Hi${firstName ? ` ${firstName}` : ''}, your password was successfully changed. You can now log in with your new password.
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${loginUrl}" style="display: inline-block; background: #2563eb; color: white; text-decoration: none; font-weight: 700; padding: 12px 32px; border-radius: 8px;">Log In</a>
        </div>
        <p style="color: #b91c1c; font-size: 16px; line-height: 1.6;">
          <strong>Wasn't you?</strong> If you didn't request this change, please contact us immediately at <a href="mailto:${supportEmail}" style="color: #2563eb;">${supportEmail}</a> so we can secure your account.
        </p>
        <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 32px 0;">
        <p style="color: #a1a1aa; font-size: 12px;">Settle In Peace, Inc. — The debt relief marketplace that puts you in control.</p>
      </body>
      </html>
    `;
  }
}
