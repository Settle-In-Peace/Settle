import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { EmailService } from '../email/email.service';
import { DebtSnapshot, NurtureSubscriber } from '../entities/nurture-subscriber.entity';
import {
  NURTURE_STEP_COUNT,
  NURTURE_STEP_INTERVAL_MS,
  nurtureEmail,
} from './nurture.templates';

const SWEEP_INTERVAL_MS = 15 * 60 * 1000;
const MAX_SENDS_PER_SWEEP = 50;

export interface SubscribeInput {
  email: string;
  firstName?: string;
  snapshot?: DebtSnapshot;
  consentIp?: string;
  consentUserAgent?: string;
}

@Injectable()
export class NurtureService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NurtureService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(NurtureSubscriber)
    private readonly subscribers: Repository<NurtureSubscriber>,
    private readonly email: EmailService,
  ) {}

  onModuleInit() {
    // Same zero-dep scheduling pattern as BillingService — no @nestjs/schedule.
    this.timer = setInterval(() => {
      void this.sendDue().catch((e) => this.logger.error('Nurture sweep failed', e));
    }, SWEEP_INTERVAL_MS);
    // First sweep shortly after boot so signups get day-0 promptly.
    setTimeout(() => void this.sendDue().catch(() => undefined), 30_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async subscribe(input: SubscribeInput) {
    const email = input.email.trim().toLowerCase();
    let sub = await this.subscribers.findOne({ where: { email } });

    if (!sub) {
      sub = this.subscribers.create({
        email,
        firstName: input.firstName?.trim() || null,
        source: 'debt-snapshot',
        snapshot: input.snapshot ?? null,
        status: 'active',
        dayIndex: 0,
        nextSendAt: new Date(),
        unsubscribeToken: randomUUID(),
        consentIp: input.consentIp ?? null,
        consentUserAgent: input.consentUserAgent ?? null,
      });
    } else {
      // Re-subscribe or refresh: restart the sequence only if they finished/unsubbed.
      sub.firstName = input.firstName?.trim() || sub.firstName;
      if (input.snapshot) sub.snapshot = input.snapshot;
      if (input.consentIp) sub.consentIp = input.consentIp;
      if (input.consentUserAgent) sub.consentUserAgent = input.consentUserAgent;
      if (sub.status !== 'active') {
        sub.status = 'active';
        sub.dayIndex = 0;
        sub.nextSendAt = new Date();
      }
    }

    await this.subscribers.save(sub);
    void this.sendStep(sub).catch((e) =>
      this.logger.warn(`Day-0 send failed for ${email}: ${e}`),
    );
    return { subscribed: true };
  }

  async unsubscribe(token: string): Promise<boolean> {
    const sub = await this.subscribers.findOne({ where: { unsubscribeToken: token } });
    if (!sub) return false;
    sub.status = 'unsubscribed';
    await this.subscribers.save(sub);
    return true;
  }

  async sendDue(): Promise<void> {
    const due = await this.subscribers
      .createQueryBuilder('s')
      .where("s.status = 'active'")
      .andWhere('s."nextSendAt" <= now()')
      .andWhere('s."dayIndex" < :count', { count: NURTURE_STEP_COUNT })
      .orderBy('s."nextSendAt"', 'ASC')
      .take(MAX_SENDS_PER_SWEEP)
      .getMany();

    for (const sub of due) {
      await this.sendStep(sub);
    }
  }

  private async sendStep(sub: NurtureSubscriber): Promise<void> {
    const step = nurtureEmail(sub.dayIndex, sub);
    if (!step) {
      sub.status = 'done';
      await this.subscribers.save(sub);
      return;
    }

    const sent = await this.email.sendEmail(sub.email, step.subject, step.html);
    if (!sent) {
      // Transient failure — retry next sweep instead of skipping the day.
      this.logger.warn(`Nurture send failed: ${sub.email} day ${sub.dayIndex}`);
      return;
    }

    sub.dayIndex += 1;
    sub.lastSentAt = new Date();
    if (sub.dayIndex >= NURTURE_STEP_COUNT) {
      sub.status = 'done';
    } else {
      sub.nextSendAt = new Date(Date.now() + NURTURE_STEP_INTERVAL_MS);
    }
    await this.subscribers.save(sub);
  }
}
