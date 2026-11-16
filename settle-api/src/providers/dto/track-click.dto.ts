import { IsIn, IsOptional } from 'class-validator';

/**
 * Optional body for POST /providers/attorneys/:slug/click. `target`
 * distinguishes which contact link was tapped so per-target counters can be
 * reported on the provider's listing-stats page. Omitted for legacy callers
 * (bare POST) which only bump the aggregate counter.
 */
export class TrackDirectoryClickDto {
  @IsOptional()
  @IsIn(['website', 'phone'])
  target?: 'website' | 'phone';
}
