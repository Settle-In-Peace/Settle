import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CollectionAccount, CollectionAccountStatus } from '../entities/collection-account.entity';
import { CollectionNote, CollectionNoteType } from '../entities/collection-note.entity';
import { DebtorProfile } from '../entities/debtor-profile.entity';
import { SkipTraceResult, SkipTraceStatus } from '../entities/skip-trace-result.entity';
import { CallLog, CallDirection, CallStatus } from '../entities/call-log.entity';
import { CreditReport } from '../entities/credit-report.entity';
import { BackgroundCheck } from '../entities/background-check.entity';
import { User } from '../entities/user.entity';
import { CreateCollectionAccountDto } from './dto/create-collection-account.dto';
import { UpdateCollectionAccountDto } from './dto/update-collection-account.dto';
import { FilterCollectionAccountDto } from './dto/filter-collection-account.dto';
import { CreateCollectionNoteDto } from './dto/create-collection-note.dto';
import { CreateDebtorProfileDto } from './dto/create-debtor-profile.dto';
import { RunSkipTraceDto } from './dto/run-skip-trace.dto';
import { CreateCallLogDto } from './dto/create-call-log.dto';
import { RunDialerCallDto } from './dto/run-dialer-call.dto';
import { CreateCreditReportDto } from './dto/create-credit-report.dto';
import { CreateBackgroundCheckDto } from './dto/create-background-check.dto';
import { PaymentPortalService } from '../payment-portal/payment-portal.service';

@Injectable()
export class CollectionsService {
  constructor(
    @InjectRepository(CollectionAccount)
    private readonly accountsRepository: Repository<CollectionAccount>,
    @InjectRepository(CollectionNote)
    private readonly notesRepository: Repository<CollectionNote>,
    @InjectRepository(DebtorProfile)
    private readonly debtorProfilesRepository: Repository<DebtorProfile>,
    @InjectRepository(SkipTraceResult)
    private readonly skipTraceResultsRepository: Repository<SkipTraceResult>,
    @InjectRepository(CallLog)
    private readonly callLogsRepository: Repository<CallLog>,
    @InjectRepository(CreditReport)
    private readonly creditReportsRepository: Repository<CreditReport>,
    @InjectRepository(BackgroundCheck)
    private readonly backgroundChecksRepository: Repository<BackgroundCheck>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly paymentPortalService: PaymentPortalService,
  ) {}

  async findAll(filter: FilterCollectionAccountDto = {}) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const skip = (page - 1) * limit;

    const query = this.accountsRepository
      .createQueryBuilder('account')
      .orderBy('account.priority', 'DESC')
      .addOrderBy('account.currentBalance', 'DESC')
      .skip(skip)
      .take(limit);

    if (filter.status) {
      query.andWhere('account.status = :status', { status: filter.status });
    }
    if (filter.assignedTo) {
      if (filter.assignedTo === 'unassigned') {
        query.andWhere('account.assignedTo IS NULL');
      } else {
        query.andWhere('account.assignedTo = :assignedTo', { assignedTo: filter.assignedTo });
      }
    }
    if (filter.creditorId) {
      query.andWhere('account.creditorId = :creditorId', { creditorId: filter.creditorId });
    }
    if (filter.crmClientId) {
      query.andWhere('account.crmClientId = :crmClientId', { crmClientId: filter.crmClientId });
    }
    if (filter.search) {
      const search = `%${filter.search}%`;
      query.andWhere(
        '(account.accountNumber ILIKE :search OR account.notes ILIKE :search)',
        { search },
      );
    }

