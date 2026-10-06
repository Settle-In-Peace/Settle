import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  QaQuestion,
  QaCategory,
  QaQuestionStatus,
} from './qa-question.entity';
import { QaAnswer } from './qa-answer.entity';
import { CreateQuestionDto } from './dto/create-question.dto';
import { CreateAnswerDto } from './dto/create-answer.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { UpdateAnswerDto } from './dto/update-answer.dto';
import { AuthUserLike } from '../feedback/feedback.service';

const STAFF_ROLES = new Set(['admin', 'sales']);

/**
 * Public shapes — deliberately exclude author_user_id and contact_email.
 * Askers are always displayed as anonymous; answerers get a label only.
 */
export interface PublicQuestion {
  id: string;
  body: string;
  category: QaCategory;
  status: QaQuestionStatus;
  answersCount: number;
  anonymous: true;
  createdAt: Date;
}

export interface PublicAnswer {
  id: string;
  body: string;
  isOfficial: boolean;
  authorLabel: string;
  createdAt: Date;
}

export interface PublicQuestionDetail extends PublicQuestion {
  answers: PublicAnswer[];
}

@Injectable()
export class QuestionsService {
  constructor(
    @InjectRepository(QaQuestion)
    private readonly questions: Repository<QaQuestion>,
    @InjectRepository(QaAnswer)
    private readonly answers: Repository<QaAnswer>,
  ) {}

  private toPublic(q: QaQuestion): PublicQuestion {
    return {
      id: q.id,
      body: q.body,
      category: q.category,
      status: q.status,
      answersCount: q.answersCount,
      anonymous: true,
      createdAt: q.createdAt,
    };
  }

  private answerToPublic(a: QaAnswer): PublicAnswer {
    return {
      id: a.id,
      body: a.body,
      isOfficial: a.isOfficial,
      authorLabel: a.authorLabel,
      createdAt: a.createdAt,
    };
  }

  async list(category?: string): Promise<PublicQuestion[]> {
    const rows = await this.questions.find({
      where: {
        status: In([QaQuestionStatus.PUBLISHED, QaQuestionStatus.ANSWERED]),
        ...(category ? { category: category as QaCategory } : {}),
      },
      order: { createdAt: 'DESC' },
      take: 200,
    });
    return rows.map((q) => this.toPublic(q));
  }

  async getPublic(id: string): Promise<PublicQuestionDetail> {
    const q = await this.questions.findOne({
      where: {
        id,
        status: In([QaQuestionStatus.PUBLISHED, QaQuestionStatus.ANSWERED]),
      },
    });
    if (!q) throw new NotFoundException('Question not found');

    const answers = await this.answers.find({
      where: { questionId: id },
      order: { isOfficial: 'DESC', createdAt: 'ASC' },
      take: 100,
    });

    return { ...this.toPublic(q), answers: answers.map((a) => this.answerToPublic(a)) };
  }

  async create(
    dto: CreateQuestionDto,
    user?: AuthUserLike | null,
  ): Promise<PublicQuestion> {
    const entity = this.questions.create({
      body: dto.body.trim(),
      category: dto.category ?? QaCategory.OTHER,
      status: QaQuestionStatus.PUBLISHED,
      answersCount: 0,
      authorUserId: user?.sub ?? user?.id ?? undefined,
      contactEmail: dto.contactEmail,
    });
    const saved = await this.questions.save(entity);
    return this.toPublic(saved);
  }

  async addAnswer(
    questionId: string,
    dto: CreateAnswerDto,
    user?: AuthUserLike | null,
  ): Promise<PublicAnswer> {
    const q = await this.questions.findOne({
      where: {
        id: questionId,
        status: In([QaQuestionStatus.PUBLISHED, QaQuestionStatus.ANSWERED]),
      },
    });
    if (!q) throw new NotFoundException('Question not found');

    const userId = user?.sub ?? user?.id;
    const isStaff = !!user?.role && STAFF_ROLES.has(user.role);
    if (!userId && !dto.contactEmail) {
      throw new BadRequestException(
        'An email address is required to answer anonymously.',
      );
    }

    const answer = this.answers.create({
      questionId,
      body: dto.body.trim(),
      // Staff answers are official by default; admins can toggle via PATCH.
      isOfficial: isStaff,
      authorLabel: isStaff ? 'Settle team' : 'Community member',
      authorUserId: userId ?? undefined,
      contactEmail: user?.email ?? dto.contactEmail,
    });
    const saved = await this.answers.save(answer);

    // Recount authoritatively and mark staff-answered questions.
    const count = await this.answers.count({ where: { questionId } });
    q.answersCount = count;
    if (isStaff) q.status = QaQuestionStatus.ANSWERED;
    await this.questions.save(q);

    return this.answerToPublic(saved);
  }

  /** Admin: publish / hide / mark answered. */
  async update(id: string, dto: UpdateQuestionDto): Promise<PublicQuestion> {
    const q = await this.questions.findOne({ where: { id } });
    if (!q) throw new NotFoundException('Question not found');
    if (dto.status !== undefined) q.status = dto.status;
    const saved = await this.questions.save(q);
    return this.toPublic(saved);
  }

  /** Admin: flag/unflag an answer as official. */
  async updateAnswer(
    questionId: string,
    answerId: string,
    dto: UpdateAnswerDto,
  ): Promise<PublicAnswer> {
    const a = await this.answers.findOne({
      where: { id: answerId, questionId },
    });
    if (!a) throw new NotFoundException('Answer not found');
    if (dto.isOfficial !== undefined) {
      a.isOfficial = dto.isOfficial;
      if (dto.isOfficial) a.authorLabel = 'Settle team';
    }
    const saved = await this.answers.save(a);
    return this.answerToPublic(saved);
  }
}
