import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import * as SecureStore from 'expo-secure-store';

export default function LoginScreen() {
  const { login, loading, setUser } = useAuth();
  const [email, setEmail] = useState('');
  const [lozinka, setLozinka] = useState('');

  const handleLogin = async () => {
    if (!email || !lozinka) {
      Alert.alert('Greška', 'Molimo unesite email i lozinku');
      return;
    }

    const result = await login(email, lozinka);
    
    if (!result.success) {
      Alert.alert('Greška pri prijavi', result.message);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.formContainer}>
        {/* Logo/Header */}
        <View style={styles.header}>
          <Text style={styles.logo}>APPEL</Text>
          <Text style={styles.subtitle}>Elevator Service Management</Text>
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

          <TextInput
            style={styles.input}
            placeholder="Lozinka"
            placeholderTextColor="#999"
            value={lozinka}
            onChangeText={setLozinka}
            secureTextEntry={true}
            editable={!loading}
          />

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
        </View>

        {/* Footer */}
        <Text style={styles.footer}>
          APPEL v2.0 • Offline-First
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  formContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  header: {
    alignItems: 'center',
    marginBottom: 50,
  },
  logo: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#2563eb',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
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
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonDisabled: {
    backgroundColor: '#94a3b8',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  footer: {
    textAlign: 'center',
    color: '#999',
    marginTop: 40,
    fontSize: 12,
  },
});
