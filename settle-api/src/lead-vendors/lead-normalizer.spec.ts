import {
  normalizeEmail,
  normalizePhone,
  normalizeVendorLead,
  parseCsv,
  csvRowToRecord,
} from './lead-normalizer';

describe('normalizePhone', () => {
  it('normalizes US numbers to E.164', () => {
    expect(normalizePhone('(555) 123-4567')).toBe('+15551234567');
    expect(normalizePhone('555-123-4567')).toBe('+15551234567');
    expect(normalizePhone('1-555-123-4567')).toBe('+15551234567');
    expect(normalizePhone('+15551234567')).toBe('+15551234567');
  });
  it('returns null for unusable input', () => {
    expect(normalizePhone('123')).toBeNull();
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
  });
});

describe('normalizeEmail', () => {
  it('lowercases and validates', () => {
    expect(normalizeEmail('  Jane@EXAMPLE.com ')).toBe('jane@example.com');
    expect(normalizeEmail('not-an-email')).toBeNull();
    expect(normalizeEmail('')).toBeNull();
  });
});

describe('normalizeVendorLead', () => {
  it('maps common vendor field spellings', () => {
    const { lead, problems } = normalizeVendorLead({
      First_Name: 'Jane',
      LASTNAME: 'Doe',
      'Email Address': 'JANE@X.COM',
      primary_phone: '555.123.4567',
      State: 'tx',
      Debt_Amount: '$25,000',
      'Debt Type': 'credit_card; medical',
      consent: 'yes',
      lead_id: 'V-77',
      someCustomField: 'keep-me',
    });
    expect(lead).toMatchObject({
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@x.com',
      phone: '+15551234567',
      state: 'TX',
      totalDebt: 25000,
      debtTypes: ['credit_card', 'medical'],
      tcpaConsent: true,
      vendorLeadId: 'V-77',
    });
    expect(lead.extra?.someCustomField).toBe('keep-me');
    expect(problems).toEqual([]);
  });

  it('splits a full name when no last name is present', () => {
    const { lead } = normalizeVendorLead({ name: 'Jane Doe', phone: '5551234567' });
    expect(lead.firstName).toBe('Jane');
    expect(lead.lastName).toBe('Doe');
  });

  it('flags rows with no contact info', () => {
    const { problems } = normalizeVendorLead({ firstName: 'No', lastName: 'Contact' });
    expect(problems).toContain('no usable phone or email');
  });

  it('maps address fields (address/street/city/town aliases)', () => {
    const { lead } = normalizeVendorLead({
      name: 'Jane Doe',
      phone: '5551234567',
      'Street Address': '123 Main St',
      town: 'Austin',
      state: 'TX',
      zip: '78701',
    });
    expect(lead.streetAddress).toBe('123 Main St');
    expect(lead.city).toBe('Austin');
    expect(lead.zipCode).toBe('78701');
  });

  it('collects secondary phones into altPhones — normalized, deduped, primary excluded', () => {
    const { lead } = normalizeVendorLead({
      name: 'Jane Doe',
      phone: '555-123-4567',
      phone2: '(555) 987-6543',
      cell: '555-123-4567', // same as primary — excluded
      work_phone: '5551112222',
      alt_phone: 'bad',
    });
    expect(lead.phone).toBe('+15551234567');
    expect(lead.altPhones).toEqual(['+15559876543', '+15551112222']);
  });
});

describe('parseCsv', () => {
  it('parses headers and rows with quoted fields', () => {
    const { headers, rows } = parseCsv(
      'first,last,note\r\n"Jane","Doe"," owes $5,000 "\nBob,Smith,plain\n',
    );
    expect(headers).toEqual(['first', 'last', 'note']);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(['Jane', 'Doe', ' owes $5,000 ']);
  });

  it('maps rows to records by header', () => {
    const { headers, rows } = parseCsv('a,b\n1,2\n');
    expect(csvRowToRecord(headers, rows[0])).toEqual({ a: '1', b: '2' });
  });
});
