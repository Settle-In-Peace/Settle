import { IsBoolean, IsOptional } from 'class-validator';

export class IssuePortalLinkDto {
  /** Pass true to invalidate a previously issued link and mint a fresh token. */
  @IsBoolean()
  @IsOptional()
  rotate?: boolean;
}
