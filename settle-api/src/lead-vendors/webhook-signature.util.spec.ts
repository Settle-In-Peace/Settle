import * as crypto from 'crypto';
import { verifyLeadVendorSignature } from './webhook-signature.util';

const SECRET = 'whsec_testsecret';
const BODY = JSON.stringify({ leads: [{ firstName: 'Jane', phone: '+15551234567' }] });

function sign(body: string, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

describe('verifyLeadVendorSignature', () => {
  it('accepts a valid hex signature', () => {
    expect(verifyLeadVendorSignature(BODY, sign(BODY), SECRET)).toBe(true);
  });

  it('accepts a sha256= prefixed signature', () => {
    expect(verifyLeadVendorSignature(BODY, `sha256=${sign(BODY)}`, SECRET)).toBe(true);
  });

  it('accepts a valid base64 signature', () => {
    const b64 = crypto
      .createHmac('sha256', SECRET)
      .update(BODY, 'utf8')
      .digest('base64');
    expect(verifyLeadVendorSignature(BODY, b64, SECRET)).toBe(true);
  });

  it('rejects a signature over a tampered body', () => {
    const tampered = BODY.replace('Jane', 'Eve');
    expect(verifyLeadVendorSignature(tampered, sign(BODY), SECRET)).toBe(false);
  });

  it('rejects a signature from the wrong secret', () => {
    expect(verifyLeadVendorSignature(BODY, sign(BODY, 'other-secret'), SECRET)).toBe(false);
  });

  it('rejects missing or malformed signatures', () => {
    expect(verifyLeadVendorSignature(BODY, undefined, SECRET)).toBe(false);
    expect(verifyLeadVendorSignature(BODY, '', SECRET)).toBe(false);
    expect(verifyLeadVendorSignature(BODY, 'not-a-sig', SECRET)).toBe(false);
  });

  it('rejects when no secret is configured', () => {
    expect(verifyLeadVendorSignature(BODY, sign(BODY), '')).toBe(false);
  });
});
