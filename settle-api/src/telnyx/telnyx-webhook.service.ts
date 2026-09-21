import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { CallLog, CallStatus } from '../entities/call-log.entity';
import {
  CommunicationLog,
  CommunicationStatus,
} from '../entities/communication-log.entity';

/**
 * Telnyx webhook payload — loosely typed since Telnyx sends varying fields
 * per event type. We use an interface with optional fields rather than
 * `Record<string, unknown>` so that property access is ergonomic.
 */
interface TelnyxPayload {
  call_control_id?: string;
  hangup_cause?: string;
  cause?: string;
  started_at?: string;
  answered_at?: string;
  ended_at?: string;
  duration_seconds?: number;
  cost?: number;
  recording_urls?: { mp3?: string };
  recording_url?: string;
  public_recording_url?: string;
  download_url?: string;
  id?: string;
  message_id?: string;
  [key: string]: unknown;
}

type TelnyxRawBody = Record<string, unknown>;

/**
 * TelnyxWebhookService
 *
 * Processes inbound Telnyx webhook events for call control and SMS, updating
 * the corresponding CallLog / CommunicationLog records. The service also logs
 * every raw webhook event for debugging and triggers post-call workflows
 * (e.g. follow-up task creation) when a call is answered.
 *
 * Telnyx is the ONLY phone/SMS provider used by SettleInPeace — never Twilio.
 */
@Injectable()
export class TelnyxWebhookService {
  private readonly logger = new Logger(TelnyxWebhookService.name);

  constructor(
    @InjectRepository(CallLog)
    private readonly callLogsRepository: Repository<CallLog>,
    @InjectRepository(CommunicationLog)
    private readonly communicationLogsRepository: Repository<CommunicationLog>,
  ) {}

  /**
   * Verify the inbound Telnyx webhook signature.
   *
   * Telnyx signs webhooks with the public key from your Telnyx account and
   * sends the signature in the `telnyx-signature-ed25519` header alongside a
   * `telnyx-timestamp-ed25519` header. Verification requires the Ed25519
   * public key stored in the TELNYX_PUBLIC_KEY env var. When the public key
   * is not configured this method returns true (verification skipped) so that
   * development environments are not blocked.
   */
  verifySignature(rawBody: string, headers: Record<string, string>): boolean {
    const publicKey = process.env.TELNYX_PUBLIC_KEY;
    const signatureHeader =
      headers['telnyx-signature-ed25519'] ||
      headers['Telnyx-Signature-Ed25519'];
    const timestampHeader =
      headers['telnyx-timestamp-ed25519'] ||
      headers['Telnyx-Timestamp-Ed25519'];

    if (!publicKey || !signatureHeader || !timestampHeader) {
      this.logger.warn(
        'Telnyx signature verification skipped — TELNYX_PUBLIC_KEY or signature headers missing.',
      );
      return true;
    }

    try {
      const verifier = crypto.createVerify('sha512');
      verifier.update(`${timestampHeader}|${rawBody}`);
      const isValid = verifier.verify(
        publicKey,
        Buffer.from(signatureHeader, 'base64'),
      );
      if (!isValid) {
        this.logger.error('Telnyx webhook signature verification FAILED.');
      }
      return isValid;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(
        `Telnyx webhook signature verification error: ${message}`,
      );
      return false;
    }
  }

  /**
   * Route a Telnyx call control webhook event to the appropriate handler.
   */
  async handleCallEvent(
    eventType: string,
    payload: TelnyxPayload,
    rawBody: TelnyxRawBody,
  ): Promise<void> {
    this.logger.debug(
      `Telnyx call event "${eventType}" — payload: ${JSON.stringify(payload)}`,
    );

    switch (eventType) {
      case 'call.initiated':
        await this.handleCallInitiated(payload, rawBody);
        break;
      case 'call.answered':
        await this.handleCallAnswered(payload, rawBody);
        break;
      case 'call.hangup':
        await this.handleCallHangup(payload, rawBody);
        break;
      case 'call.recording_saved':
        await this.handleRecordingSaved(payload, rawBody);
        break;
      case 'call.recording_ended':
        await this.handleRecordingEnded(payload, rawBody);
        break;
      case 'call.playback_ended':
        await this.handlePlaybackEnded(payload, rawBody);
        break;
      case 'call.bridge_answered':
      case 'call.bridge_rejected':
      case 'call.rejected':
        await this.handleCallRejected(payload, rawBody);
        break;
      default:
        this.logger.log(`Unhandled Telnyx call event type: ${eventType}`);
    }
  }

