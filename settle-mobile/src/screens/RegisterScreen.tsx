import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../navigation/AppNavigator';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { register, verifyEmailOtp, resendEmailOtp, User } from '../services/auth';
import { enrollPasskey, isPasskeySupported } from '../services/passkey';
import { colors } from '../theme/colors';

type RegisterScreenProps = NativeStackScreenProps<AuthStackParamList, 'Register'> & {
  setUser: (user: User | null) => void;
};

export default function RegisterScreen({ navigation, setUser }: RegisterScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // Register returns requiresVerification — no tokens until the emailed
  // code is confirmed. pendingPasskey remembers whether to enroll a
  // passkey right after verification succeeds.
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [code, setCode] = useState('');
  const [pendingPasskey, setPendingPasskey] = useState(false);
  const [notice, setNotice] = useState('');
  // Resend cooldown — each tap fires a real email, so pace it.
  const RESEND_COOLDOWN_S = 45;
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  async function handleRegister(wantPasskey: boolean) {
    setError('');
    setLoading(true);
    try {
      const response = await register({ email, password, name, phone });
      if (response.success) {
        setPendingPasskey(wantPasskey);
        setAwaitingCode(true);
        setResendIn(RESEND_COOLDOWN_S); // a code was already sent by register
        setNotice(`We sent a verification code to ${email}.`);
      } else {
        setError(response.error || 'Registration failed');
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Could not create account');
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
        if (pendingPasskey) {
          try {
            await enrollPasskey();
          } catch {
            // Non-fatal — the account is verified; a passkey can be
            // added later from sign-in. Surface nothing blocking.
            setNotice('Signed in — passkey setup was skipped.');
          }
        }
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
              title={loading ? 'Verifying...' : pendingPasskey ? 'Verify & Create Passkey' : 'Verify & Sign In'}
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
        <Text style={styles.title}>Create account</Text>
        <Text style={styles.subtitle}>Start settling your debts with confidence</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}

        <Input label="Full name" placeholder="Jane Doe" value={name} onChangeText={setName} />
        <Input label="Email" placeholder="you@example.com" value={email} onChangeText={setEmail} keyboardType="email-address" />
        <Input label="Phone (optional)" placeholder="(555) 123-4567" value={phone} onChangeText={setPhone} />
        <Input label="Password" placeholder="8+ chars, upper, lower, number, symbol" value={password} onChangeText={setPassword} secureTextEntry />

        <Button title={loading ? 'Creating...' : 'Create Account'} onPress={() => handleRegister(false)} disabled={loading || !email || !password || !name} />

        {isPasskeySupported() && (
          <>
            <View style={styles.dividerRow}>
              <View style={styles.divider} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.divider} />
            </View>
            <Button
              title="Create Account with Passkey"
              onPress={() => handleRegister(true)}
              disabled={loading || !email || !password || !name}
            />
            <Text style={styles.passkeyHint}>
              After email verification, Face ID sets up a passkey so you can sign in without a password.
            </Text>
          </>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account?</Text>
          <Text style={styles.link} onPress={() => navigation.navigate('Login')}>
            Sign in
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
  passkeyHint: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
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