    const [accounts, total] = await query.getManyAndCount();
    return { accounts, total, page, limit };
  }

  async findOne(id: string) {
    const account = await this.accountsRepository.findOne({ where: { id } });
    if (!account) throw new NotFoundException('Collection account not found');
    return account;
  }

  async create(dto: CreateCollectionAccountDto) {
    const account = this.accountsRepository.create({
      ...dto,
      originalBalance: dto.originalBalance ?? 0,
      currentBalance: dto.currentBalance ?? 0,
      status: dto.status ?? CollectionAccountStatus.NEW,
      priority: dto.priority ?? 2,
      delinquencyDays: dto.delinquencyDays ?? 0,
    } as CollectionAccount);
    return this.accountsRepository.save(account);
  }

  async update(id: string, dto: UpdateCollectionAccountDto) {
    const account = await this.findOne(id);
    const updated = this.accountsRepository.merge(account, dto);
    return this.accountsRepository.save(updated);
  }

  async assignAccount(id: string, assignedTo: string, agentId: string) {
    const account = await this.findOne(id);
    const agent = await this.usersRepository.findOne({ where: { id: assignedTo } });
    if (!agent) throw new NotFoundException('Assigned user not found');
    account.assignedTo = assignedTo;
    const saved = await this.accountsRepository.save(account);
    await this.addNote(id, agentId, {
      noteType: CollectionNoteType.GENERAL,
      content: `Account assigned to ${agent.firstName || agent.email} (${agent.role || 'user'}).`,
    });
    return saved;
  }

  async remove(id: string) {
    const account = await this.findOne(id);
    await this.accountsRepository.remove(account);
    return { success: true };
  }

  async getDashboard() {
    const [totalAccounts, totalBalanceResult, statusCounts, assignedCounts] = await Promise.all([
      this.accountsRepository.count(),
      this.accountsRepository
        .createQueryBuilder('account')
        .select('COALESCE(SUM(account.currentBalance), 0)', 'sum')
        .getRawOne<{ sum: string }>(),
      this.accountsRepository
        .createQueryBuilder('account')
        .select('account.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .groupBy('account.status')
        .getRawMany<{ status: string; count: number }>(),
      this.accountsRepository
        .createQueryBuilder('account')
        .select('account.assignedTo', 'assignedTo')
        .addSelect('COUNT(*)', 'count')
        .addSelect('SUM(account.currentBalance)', 'balance')
        .groupBy('account.assignedTo')
        .getRawMany<{ assignedTo: string; count: number; balance: number }>(),
    ]);

    return {
      totalAccounts,
      totalBalance: Number(totalBalanceResult?.sum) || 0,
      statusCounts: statusCounts ?? [],
      assignedCounts: assignedCounts ?? [],
    };
  }

  async addNote(accountId: string, authorId: string, dto: CreateCollectionNoteDto) {
    await this.findOne(accountId);
    const note = this.notesRepository.create({
      ...dto,
      collectionAccountId: accountId,
      authorId: dto.authorId ?? authorId,
    });
    return this.notesRepository.save(note);
  }

  /**
   * Mint (or return the existing) debtor payment-portal link for an account.
   * The link is ONLY generated here — it is never sent; delivery (SMS/email)
   * stays a human/compliance decision. An audit note is recorded each time.
   */
  async issuePortalLink(accountId: string, agentId: string, rotate = false) {
    const result = await this.paymentPortalService.issuePortalToken(
      accountId,
      agentId,
      rotate,
    );
    await this.notesRepository.save(
      this.notesRepository.create({
        collectionAccountId: accountId,
        authorId: agentId,
        noteType: CollectionNoteType.GENERAL,
        content: result.rotated
          ? 'Debtor payment portal link re-issued — previous link invalidated. Link was generated only; it has not been sent to the debtor.'
          : 'Debtor payment portal link generated. Link was generated only; it has not been sent to the debtor.',
      }),
    );
    return result;
  }

  /** Invalidate the debtor portal link for an account (audit-noted). */
  async revokePortalLink(accountId: string, agentId: string) {
    const result = await this.paymentPortalService.revokePortalToken(accountId);
    if (result.revoked) {
      await this.notesRepository.save(
        this.notesRepository.create({
          collectionAccountId: accountId,
          authorId: agentId,
          noteType: CollectionNoteType.GENERAL,
          content: 'Debtor payment portal link revoked — the previous link no longer resolves.',
        }),
      );
    }
    return result;
  }

  async getNotes(accountId: string) {
    await this.findOne(accountId);
    return this.notesRepository.find({
      where: { collectionAccountId: accountId },
      order: { createdAt: 'DESC' },
    });
  }

  async findDebtorProfile(crmClientId: string) {
    const profile = await this.debtorProfilesRepository.findOne({ where: { crmClientId } });
    if (!profile) throw new NotFoundException('Debtor profile not found');
    return profile;
  }

  async createOrUpdateDebtorProfile(dto: CreateDebtorProfileDto) {
    let profile = await this.debtorProfilesRepository.findOne({
      where: { crmClientId: dto.crmClientId },
    });

    if (profile) {
      profile = this.debtorProfilesRepository.merge(profile, dto);
    } else {
      profile = this.debtorProfilesRepository.create(dto);
    }

    return this.debtorProfilesRepository.save(profile);
  }

  async runSkipTrace(collectionAccountId: string, requestedBy: string, dto: RunSkipTraceDto) {
    const account = await this.findOne(collectionAccountId);

    const searchCriteria = dto.searchCriteria || {};
    const result = this.skipTraceResultsRepository.create({
      collectionAccountId: account.id,
      requestedBy,
      provider: dto.provider || 'manual',
      status: SkipTraceStatus.MANUAL,
      searchCriteria,
      notes: dto.notes,
      confidence: 0.5,
    });

    const saved = await this.skipTraceResultsRepository.save(result);

    await this.addNote(
      collectionAccountId,
      requestedBy,
      {
        noteType: CollectionNoteType.SKIP_TRACE,
        content: `Skip trace initiated via ${saved.provider}.`,
      },
    );

    return saved;
  }

  async findSkipTraces(collectionAccountId: string) {
    await this.findOne(collectionAccountId);
    return this.skipTraceResultsRepository.find({
      where: { collectionAccountId },
      order: { createdAt: 'DESC' },
    });
  }

  async findCallLogs(collectionAccountId: string) {
    await this.findOne(collectionAccountId);
    return this.callLogsRepository.find({
      where: { collectionAccountId },
      order: { createdAt: 'DESC' },
    });
  }

  async createCallLog(collectionAccountId: string, agentId: string, dto: CreateCallLogDto) {
    await this.findOne(collectionAccountId);
    const log = this.callLogsRepository.create({
      ...dto,
      collectionAccountId,
      agentId,
      direction: dto.direction ?? CallDirection.OUTBOUND,
      status: dto.status ?? CallStatus.COMPLETED,
    } as unknown as CallLog);
    await this.addNote(collectionAccountId, agentId, {
      noteType: CollectionNoteType.CALL,
      content: dto.notes || `Call logged to ${dto.phoneNumber} (${dto.status || 'completed'}).`,
    });
    return this.callLogsRepository.save(log);
  }

  async makeCall(collectionAccountId: string, agentId: string, dto: RunDialerCallDto) {
    await this.findOne(collectionAccountId);

    const fromNumber = dto.from || process.env.TELNYX_FROM_NUMBER;
    const connectionId = process.env.TELNYX_CONNECTION_ID;
    const apiKey = process.env.TELNYX_API_KEY;

    const callLog = this.callLogsRepository.create({
      collectionAccountId,
      agentId,
      phoneNumber: dto.to,
      direction: CallDirection.OUTBOUND,
      status: CallStatus.DIALING,
      provider: 'telnyx',
      notes: dto.notes,
    });

    const savedLog = await this.callLogsRepository.save(callLog);

    if (apiKey && connectionId && fromNumber) {
      try {
        const response = await fetch('https://api.telnyx.com/v2/calls', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            connection_id: connectionId,
            to: dto.to,
            from: fromNumber,
          }),
        });

        const responseData = (await response.json()) as any;
        savedLog.providerCallId = responseData?.data?.call_control_id || responseData?.data?.call_session_id;
        savedLog.rawResponse = responseData;

        if (!response.ok) {
          savedLog.status = CallStatus.FAILED;
        } else {
          savedLog.status = CallStatus.DIALING;
        }
      } catch (err: any) {
        savedLog.status = CallStatus.FAILED;
        savedLog.rawResponse = { error: err.message };
      }

      await this.callLogsRepository.save(savedLog);
    } else {
      savedLog.status = CallStatus.SCHEDULED;
      savedLog.providerCallId = `mock-${Date.now()}`;
      await this.callLogsRepository.save(savedLog);
    }

    await this.addNote(collectionAccountId, agentId, {
      noteType: CollectionNoteType.CALL,
      content: `Outbound call dialed to ${dto.to} (${savedLog.status}).`,
    });

    return savedLog;
  }

  async createCreditReport(collectionAccountId: string, agentId: string, dto: CreateCreditReportDto) {
    await this.findOne(collectionAccountId);
    const report = this.creditReportsRepository.create({
      ...dto,
      collectionAccountId,
    } as unknown as CreditReport);
    await this.addNote(collectionAccountId, agentId, {
      noteType: CollectionNoteType.CREDIT_REPORT,
      content: `Credit report added via ${dto.provider || 'manual'}.`,
    });
    return this.creditReportsRepository.save(report);
  }

  async findCreditReports(collectionAccountId: string) {
    await this.findOne(collectionAccountId);
    return this.creditReportsRepository.find({
      where: { collectionAccountId },
      order: { createdAt: 'DESC' },
    });
  }

  async createBackgroundCheck(collectionAccountId: string, agentId: string, dto: CreateBackgroundCheckDto) {
    await this.findOne(collectionAccountId);
    const check = this.backgroundChecksRepository.create({
      ...dto,
      collectionAccountId,
    } as unknown as BackgroundCheck);
    await this.addNote(collectionAccountId, agentId, {
      noteType: CollectionNoteType.BACKGROUND_CHECK,
      content: `Background check added via ${dto.provider || 'manual'}.`,
    });
    return this.backgroundChecksRepository.save(check);
  }

  async findBackgroundChecks(collectionAccountId: string) {
    await this.findOne(collectionAccountId);
    return this.backgroundChecksRepository.find({
      where: { collectionAccountId },
      order: { createdAt: 'DESC' },
    });
  }
}
