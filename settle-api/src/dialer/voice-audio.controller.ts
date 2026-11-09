import {
  Controller,
  Get,
  Param,
  Res,
  NotFoundException,
} from '@nestjs/common';
import { Response } from 'express';
import { Readable } from 'stream';
import { VoiceClientService } from './voice-client.service';

/**
 * Public audio surface for Telnyx `playback_start` — the voice service
 * renders LLM replies (Kokoro TTS) to files served internally on
 * localhost:4027/audio; Telnyx needs a public HTTPS URL to fetch, so this
 * route streams the file through api.settleinpeace.com.
 *
 * Intentionally NOT JWT-guarded (Telnyx fetches unauthenticated). Safety:
 * filenames are a strict basename regex — random hex tmp names or sha1
 * cache names — and settle-voice only serves *.wav/*.mp3/*.m4a from its
 * audio dir. Tmp files are swept ~30min after render.
 */
@Controller('dialer/voice-audio')
export class VoiceAudioController {
  constructor(private readonly voiceClient: VoiceClientService) {}

  @Get(':file')
  async getAudio(@Param('file') file: string, @Res() res: Response) {
    if (!/^[a-zA-Z0-9-]{6,80}\.(wav|mp3|m4a)$/.test(file) || file.includes('..')) {
      throw new NotFoundException();
    }
    let upstream: globalThis.Response;
    try {
      upstream = await this.voiceClient.fetchVoiceAudio(file);
    } catch {
      throw new NotFoundException();
    }
    if (!upstream.ok || !upstream.body) throw new NotFoundException();

    res.setHeader(
      'Content-Type',
      upstream.headers.get('content-type') || 'audio/wav',
    );
    const len = upstream.headers.get('content-length');
    if (len) res.setHeader('Content-Length', len);
    res.setHeader('Cache-Control', 'private, max-age=60');
    Readable.fromWeb(upstream.body as any).pipe(res);
  }
}
