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

export function isPasskeySupported(): boolean {
  try {
    return Passkey.isSupported();
  } catch {
    return false;
  }
}
