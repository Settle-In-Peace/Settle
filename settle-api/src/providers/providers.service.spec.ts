import { ProvidersService } from './providers.service';
import { Provider } from '../entities/provider.entity';
import { Repository } from 'typeorm';
import { CrmService } from '../crm/crm.service';
import { EmailService } from '../email/email.service';

// No real email, database, or paid services are used by these regressions.
describe('attorney directory claims', () => {
  let service: ProvidersService;
  let repo: any;
  let email: any;
  let listing: any;
  let query: any;
  beforeEach(() => {
    listing = { id: 'firm', email: 'unclaimed+firm@settleinpeace.com', website: 'https://www.firm.test/contact', serviceTypes: ['bankruptcy'], listingActive: true, status: 'directory' };
    query = { where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(), getMany: jest.fn().mockResolvedValue([listing]) };
    repo = {
      findOne: jest.fn().mockResolvedValue(null), createQueryBuilder: jest.fn().mockReturnValue(query),
      update: jest.fn().mockResolvedValue({ affected: 1 }), save: jest.fn().mockImplementation(async (p) => p),
      create: jest.fn().mockImplementation((p) => ({ id: 'new', ...p })), increment: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    email = { sendEmail: jest.fn().mockResolvedValue(true) };
    service = new ProvidersService(repo as Repository<Provider>, {} as CrmService, email as EmailService);
  });
  async function emailedToken() {
    const html = email.sendEmail.mock.calls[0][2];
    return decodeURIComponent(html.match(/token=([^"<]+)/)[1]);
  }
  it('does not transfer ownership until the exact-domain inbox is verified', async () => {
    await service.claimDirectoryListing(' Lawyer@firm.test ');
    expect(listing.email).toBe('unclaimed+firm@settleinpeace.com');
    expect(repo.save).not.toHaveBeenCalled();
    const token = await emailedToken();
    const stored = repo.update.mock.calls[0][1].passwordSetupToken;
    expect(stored).toMatch(/^claim:[a-f0-9]{64}$/);
    expect(stored).not.toContain(token);
    listing.passwordSetupExpires = new Date(Date.now() + 60000);
    repo.findOne.mockImplementation(async ({ where }) => where.passwordSetupToken === stored ? listing : null);
    await service.setPasswordWithToken(token, 'StrongPassword123!');
    expect(listing.email).toBe('lawyer@firm.test');
    expect(listing.emailVerified).toBe(true);
    expect(listing.passwordSetupToken).toBeNull();
    await expect(service.setPasswordWithToken(stored, 'StrongPassword123!')).rejects.toThrow();
  });
  it.each(['lawyer@irm.test', 'lawyer@firm.test.attacker.test', 'lawyer@gmail.com'])(
    'does not claim by substring or shared mailbox domain: %s', async (address) => {
      await service.claimDirectoryListing(address);
      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending_review' }));
      expect(repo.update.mock.calls[0][0]).toBe('new');
    },
  );
  it('does not choose arbitrarily between firms on the same domain', async () => {
    query.getMany.mockResolvedValue([listing, { ...listing, id: 'other' }]);
    await service.claimDirectoryListing('lawyer@firm.test');
    expect(repo.update.mock.calls[0][0]).toBe('new');
  });
  it.each([undefined, '', 'not-an-email', 'unclaimed+firm@settleinpeace.com'])(
    'rejects malformed and placeholder recipients: %s', async (address) => {
      await expect(service.claimDirectoryListing(address as string)).rejects.toThrow();
      expect(repo.update).not.toHaveBeenCalled();
    },
  );
  it('rejects modified recipient tokens', async () => {
    await service.claimDirectoryListing('lawyer@firm.test');
    const token = await emailedToken();
    await expect(service.setPasswordWithToken(token + 'tampered', 'StrongPassword123!')).rejects.toThrow();
    expect(repo.save).not.toHaveBeenCalled();
  });
  it('does not publish an unreviewed applicant after inbox verification', async () => {
    const pending = { ...listing, status: 'pending_review', listingActive: false, passwordSetupExpires: new Date(Date.now() + 60000) };
    repo.findOne.mockResolvedValue(pending);
    await service.setPasswordWithToken('legacy-setup-token', 'StrongPassword123!');
    expect(pending.listingActive).toBe(false);
  });
  it('rejects expired links and concurrent reuse', async () => {
    const provider = { ...listing, passwordSetupExpires: new Date(Date.now() - 60000) };
    repo.findOne.mockResolvedValue(provider);
    await expect(service.setPasswordWithToken('legacy-token', 'StrongPassword123!')).rejects.toThrow();
    provider.passwordSetupExpires = new Date(Date.now() + 60000);
    repo.update.mockResolvedValue({ affected: 0 });
    await expect(service.setPasswordWithToken('legacy-token', 'StrongPassword123!')).rejects.toThrow();
  });
  it('surfaces failed email delivery instead of reporting success', async () => {
    email.sendEmail.mockResolvedValue(false);
    await expect(service.claimDirectoryListing('lawyer@firm.test')).rejects.toThrow('Unable to send claim email');
  });
  it('records clicks only for public listings', async () => {
    await expect(service.trackDirectoryClick('private')).rejects.toThrow('Listing not found');
    expect(repo.findOne).toHaveBeenCalledWith({ where: { slug: 'private', listingActive: true } });
    expect(repo.increment).not.toHaveBeenCalled();
  });
  it.each([
    ['website', 'directoryWebsiteClicks'],
    ['phone', 'directoryPhoneClicks'],
  ] as const)('records %s clicks on the matching per-target counter', async (target, field) => {
    repo.findOne.mockResolvedValue(listing);
    await service.trackDirectoryClick('firm', target);
    expect(repo.increment).toHaveBeenCalledWith({ id: 'firm' }, 'directoryClicks', 1);
    expect(repo.increment).toHaveBeenCalledWith({ id: 'firm' }, field, 1);
    expect(repo.increment).toHaveBeenCalledTimes(2);
  });
  it('bumps only the aggregate counter when no target is given', async () => {
    repo.findOne.mockResolvedValue(listing);
    await service.trackDirectoryClick('firm');
    expect(repo.increment).toHaveBeenCalledTimes(1);
    expect(repo.increment).toHaveBeenCalledWith({ id: 'firm' }, 'directoryClicks', 1);
  });
});
