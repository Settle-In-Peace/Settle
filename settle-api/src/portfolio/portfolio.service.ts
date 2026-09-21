import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import {
  DebtPortfolio,
  DebtPortfolioStatus,
  DebtPortfolioAccount,
  DebtPortfolioAccountStatus,
} from '../entities/debt-portfolio.entity';
import { CollectionAccount } from '../entities/collection-account.entity';

export interface CreatePortfolioDto {
  portfolioName: string;
  sellerName: string;
  sellerContactInfo: string;
  purchaseDate: string | Date;
  purchasePrice?: number;
  totalFaceValue?: number;
  accountCount?: number;
  status?: DebtPortfolioStatus;
  purchasePricePerCent?: number;
  contractDocumentUrl?: string;
  notes?: string;
}

export interface UpdatePortfolioDto {
  portfolioName?: string;
  sellerName?: string;
  sellerContactInfo?: string;
  purchaseDate?: string | Date;
  purchasePrice?: number;
  totalFaceValue?: number;
  accountCount?: number;
  status?: DebtPortfolioStatus;
  purchasePricePerCent?: number;
  contractDocumentUrl?: string;
  notes?: string;
}

export interface PortfolioFilters {
  status?: DebtPortfolioStatus;
  page?: number;
  limit?: number;
}

export interface ImportAccountDto {
  originalCreditor: string;
  originalAccountNumber: string;
  debtorName: string;
  debtorPhone?: string;
  debtorEmail?: string;
  debtorAddress?: string;
  debtorState: string;
  faceValue?: number;
  purchasePrice?: number;
  status?: DebtPortfolioAccountStatus;
  totalCollected?: number;
  lastPaymentDate?: string | Date;
  chargeOffDate?: string | Date;
  lastActivityDate?: string | Date;
  statuteOfLimitationsDate?: string | Date;
  importData?: Record<string, any>;
  customFields?: Record<string, any>;
  collectionAccountId?: string;
}

export interface AccountFilters {
  status?: DebtPortfolioAccountStatus;
  state?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface UpdateAccountDto {
  status?: DebtPortfolioAccountStatus;
  totalCollected?: number;
  lastPaymentDate?: string | Date;
  collectionAccountId?: string;
  debtorName?: string;
  debtorPhone?: string;
  debtorEmail?: string;
  debtorAddress?: string;
  debtorState?: string;
  customFields?: Record<string, any>;
}

@Injectable()
export class PortfolioService {
  constructor(
    @InjectRepository(DebtPortfolio)
    private readonly portfoliosRepository: Repository<DebtPortfolio>,
    @InjectRepository(DebtPortfolioAccount)
    private readonly accountsRepository: Repository<DebtPortfolioAccount>,
    @InjectRepository(CollectionAccount)
    private readonly collectionAccountsRepository: Repository<CollectionAccount>,
  ) {}

  async createPortfolio(dto: CreatePortfolioDto) {
    const portfolio = this.portfoliosRepository.create({
      portfolioName: dto.portfolioName,
      sellerName: dto.sellerName,
      sellerContactInfo: dto.sellerContactInfo,
      purchaseDate: new Date(dto.purchaseDate),
      purchasePrice: dto.purchasePrice ?? 0,
      totalFaceValue: dto.totalFaceValue ?? 0,
      accountCount: dto.accountCount ?? 0,
      status: dto.status ?? DebtPortfolioStatus.PURCHASED,
      purchasePricePerCent: dto.purchasePricePerCent ?? 0,
      contractDocumentUrl: dto.contractDocumentUrl,
      notes: dto.notes,
    } as DebtPortfolio);
    return this.portfoliosRepository.save(portfolio);
  }

  async getPortfolios(filters: PortfolioFilters = {}) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const skip = (page - 1) * limit;

    const query = this.portfoliosRepository
      .createQueryBuilder('portfolio')
      .orderBy('portfolio.purchaseDate', 'DESC')
      .skip(skip)
      .take(limit);

    if (filters.status) {
      query.andWhere('portfolio.status = :status', { status: filters.status });
    }

    const [portfolios, total] = await query.getManyAndCount();
    return { portfolios, total, page, limit };
  }

  async getPortfolio(id: string) {
    const portfolio = await this.portfoliosRepository.findOne({ where: { id } });
    if (!portfolio) throw new NotFoundException('Debt portfolio not found');

    const stats = await this.getPortfolioStats(id);
    return { ...portfolio, stats };
  }

  async updatePortfolio(id: string, dto: UpdatePortfolioDto) {
    const portfolio = await this.portfoliosRepository.findOne({ where: { id } });
    if (!portfolio) throw new NotFoundException('Debt portfolio not found');

    const updated = this.portfoliosRepository.merge(portfolio, {
      ...dto,
      purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : undefined,
    } as DebtPortfolio);
    return this.portfoliosRepository.save(updated);
  }

