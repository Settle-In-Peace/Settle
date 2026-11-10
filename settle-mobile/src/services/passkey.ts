import { Passkey } from 'react-native-passkey';
import { api } from './api';
import { setToken, storeUser, AuthResponse } from './auth';

/**
 * Passkey sign-in — discoverable (userless) flow.
 * With no email, the backend issues a challenge with no allowCredentials,
 * so the device offers any synced/on-device passkey and the credential
 * itself resolves the account.
 */
export async function loginWithPasskey(email?: string): Promise<AuthResponse> {
  const optionsRes = await api.post('/auth/passkey/authenticate/options', email ? { email } : {});
  const options = optionsRes.data;
  if (!options?.challenge) throw new Error('Could not start passkey sign-in');

  const assertion = await Passkey.get({
    challenge: options.challenge,
    rpId: options.rpId,
    timeout: options.timeout,
    userVerification: options.userVerification || 'preferred',
    allowCredentials: options.allowCredentials || [],
  });

  const verifyRes = await api.post<AuthResponse>('/auth/passkey/authenticate/verify', {
    email,
    challenge: options.challenge,
    credential: assertion,
  });
  const data = verifyRes.data;

  if (data.success && data.accessToken) {
    await setToken(data.accessToken);
    if (data.user) await storeUser(data.user);
  }
  return data;
}

/**
 * Passkey enrollment — requires an active session (the register/verify
 * endpoints are JWT-guarded). Fetches creation options, opens the native
 * sheet, then posts the attestation for server verification.
 */
export async function enrollPasskey(deviceName?: string): Promise<void> {
  const optionsRes = await api.post('/auth/passkey/register/options');
  const options = optionsRes.data;
  if (!options?.challenge) throw new Error('Could not start passkey setup');

  const credential = await Passkey.create(options);

  await api.post('/auth/passkey/register/verify', {
    credential,
    challenge: options.challenge,
    deviceName,
  });
}

export function isPasskeySupported(): boolean {
  try {
    return Passkey.isSupported();
  } catch {
    return false;
  }
}
