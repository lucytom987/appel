import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import ms from '../utils/scale';

const APP_VERSION = Constants?.expoConfig?.version || '2.0.14';

export default function LoginScreen({ navigation }) {
  const { login, loading, setUser } = useAuth();
  const [email, setEmail] = useState('');
  const [lozinka, setLozinka] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    if (!email || !lozinka) {
      Alert.alert('GreÃ…Â¡ka', 'Molimo unesite email i lozinku');
      return;
    }

    const result = await login(email, lozinka);
    
    if (!result.success) {
      Alert.alert('GreÃ…Â¡ka pri prijavi', result.message);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboardWrap}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : ms(2)}
      >
      <View style={styles.formContainer}>
        {/* Logo/Header */}
        <View style={styles.header}>
          <Image 
            source={require('../../assets/login-banner.png')} 
            style={styles.bannerImage}
            resizeMode="contain"
          />
        </View>

        {/* Login Form */}
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#999"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            editable={!loading}
          />

          <View style={styles.passwordContainer}>
            <TextInput
              style={styles.passwordInput}
              placeholder="Lozinka"
              placeholderTextColor="#999"
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
            >
              <Text style={styles.eyeIcon}>{showPassword ? 'Ã°Å¸â€˜ÂÃ¯Â¸Â' : 'Ã°Å¸â€˜ÂÃ¯Â¸ÂÃ¢â‚¬ÂÃ°Å¸â€”Â¨Ã¯Â¸Â'}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Prijavi se</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.registerLink}
            onPress={() => navigation.navigate('Register')}
            disabled={loading}
          >
            <Text style={styles.registerLinkText}>
              Nemate raÃ„Âun? <Text style={styles.registerLinkBold}>Registrirajte se</Text>
            </Text>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <Text style={styles.footer}>
          APPEL v{APP_VERSION} Ã¢â‚¬Â¢ Offline-first
        </Text>
      </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1976D2',
  },
  keyboardWrap: {
    flex: 1,
  },
  formContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  bannerImage: {
    width: '100%',
    height: 120,
  },
  form: {
    width: '100%',
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    fontSize: 16,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  passwordInput: {
    flex: 1,
    padding: 15,
    fontSize: 16,
    fontFamily: Platform.select({ android: 'monospace', ios: 'Courier' }),
  },
  eyeButton: {
    padding: 15,
  },
  eyeIcon: {
    fontSize: 20,
  },
  button: {
    backgroundColor: '#1565C0',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonDisabled: {
    backgroundColor: '#90CAF9',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  footer: {
    textAlign: 'center',
    color: '#E3F2FD',
    marginTop: 40,
    fontSize: 12,
  },
  registerLink: {
    alignItems: 'center',
    marginTop: 20,
  },
  registerLinkText: {
    color: '#E3F2FD',
    fontSize: 15,
  },
  registerLinkBold: {
    fontWeight: 'bold',
    color: '#fff',
    textDecorationLine: 'underline',
  },
});