  async importAccounts(portfolioId: string, accounts: ImportAccountDto[]) {
    const portfolio = await this.portfoliosRepository.findOne({ where: { id: portfolioId } });
    if (!portfolio) throw new NotFoundException('Debt portfolio not found');

    // Collect original account numbers to attempt linking to existing CollectionAccounts
    const accountNumbers = accounts
      .map((a) => a.originalAccountNumber)
      .filter(Boolean) as string[];

    let existingByNumber = new Map<string, CollectionAccount>();
    if (accountNumbers.length > 0) {
      const existing = await this.collectionAccountsRepository.find({
        where: { accountNumber: In(accountNumbers) },
      });
      existingByNumber = new Map(existing.map((a) => [a.accountNumber as string, a]));
    }

    const entities: DebtPortfolioAccount[] = accounts.map((dto) => {
      const linked = dto.collectionAccountId
        ? undefined
        : existingByNumber.get(dto.originalAccountNumber);

      return this.accountsRepository.create({
        portfolioId,
        collectionAccountId: dto.collectionAccountId ?? linked?.id,
        originalCreditor: dto.originalCreditor,
        originalAccountNumber: dto.originalAccountNumber,
        debtorName: dto.debtorName,
        debtorPhone: dto.debtorPhone,
        debtorEmail: dto.debtorEmail,
        debtorAddress: dto.debtorAddress,
        debtorState: dto.debtorState,
        faceValue: dto.faceValue ?? 0,
        purchasePrice: dto.purchasePrice ?? 0,
        status: dto.status ?? DebtPortfolioAccountStatus.PENDING_IMPORT,
        totalCollected: dto.totalCollected ?? 0,
        lastPaymentDate: dto.lastPaymentDate ? new Date(dto.lastPaymentDate) : undefined,
        chargeOffDate: dto.chargeOffDate ? new Date(dto.chargeOffDate) : undefined,
        lastActivityDate: dto.lastActivityDate ? new Date(dto.lastActivityDate) : undefined,
        statuteOfLimitationsDate: dto.statuteOfLimitationsDate
          ? new Date(dto.statuteOfLimitationsDate)
          : undefined,
        importData: dto.importData ?? {},
        customFields: dto.customFields,
      } as DebtPortfolioAccount);
    });

    const saved = await this.accountsRepository.save(entities);

    // Update portfolio account count and face value totals
    const countResult = await this.accountsRepository.count({
      where: { portfolioId },
    });
    const sumResult = await this.accountsRepository
      .createQueryBuilder('account')
      .select('COALESCE(SUM(account.faceValue), 0)', 'faceValue')
      .addSelect('COALESCE(SUM(account.purchasePrice), 0)', 'purchasePrice')
      .where('account.portfolioId = :portfolioId', { portfolioId })
      .getRawOne<{ faceValue: string; purchasePrice: string }>();

    portfolio.accountCount = countResult;
    portfolio.totalFaceValue = Number(sumResult?.faceValue) || 0;
    if (Number(portfolio.purchasePrice) === 0) {
      portfolio.purchasePrice = Number(sumResult?.purchasePrice) || 0;
    }
    await this.portfoliosRepository.save(portfolio);

    return { imported: saved.length, accounts: saved };
  }

  async getPortfolioAccounts(portfolioId: string, filters: AccountFilters = {}) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const skip = (page - 1) * limit;

    const query = this.accountsRepository
      .createQueryBuilder('account')
      .where('account.portfolioId = :portfolioId', { portfolioId })
      .orderBy('account.faceValue', 'DESC')
      .skip(skip)
      .take(limit);

    if (filters.status) {
      query.andWhere('account.status = :status', { status: filters.status });
    }
    if (filters.state) {
      query.andWhere('account.debtorState = :state', { state: filters.state });
    }
    if (filters.search) {
      const search = `%${filters.search}%`;
      query.andWhere(
        '(account.debtorName ILIKE :search OR account.originalAccountNumber ILIKE :search OR account.originalCreditor ILIKE :search)',
        { search },
      );
    }