  /**
   * Route a Telnyx SMS webhook event to the appropriate handler.
   */
  async handleSmsEvent(
    eventType: string,
    payload: TelnyxPayload,
  ): Promise<void> {
    this.logger.debug(
      `Telnyx SMS event "${eventType}" — payload: ${JSON.stringify(payload)}`,
    );

    switch (eventType) {
      case 'sms.delivered':
        await this.handleSmsDelivered(payload);
        break;
      case 'sms.delivery_failed':
        await this.handleSmsDeliveryFailed(payload);
        break;
      case 'message.sent':
      case 'sms.sent':
        await this.handleSmsSent(payload);
        break;
      default:
        this.logger.log(`Unhandled Telnyx SMS event type: ${eventType}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Call event handlers
  // ---------------------------------------------------------------------------

  private async handleCallInitiated(
    payload: TelnyxPayload,
    rawBody: TelnyxRawBody,
  ): Promise<void> {
    const callControlId = payload?.call_control_id;
    if (!callControlId) {
      this.logger.warn('call.initiated received without call_control_id');
      return;
    }

    const callLog = await this.findCallLogByProviderCallId(callControlId);
    if (!callLog) {
      this.logger.warn(
        `call.initiated: no CallLog found for providerCallId ${callControlId}`,
      );
      return;
    }

    callLog.status = CallStatus.RINGING;
    callLog.startedAt = payload?.started_at
      ? new Date(payload.started_at)
      : new Date();
    callLog.rawResponse = this.mergeRawResponse(callLog.rawResponse, rawBody);
    await this.callLogsRepository.save(callLog);

    this.logger.log(`Call ${callControlId} initiated → status set to ringing`);
  }

  private async handleCallAnswered(
    payload: TelnyxPayload,
    rawBody: TelnyxRawBody,
  ): Promise<void> {
    const callControlId = payload?.call_control_id;
    if (!callControlId) {
      this.logger.warn('call.answered received without call_control_id');
      return;
    }

    const callLog = await this.findCallLogByProviderCallId(callControlId);
    if (!callLog) {
      this.logger.warn(
        `call.answered: no CallLog found for providerCallId ${callControlId}`,
      );
      return;
    }

    callLog.status = CallStatus.ANSWERED;
    callLog.startedAt =
      callLog.startedAt ??
      (payload?.answered_at ? new Date(payload.answered_at) : new Date());
    callLog.rawResponse = this.mergeRawResponse(callLog.rawResponse, rawBody);
    await this.callLogsRepository.save(callLog);

    this.logger.log(`Call ${callControlId} answered`);
    this.triggerPostCallWorkflow(callLog);
  }

  private async handleCallHangup(
    payload: TelnyxPayload,
    rawBody: TelnyxRawBody,
  ): Promise<void> {
    const callControlId = payload?.call_control_id;
    if (!callControlId) {
      this.logger.warn('call.hangup received without call_control_id');
      return;
    }

    const callLog = await this.findCallLogByProviderCallId(callControlId);
    if (!callLog) {
      this.logger.warn(
        `call.hangup: no CallLog found for providerCallId ${callControlId}`,
      );
      return;
    }

    const hangupCause = payload?.hangup_cause || payload?.cause;
    const endedAt = payload?.ended_at ? new Date(payload.ended_at) : new Date();

    const wasAnswered =
      callLog.status === CallStatus.ANSWERED ||
      (callLog.startedAt !== null && this.wasCallConnected(callLog));

    let finalStatus: CallStatus;
    if (wasAnswered) {
      finalStatus = CallStatus.COMPLETED;
    } else if (hangupCause === 'busy' || hangupCause === 'caller-busy') {
      finalStatus = CallStatus.BUSY;
    } else if (hangupCause === 'no-answer' || hangupCause === 'timeout') {
      finalStatus = CallStatus.NO_ANSWER;
    } else if (hangupCause === 'rejected' || hangupCause === 'blocked') {
      finalStatus = CallStatus.FAILED;
    } else if (
      hangupCause === 'customer-disconnect' ||
      hangupCause === 'normal-clearing'
    ) {
      finalStatus = wasAnswered ? CallStatus.COMPLETED : CallStatus.NO_ANSWER;
    } else {
      finalStatus = wasAnswered ? CallStatus.COMPLETED : CallStatus.FAILED;
    }

    callLog.status = finalStatus;
    callLog.endedAt = endedAt;

    if (callLog.startedAt) {
      const durationMs =
        endedAt.getTime() - new Date(callLog.startedAt).getTime();
      callLog.duration = Math.max(0, Math.round(durationMs / 1000));
    }

    if (payload?.duration_seconds) {
      callLog.duration = payload.duration_seconds;
    }
    if (payload?.cost !== undefined) {
      callLog.cost = payload.cost;
    }

    callLog.rawResponse = this.mergeRawResponse(callLog.rawResponse, rawBody);
    await this.callLogsRepository.save(callLog);

    this.logger.log(
      `Call ${callControlId} hung up → status ${finalStatus}, duration ${callLog.duration ?? 0}s`,
    );
  }

  private async handleRecordingSaved(
    payload: TelnyxPayload,
    rawBody: TelnyxRawBody,
  ): Promise<void> {
    const callControlId = payload?.call_control_id;
    const recordingUrl =
      payload?.recording_urls?.mp3 ||
      payload?.recording_url ||
      payload?.public_recording_url ||
      payload?.download_url;

    if (!callControlId) {
      this.logger.warn('call.recording_saved received without call_control_id');
      return;
    }

    const callLog = await this.findCallLogByProviderCallId(callControlId);
    if (!callLog) {
      this.logger.warn(
        `call.recording_saved: no CallLog found for providerCallId ${callControlId}`,
      );
      return;
    }

    if (recordingUrl) {
      callLog.recordingUrl = recordingUrl;
    }
    callLog.rawResponse = this.mergeRawResponse(callLog.rawResponse, rawBody);
    await this.callLogsRepository.save(callLog);

    this.logger.log(
      `Recording saved for call ${callControlId} → ${recordingUrl || 'no url'}`,
    );
  }

  private async handleRecordingEnded(
    payload: TelnyxPayload,
    rawBody: TelnyxRawBody,
  ): Promise<void> {
    const callControlId = payload?.call_control_id;
    if (!callControlId) {
      this.logger.warn('call.recording_ended received without call_control_id');
      return;
    }

    const callLog = await this.findCallLogByProviderCallId(callControlId);
    if (!callLog) {
      this.logger.warn(
        `call.recording_ended: no CallLog found for providerCallId ${callControlId}`,
      );
      return;
    }

    const recordingUrl =
      payload?.recording_urls?.mp3 ||
      payload?.recording_url ||
      payload?.public_recording_url;
    if (recordingUrl) {
      callLog.recordingUrl = recordingUrl;
    }
    callLog.rawResponse = this.mergeRawResponse(callLog.rawResponse, rawBody);
    await this.callLogsRepository.save(callLog);

    this.logger.log(`Recording ended for call ${callControlId}`);
  }

  private async handlePlaybackEnded(
    payload: TelnyxPayload,
    rawBody: TelnyxRawBody,
  ): Promise<void> {
    const callControlId = payload?.call_control_id;
    this.logger.log(
      `Playback ended for call ${callControlId ?? 'unknown'} (IVR/voicemail drop)`,
    );

    if (!callControlId) return;

    const callLog = await this.findCallLogByProviderCallId(callControlId);
    if (callLog) {
      callLog.rawResponse = this.mergeRawResponse(callLog.rawResponse, rawBody);
      await this.callLogsRepository.save(callLog);
    }
  }

  private async handleCallRejected(
    payload: TelnyxPayload,
    rawBody: TelnyxRawBody,
  ): Promise<void> {
    const callControlId = payload?.call_control_id;
    if (!callControlId) return;

    const callLog = await this.findCallLogByProviderCallId(callControlId);
    if (!callLog) return;

    callLog.status = CallStatus.FAILED;
    callLog.endedAt = payload?.ended_at
      ? new Date(payload.ended_at)
      : new Date();
    callLog.rawResponse = this.mergeRawResponse(callLog.rawResponse, rawBody);
    await this.callLogsRepository.save(callLog);

    this.logger.log(`Call ${callControlId} rejected → status failed`);
  }

  // ---------------------------------------------------------------------------
  // SMS event handlers
  // ---------------------------------------------------------------------------

  private async handleSmsDelivered(payload: TelnyxPayload): Promise<void> {
    const messageId = payload?.id || payload?.message_id;
    if (!messageId) {
      this.logger.warn('sms.delivered received without message id');
      return;
    }

    const log = await this.findCommunicationLogByMessageId(messageId);
    if (log) {
      log.status = CommunicationStatus.DELIVERED;
      await this.communicationLogsRepository.save(log);
      this.logger.log(`SMS ${messageId} delivered`);
    } else {
      this.logger.warn(
        `sms.delivered: no CommunicationLog for id ${messageId}`,
      );
    }
  }

  private async handleSmsDeliveryFailed(payload: TelnyxPayload): Promise<void> {
    const messageId = payload?.id || payload?.message_id;
    if (!messageId) {
      this.logger.warn('sms.delivery_failed received without message id');
      return;
    }

    const log = await this.findCommunicationLogByMessageId(messageId);
    if (log) {
      log.status = CommunicationStatus.FAILED;
      await this.communicationLogsRepository.save(log);
      this.logger.warn(`SMS ${messageId} delivery failed`);
    } else {
      this.logger.warn(
        `sms.delivery_failed: no CommunicationLog for id ${messageId}`,
      );
    }
  }

  private async handleSmsSent(payload: TelnyxPayload): Promise<void> {
    const messageId = payload?.id || payload?.message_id;
    if (!messageId) return;

    const log = await this.findCommunicationLogByMessageId(messageId);
    if (log) {
      log.status = CommunicationStatus.SENT;
      await this.communicationLogsRepository.save(log);
      this.logger.log(`SMS ${messageId} sent`);
    }
  }

  // ---------------------------------------------------------------------------
  // Post-call workflow
  // ---------------------------------------------------------------------------

  private triggerPostCallWorkflow(callLog: CallLog): void {
    this.logger.log(
      `Post-call workflow triggered for answered call ${callLog.providerCallId} ` +
        `(account ${callLog.collectionAccountId})`,
    );
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async findCallLogByProviderCallId(
    providerCallId: string,
  ): Promise<CallLog | null> {
    return this.callLogsRepository.findOne({ where: { providerCallId } });
  }

  private async findCommunicationLogByMessageId(
    messageId: string,
  ): Promise<CommunicationLog | null> {
    return this.communicationLogsRepository
      .createQueryBuilder('log')
      .where('log.subject = :messageId', { messageId })
      .orWhere('log.recording_url = :messageId', { messageId })
      .getOne();
  }

  private wasCallConnected(callLog: CallLog): boolean {
    return (
      callLog.status === CallStatus.ANSWERED ||
      callLog.status === CallStatus.COMPLETED
    );
  }

  private mergeRawResponse(
    existing: Record<string, unknown> | undefined,
    incoming: TelnyxRawBody,
  ): Record<string, unknown> | undefined {
    if (!incoming) return existing;
    return {
      ...(existing ?? {}),
      lastWebhook: incoming,
      lastWebhookAt: new Date().toISOString(),
    };
  }
}
