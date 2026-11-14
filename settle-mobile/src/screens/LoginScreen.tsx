import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../navigation/AppNavigator';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { login, verifyEmailOtp, resendEmailOtp, User } from '../services/auth';
import { loginWithPasskey, isPasskeySupported } from '../services/passkey';
import { colors } from '../theme/colors';

type LoginScreenProps = NativeStackScreenProps<AuthStackParamList, 'Login'> & {
  setUser: (user: User | null) => void;
};

export default function LoginScreen({ navigation, setUser }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // Login can return requiresVerification (unverified email) — the API sends
  // a code during the login call; the user confirms it here to get tokens.
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [code, setCode] = useState('');
  const [notice, setNotice] = useState('');
  // Resend cooldown — each tap fires a real email, so pace it.
  const RESEND_COOLDOWN_S = 45;
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  async function handleLogin() {
    setError('');
    setLoading(true);
    try {
      const response = await login(email, password);
      if (response.success && response.user) {
        setUser(response.user);
      } else if (response.success && response.requiresVerification) {
        setAwaitingCode(true);
        setResendIn(RESEND_COOLDOWN_S); // a code was already sent by login
        setNotice(response.message || `We sent a verification code to ${email}.`);
      } else {
        setError(response.error || 'Login failed');
      }
    } catch (err: any) {
      setError(err?.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify() {
    setError('');
    setLoading(true);
    try {
      const response = await verifyEmailOtp(email, code.trim());
      if (response.success && response.user) {
        setUser(response.user);
      } else {
        setError(response.error || 'Verification failed');
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Invalid verification code');
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (resendIn > 0) return;
    try {
      await resendEmailOtp(email);
      setNotice('Code resent — check your email.');
      setError('');
      setResendIn(RESEND_COOLDOWN_S);
    } catch {
      setError('Could not resend the code yet — try again in a moment.');
    }
  }

  async function handlePasskey() {
    setError('');
    setLoading(true);
    try {
      // Email optional — blank field triggers discoverable (userless) sign-in:
      // the device offers its passkeys and the credential resolves the account.
      const response = await loginWithPasskey(email || undefined);
      if (response.success && response.user) {
        setUser(response.user);
      } else {
        setError(response.error || 'Passkey sign-in failed');
      }
    } catch (err: any) {
      if (err?.name === 'UserCanceled' || err?.message?.includes('cancel')) {
        setError('Passkey sign-in cancelled');
      } else {
        setError(err?.message || 'Passkey sign-in failed');
      }
    } finally {
      setLoading(false);
    }
  }

  if (awaitingCode) {
    return (
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Text style={styles.title}>Check your email</Text>
            <Text style={styles.subtitle}>Enter the 6-digit code we sent to {email}</Text>

            {error ? <Text style={styles.error}>{error}</Text> : null}
            {notice ? <Text style={styles.notice}>{notice}</Text> : null}

            <Input
              label="Verification code"
              placeholder="123456"
              value={code}
              onChangeText={setCode}
              keyboardType="numeric"
            />

            <Button
              title={loading ? 'Verifying...' : 'Verify & Sign In'}
              onPress={handleVerify}
              disabled={loading || code.trim().length < 6}
            />

            <View style={styles.footer}>
              <Text style={styles.footerText}>Didn&apos;t get it?</Text>
              <Text
                style={[styles.link, resendIn > 0 && styles.linkDisabled]}
                onPress={resendIn > 0 ? undefined : handleResend}
              >
                {resendIn > 0 ? `Resend code (${resendIn}s)` : 'Resend code'}
              </Text>
            </View>
            <View style={styles.footer}>
              <Text style={styles.link} onPress={() => { setAwaitingCode(false); setCode(''); }}>
                Back
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Sign in to Settle In Peace</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Input label="Email" placeholder="you@example.com" value={email} onChangeText={setEmail} keyboardType="email-address" />
        <Input label="Password" placeholder="••••••••" value={password} onChangeText={setPassword} secureTextEntry />

        <Button title={loading ? 'Signing in...' : 'Sign In'} onPress={handleLogin} disabled={loading || !email || !password} />

        {isPasskeySupported() && (
          <>
            <View style={styles.dividerRow}>
              <View style={styles.divider} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.divider} />
            </View>
            <Button
              title="Sign in with Face ID / Passkey"
              onPress={handlePasskey}
              disabled={loading}
            />
          </>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>Don&apos;t have an account?</Text>
          <Text style={styles.link} onPress={() => navigation.navigate('Register')}>
            Create one
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colors.background,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 24,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textMuted,
    marginBottom: 24,
  },
  error: {
    color: colors.danger,
    marginBottom: 12,
    fontSize: 14,
  },
  notice: {
    color: colors.primary,
    marginBottom: 12,
    fontSize: 14,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
    gap: 10,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  footer: {
    marginTop: 20,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
  },
  footerText: {
    color: colors.textMuted,
  },
  link: {
    color: colors.primary,
    fontWeight: '700',
  },
  linkDisabled: {
    opacity: 0.5,
  },
});
