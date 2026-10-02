import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { LeadVendorsService } from './lead-vendors.service';
import { LeadImportBatchStatus } from '../entities/lead-import-batch.entity';
import { LeadPurchaseStatus } from '../entities/lead-purchase.entity';
import { normalizeVendorLead } from './lead-normalizer';

interface RepoMocks {
  create: jest.Mock;
  save: jest.Mock;
  findOne: jest.Mock;
  find: jest.Mock;
  createQueryBuilder: jest.Mock;
  update: jest.Mock;
}

function makeRepo(): RepoMocks {
  return {
    create: jest.fn((x: any) => ({ ...x })),
    save: jest.fn(async (x: any) => ({ id: 'saved-id', ...x })),
    findOne: jest.fn(),
    find: jest.fn(async () => []),
    createQueryBuilder: jest.fn(),
    update: jest.fn(async () => ({})),
  };
}

function makeService(opts: {
  provider?: any;
  duplicateOf?: any;
  isActive?: boolean;
}) {
  const leadsRepo = makeRepo();
  const batchesRepo = makeRepo();
  const purchasesRepo = makeRepo();
  const accountsRepo = makeRepo();

  const qb = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getOne: jest.fn(async () => opts.duplicateOf ?? null),
    getManyAndCount: jest.fn(async () => [[], 0]),
  };
  leadsRepo.createQueryBuilder.mockReturnValue(qb);

  const registry = {
    getProvider: jest.fn(async () => opts.provider),
    isActive: jest.fn(async () => opts.isActive ?? true),
    listVendors: jest.fn(async () => []),
    webhookSecret: jest.fn(async () => null),
    refresh: jest.fn(),
  };
  const scoring = {
    score: jest.fn(() => ({
      score: 80,
      tier: 'premium',
      factors: { consented: true },
    })),
  };
  const crmService = { findClientByGroupId: jest.fn(), createClient: jest.fn() };
  const collectionsService = {
    create: jest.fn(async (x: any) => ({ id: 'acct-1', ...x })),
    addNote: jest.fn(async () => ({})),
    findOne: jest.fn(),
  };

  const service = new LeadVendorsService(
    registry as any,
    scoring as any,
    leadsRepo as any,
    batchesRepo as any,
    purchasesRepo as any,
    accountsRepo as any,
    crmService as any,
    collectionsService as any,
  );

  return { service, leadsRepo, batchesRepo, purchasesRepo, registry, qb };
}

const LEAD_ROW = {
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane@example.com',
  phone: '(555) 123-4567',
  state: 'TX',
  debtAmount: '25,000',
  tcpaConsent: 'yes',
};

