import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  ImageBackground,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import Constants from 'expo-constants';
import ms from '../utils/scale';

const APP_VERSION = Constants?.expoConfig?.version || '2.0.17';

export default function LoginScreen() {
  const { login, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [lozinka, setLozinka] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    if (!email || !lozinka) {
      Alert.alert('Greska', 'Molimo unesite email i lozinku');
      return;
    }

    const result = await login(email, lozinka);
    
    if (!result.success) {
      Alert.alert('Greska pri prijavi', result.message);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ImageBackground
        source={require('../../assets/login-bg.png')}
        style={styles.backgroundImage}
        resizeMode="cover"
      >
        <View style={styles.bgOverlay} />

        <KeyboardAvoidingView
          style={styles.keyboardWrap}
          behavior="padding"
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : ms(2)}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.formContainer}>
              <View style={styles.header}>
                <Image
                  source={require('../../assets/logo-login.png')}
                  style={styles.bannerImage}
                  resizeMode="contain"
                />
              </View>

            <View style={styles.card}>
              <Text style={styles.title}>Dobro došli</Text>
              <Text style={styles.subtitle}>Prijavite se za nastavak</Text>

              <View style={styles.inputRow}>
                <Ionicons name="mail-outline" size={20} color="#64748b" />
                <TextInput
                  style={styles.input}
                  placeholder="Email adresa"
                  placeholderTextColor="#94a3b8"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  editable={!loading}
                />
              </View>

              <View style={styles.inputRow}>
                <Ionicons name="lock-closed-outline" size={20} color="#64748b" />
                <TextInput
                  style={styles.input}
                  placeholder="Lozinka"
                  placeholderTextColor="#94a3b8"
                  value={lozinka}
                  onChangeText={setLozinka}
                  secureTextEntry={!showPassword}
                  autoComplete="password"
                  textContentType="password"
                  importantForAutofill="yes"
                  editable={!loading}
                />
                <TouchableOpacity
                  style={styles.eyeButton}
                  onPress={() => setShowPassword(!showPassword)}
                  disabled={loading}
                >
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color="#64748b" />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.forgotLink}
                onPress={() => Alert.alert('Info', 'Za reset lozinke kontaktirajte SuperAdmina platforme.')}
                disabled={loading}
              >
                <Text style={styles.forgotText}>Zaboravili ste lozinku?</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleLogin}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>PRIJAVI SE</Text>
                )}
              </TouchableOpacity>

            </View>

              <Text style={styles.footer}>APPEL v{APP_VERSION}  •  Offline-first</Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </ImageBackground>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020f2b',
  },
  backgroundImage: {
    flex: 1,
  },
  bgOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 15, 43, 0.22)',
  },
  keyboardWrap: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 28,
  },
  formContainer: {
    paddingHorizontal: 36,
  },
  header: {
    alignItems: 'center',
    marginBottom: 18,
  },
  bannerImage: {
    width: '78%',
    height: 130,
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderRadius: 26,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingTop: 22,
    paddingBottom: 18,
    borderWidth: 1.4,
    borderColor: 'rgba(219, 234, 254, 0.95)',
    shadowColor: '#60a5fa',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.24,
    shadowRadius: 24,
    elevation: 8,
  },
  title: {
    textAlign: 'center',
    fontSize: 28,
    fontWeight: '800',
    color: '#0f2151',
    marginBottom: 6,
  },
  subtitle: {
    textAlign: 'center',
    fontSize: 17,
    color: '#5f7196',
    marginBottom: 14,
    fontWeight: '500',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fbff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d7e6ff',
    paddingHorizontal: 12,
    marginBottom: 10,
    minHeight: 56,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#1e3a8a',
    marginLeft: 10,
    paddingVertical: 11,
  },
  eyeButton: {
    paddingVertical: 8,
    paddingLeft: 8,
  },
  forgotLink: {
    alignSelf: 'flex-end',
    paddingVertical: 6,
    marginBottom: 8,
  },
  forgotText: {
    color: '#2563eb',
    fontSize: 14,
    fontWeight: '500',
  },
  button: {
    backgroundColor: '#0d6efd',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 2,
    borderWidth: 1,
    borderColor: '#67a6ff',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  footer: {
    textAlign: 'center',
    color: '#dbeafe',
    marginTop: 16,
    fontSize: 15,
    fontWeight: '500',
  },
});
