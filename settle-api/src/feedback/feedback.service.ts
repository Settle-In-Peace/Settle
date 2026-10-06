import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  FeatureRequest,
  FeatureRequestStatus,
} from './feature-request.entity';
import { FeatureRequestVote } from './feature-request-vote.entity';
import { CreateFeatureRequestDto } from './dto/create-feature-request.dto';
import { UpdateFeatureRequestDto } from './dto/update-feature-request.dto';

/** Public shape — never leaks author email / user id. */
export interface PublicFeatureRequest {
  id: string;
  title: string;
  body?: string;
  category: string;
  status: FeatureRequestStatus;
  votes: number;
  authorName: string;
  createdAt: Date;
}

export interface AuthUserLike {
  sub?: string;
  id?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
}

@Injectable()
export class FeedbackService {
  constructor(
    @InjectRepository(FeatureRequest)
    private readonly requests: Repository<FeatureRequest>,
    @InjectRepository(FeatureRequestVote)
    private readonly votesRepo: Repository<FeatureRequestVote>,
  ) {}

  private toPublic(r: FeatureRequest): PublicFeatureRequest {
    return {
      id: r.id,
      title: r.title,
      body: r.body,
      category: r.category,
      status: r.status,
      votes: r.votes,
      authorName: r.authorName || 'Anonymous',
      createdAt: r.createdAt,
    };
  }

  async list(status?: string): Promise<PublicFeatureRequest[]> {
    const where = status ? { status: status as FeatureRequestStatus } : {};
    const rows = await this.requests.find({
      where,
      order: { votes: 'DESC', createdAt: 'DESC' },
      take: 200,
    });
    return rows.map((r) => this.toPublic(r));
  }

  async create(
    dto: CreateFeatureRequestDto,
    user?: AuthUserLike | null,
  ): Promise<PublicFeatureRequest> {
    const userId = user?.sub ?? user?.id;
    if (!userId && !dto.email) {
      throw new BadRequestException(
        'An email address is required for anonymous submissions.',
      );
    }

    const displayName = user
      ? [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email
      : dto.authorName;

    const entity = this.requests.create({
      title: dto.title.trim(),
      body: dto.body?.trim() || undefined,
      category: (dto.category || 'general').trim().toLowerCase(),
      status: FeatureRequestStatus.UNDER_REVIEW,
      votes: 0,
      authorName: displayName || undefined,
      authorEmail: user?.email ?? dto.email,
      authorUserId: userId ?? undefined,
    });

    const saved = await this.requests.save(entity);
    return this.toPublic(saved);
  }

  /**
   * Toggle a vote for `voterId` on `requestId`, then recount authoritatively
   * from feature_request_votes so the denormalized counter can never drift.
   */
  async toggleVote(
    requestId: string,
    voterId: string,
  ): Promise<{ id: string; votes: number; voted: boolean }> {
    if (!voterId) {
      throw new BadRequestException('voterId is required.');
    }

    const request = await this.requests.findOne({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Feature request not found');

    const existing = await this.votesRepo.findOne({
      where: { requestId, voterId },
    });

    let voted: boolean;
    if (existing) {
      await this.votesRepo.delete({ id: existing.id });
      voted = false;
    } else {
      try {
        await this.votesRepo.insert({ requestId, voterId });
        voted = true;
      } catch {
        // Unique-violation race: another request inserted the same pair —
        // treat as already voted and recount below.
        voted = true;
      }
    }

    const count = await this.votesRepo.count({ where: { requestId } });
    await this.requests.update({ id: requestId }, { votes: count });

    return { id: requestId, votes: count, voted };
  }

  /** Admin: update status / edit fields. */
  async update(
    id: string,
    dto: UpdateFeatureRequestDto,
  ): Promise<PublicFeatureRequest> {
    const request = await this.requests.findOne({ where: { id } });
    if (!request) throw new NotFoundException('Feature request not found');

    if (dto.title !== undefined) request.title = dto.title.trim();
    if (dto.body !== undefined) request.body = dto.body.trim() || undefined;
    if (dto.category !== undefined)
      request.category = dto.category.trim().toLowerCase();
    if (dto.status !== undefined) request.status = dto.status;

    const saved = await this.requests.save(request);
    return this.toPublic(saved);
  }
}