describe('LeadVendorsService', () => {
  describe('import pipeline (webhook/CSV)', () => {
    it('imports a normalized lead with source tracking + score', async () => {
      const { service, leadsRepo, batchesRepo } = makeService({ provider: null });
      const { batch } = await service.ingestWebhook('boberdoo', {
        leads: [LEAD_ROW],
      });

      expect(batch.status).toBe(LeadImportBatchStatus.COMPLETED);
      expect(batch.imported).toBe(1);
      expect(batch.duplicates).toBe(0);

      const saved = leadsRepo.save.mock.calls[0][0];
      expect(saved.vendorName).toBe('boberdoo');
      expect(saved.source).toBe('vendor:boberdoo');
      expect(saved.phone).toBe('+15551234567'); // E.164
      expect(saved.email).toBe('jane@example.com');
      expect(saved.totalDebt).toBe(25000);
      expect(saved.tcpaConsent).toBe(true);
      expect(saved.qualityScore).toBe(80);
      expect(saved.status).toBe('new');
      expect(batchesRepo.save).toHaveBeenCalled();
    });

    it('dedupes on phone OR email — row kept as status=duplicate', async () => {
      const existing = { id: 'orig-1', phone: '+15551234567' };
      const { service, leadsRepo, batchesRepo } = makeService({
        provider: null,
        duplicateOf: existing,
      });

      const { batch, leadIds } = await service.ingestWebhook('boberdoo', [
        { ...LEAD_ROW, email: 'different@example.com' },
      ]);

      expect(batch.imported).toBe(0);
      expect(batch.duplicates).toBe(1);
      expect(leadIds).toHaveLength(0);

      const saved = leadsRepo.save.mock.calls[0][0];
      expect(saved.status).toBe('duplicate');
      expect(saved.duplicateOf).toBe('orig-1');
      expect(saved.qualityScore).toBeUndefined(); // dupes are not scored
      expect(batch.rowErrors[0].reason).toContain('duplicate of lead orig-1');
      void batchesRepo;
    });

    it('marks rows with no usable phone or email invalid', async () => {
      const { service } = makeService({ provider: null });
      const { batch } = await service.ingestWebhook('boberdoo', [
        { firstName: 'No', lastName: 'Contact' },
      ]);
      expect(batch.invalid).toBe(1);
      expect(batch.imported).toBe(0);
    });

    it('imports CSV content through the same pipeline', async () => {
      const { service } = makeService({ provider: null });
      const csv =
        'first_name,last_name,email,phone,state,debt_amount\n' +
        'John,Smith,john@x.com,555-999-8888,FL,12000\n';
      const { batch } = await service.importCsv('leadprosper', csv, 'export.csv', 'user-1');
      expect(batch.vendorName).toBe('leadprosper');
      expect(batch.filename).toBe('export.csv');
      expect(batch.imported).toBe(1);
    });
  });

  describe('purchaseLeads', () => {
    it('fails closed with 503 when the vendor is unconfigured', async () => {
      const provider = { isConfigured: () => false, name: 'boberdoo' };
      const { service } = makeService({ provider });
      await expect(
        service.purchaseLeads(
          { vendor: 'boberdoo', quantity: 5 } as any,
          'user-1',
        ),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('rejects unknown vendors with 404', async () => {
      const { service, registry } = makeService({ provider: undefined });
      const { NotFoundException } = await import('@nestjs/common');
      registry.getProvider.mockRejectedValue(
        new NotFoundException('Unknown lead vendor: nobody'),
      );
      await expect(
        service.purchaseLeads({ vendor: 'nobody', quantity: 1 } as any, 'u'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('records a completed purchase + batch for inline leads', async () => {
      const provider = {
        name: 'boberdoo',
        supportsPingPost: false,
        isConfigured: () => true,
        purchaseLeads: jest.fn(async () => ({
          purchaseId: 'ord-1',
          leads: [normalizeVendorLead(LEAD_ROW).lead],
          quantityReceived: 1,
          pricePerLead: 40,
          totalCost: 40,
        })),
      };
      const { service, purchasesRepo } = makeService({ provider });
      const { purchase } = await service.purchaseLeads(
        { vendor: 'boberdoo', quantity: 5 } as any,
        'user-1',
      );

      expect(provider.purchaseLeads).toHaveBeenCalledWith(
        expect.objectContaining({}),
        5,
      );
      expect(purchase.status).toBe(LeadPurchaseStatus.COMPLETED);
      expect(purchase.vendorPostId).toBe('ord-1');
      expect(purchase.importBatchId).toBeDefined();
      const savedPurchase = purchasesRepo.save.mock.calls.at(-1)![0];
      expect(savedPurchase.status).toBe(LeadPurchaseStatus.COMPLETED);
    });

    it('marks the purchase failed when the vendor call throws', async () => {
      const provider = {
        name: 'boberdoo',
        supportsPingPost: false,
        isConfigured: () => true,
        purchaseLeads: jest.fn(async () => {
          throw new Error('upstream dead');
        }),
      };
      const { service, purchasesRepo } = makeService({ provider });
      await expect(
        service.purchaseLeads({ vendor: 'boberdoo', quantity: 5 } as any, 'u'),
      ).rejects.toThrow('upstream dead');
      const saved = purchasesRepo.save.mock.calls.at(-1)![0];
      expect(saved.status).toBe(LeadPurchaseStatus.FAILED);
      expect(saved.error).toContain('upstream dead');
    });

    it('rejects the buy when the pinged price exceeds the cap', async () => {
      const provider = {
        name: 'boberdoo',
        supportsPingPost: true,
        isConfigured: () => true,
        priceLead: jest.fn(async () => ({ accepted: true, price: 60, pingId: 'p1' })),
        purchaseLeads: jest.fn(),
      };
      const { service, purchasesRepo } = makeService({ provider });
      await expect(
        service.purchaseLeads(
          { vendor: 'boberdoo', quantity: 5, maxPricePerLead: 50 } as any,
          'u',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(provider.purchaseLeads).not.toHaveBeenCalled();
      const saved = purchasesRepo.save.mock.calls.at(-1)![0];
      expect(saved.status).toBe(LeadPurchaseStatus.REJECTED);
    });
  });
});