    const [accounts, total] = await query.getManyAndCount();
    return { accounts, total, page, limit };
  }

  async getAccount(id: string) {
    const account = await this.accountsRepository.findOne({
      where: { id },
      relations: ['collectionAccount'],
    });
    if (!account) throw new NotFoundException('Portfolio account not found');
    return account;
  }

  async updateAccount(id: string, dto: UpdateAccountDto) {
    const account = await this.accountsRepository.findOne({ where: { id } });
    if (!account) throw new NotFoundException('Portfolio account not found');

    const updated = this.accountsRepository.merge(account, {
      ...dto,
      lastPaymentDate: dto.lastPaymentDate ? new Date(dto.lastPaymentDate) : undefined,
    } as DebtPortfolioAccount);
    return this.accountsRepository.save(updated);
  }

  async getPortfolioStats(id: string) {
    const portfolio = await this.portfoliosRepository.findOne({ where: { id } });
    if (!portfolio) throw new NotFoundException('Debt portfolio not found');

    const sumResult = await this.accountsRepository
      .createQueryBuilder('account')
      .select('COALESCE(SUM(account.faceValue), 0)', 'totalFaceValue')
      .addSelect('COALESCE(SUM(account.purchasePrice), 0)', 'totalPurchasePrice')
      .addSelect('COALESCE(SUM(account.totalCollected), 0)', 'totalCollected')
      .addSelect('COUNT(*)', 'totalAccounts')
      .addSelect(
        "COUNT(*) FILTER (WHERE account.status = 'active')",
        'activeAccounts',
      )
      .where('account.portfolioId = :portfolioId', { portfolioId: id })
      .getRawOne<{
        totalFaceValue: string;
        totalPurchasePrice: string;
        totalCollected: string;
        totalAccounts: string;
        activeAccounts: string;
      }>();

    const totalFaceValue = Number(sumResult?.totalFaceValue) || 0;
    const totalPurchasePrice = Number(sumResult?.totalPurchasePrice) || 0;
    const totalCollected = Number(sumResult?.totalCollected) || 0;
    const totalAccounts = Number(sumResult?.totalAccounts) || 0;
    const activeAccounts = Number(sumResult?.activeAccounts) || 0;

    const recoveryRate = totalPurchasePrice > 0 ? totalCollected / totalPurchasePrice : 0;
    const roi = totalPurchasePrice > 0 ? (totalCollected - totalPurchasePrice) / totalPurchasePrice : 0;

    const accountsByStatus = await this.accountsRepository
      .createQueryBuilder('account')
      .select('account.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('account.portfolioId = :portfolioId', { portfolioId: id })
      .groupBy('account.status')
      .getRawMany<{ status: string; count: number }>();

    const accountsByState = await this.accountsRepository
      .createQueryBuilder('account')
      .select('account.debtorState', 'state')
      .addSelect('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(account.faceValue), 0)', 'faceValue')
      .addSelect('COALESCE(SUM(account.totalCollected), 0)', 'collected')
      .where('account.portfolioId = :portfolioId', { portfolioId: id })
      .groupBy('account.debtorState')
      .getRawMany<{ state: string; count: number; faceValue: string; collected: string }>();

    return {
      totalFaceValue,
      totalPurchasePrice,
      totalCollected,
      recoveryRate,
      roi,
      totalAccounts,
      activeAccounts,
      accountsByStatus: accountsByStatus ?? [],
      accountsByState: (accountsByState ?? []).map((s) => ({
        state: s.state,
        count: Number(s.count),
        faceValue: Number(s.faceValue) || 0,
        collected: Number(s.collected) || 0,
      })),
    };
  }

  async getDashboardStats() {
    const portfolioSumResult = await this.portfoliosRepository
      .createQueryBuilder('portfolio')
      .select('COALESCE(SUM(portfolio.purchasePrice), 0)', 'totalInvested')
      .addSelect('COALESCE(SUM(portfolio.totalFaceValue), 0)', 'totalFaceValue')
      .addSelect('COUNT(*)', 'totalPortfolios')
      .addSelect(
        "COUNT(*) FILTER (WHERE portfolio.status = 'active')",
        'activePortfolios',
      )
      .getRawOne<{
        totalInvested: string;
        totalFaceValue: string;
        totalPortfolios: string;
        activePortfolios: string;
      }>();

    const accountSumResult = await this.accountsRepository
      .createQueryBuilder('account')
      .select('COALESCE(SUM(account.totalCollected), 0)', 'totalCollected')
      .addSelect('COUNT(*)', 'totalAccounts')
      .addSelect(
        'COALESCE(SUM(account.totalCollected) FILTER (WHERE account.lastPaymentDate >= date_trunc(\'month\', now())), 0)',
        'collectedThisMonth',
      )
      .getRawOne<{ totalCollected: string; totalAccounts: string; collectedThisMonth: string }>();

    const totalInvested = Number(portfolioSumResult?.totalInvested) || 0;
    const totalCollected = Number(accountSumResult?.totalCollected) || 0;
    const collectedThisMonth = Number(accountSumResult?.collectedThisMonth) || 0;
    const totalAccounts = Number(accountSumResult?.totalAccounts) || 0;
    const activePortfolios = Number(portfolioSumResult?.activePortfolios) || 0;
    const totalPortfolios = Number(portfolioSumResult?.totalPortfolios) || 0;
    const totalFaceValue = Number(portfolioSumResult?.totalFaceValue) || 0;

    const overallROI = totalInvested > 0 ? (totalCollected - totalInvested) / totalInvested : 0;

    return {
      totalInvested,
      totalCollected,
      totalFaceValue,
      overallROI,
      activePortfolios,
      totalPortfolios,
      totalAccounts,
      collectedThisMonth,
    };
  }
}
