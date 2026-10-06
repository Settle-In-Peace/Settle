import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * OptionalJwtAuthGuard — runs the JWT strategy but never rejects. If a valid
 * Bearer token is present `req.user` is populated; otherwise it is `null` and
 * the request proceeds anonymously. Used by public endpoints that attach the
 * caller's identity when available (feedback board, anonymous Q&A).
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(_err: any, user: any) {
    return user ?? null;
  }
}
