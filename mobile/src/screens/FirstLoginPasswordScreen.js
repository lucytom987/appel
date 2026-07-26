import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';

export default function FirstLoginPasswordScreen() {
  const { completeFirstLogin, loading } = useAuth();
  const [novaLozinka, setNovaLozinka] = useState('');
  const [potvrdaLozinke, setPotvrdaLozinke] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async () => {
    if (!novaLozinka || !potvrdaLozinke) {
      Alert.alert('Greška', 'Unesite novu lozinku i potvrdu lozinke');
      return;
    }

    if (novaLozinka.length < 8) {
      Alert.alert('Greška', 'Lozinka mora imati najmanje 8 znakova');
      return;
    }

    if (novaLozinka !== potvrdaLozinke) {
      Alert.alert('Greška', 'Lozinke se ne podudaraju');
      return;
    }

    const result = await completeFirstLogin(novaLozinka);
    if (!result.success) {
      Alert.alert('Greška', result.message || 'Nije moguće spremiti lozinku');
      return;
    }

    Alert.alert('Uspjeh', result.message || 'Lozinka je uspješno ažurirana');
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.card}>
        <Text style={styles.title}>Prva prijava</Text>
        <Text style={styles.subtitle}>
          Zbog sigurnosti morate postaviti novu lozinku prije nastavka rada.
        </Text>

        <View style={styles.passwordContainer}>
          <TextInput
            style={styles.passwordInput}
            placeholder="Nova lozinka (min. 8 znakova)"
            placeholderTextColor="#9ca3af"
            value={novaLozinka}
            onChangeText={setNovaLozinka}
            secureTextEntry={!showPassword}
            editable={!loading}
          />
          <TouchableOpacity
            style={styles.eyeButton}
            onPress={() => setShowPassword((prev) => !prev)}
            disabled={loading}
          >
            <Text style={styles.eyeText}>{showPassword ? 'Hide' : 'Show'}</Text>
          </TouchableOpacity>
        </View>

        <TextInput
          style={styles.input}
          placeholder="Potvrda nove lozinke"
          placeholderTextColor="#9ca3af"
          value={potvrdaLozinke}
          onChangeText={setPotvrdaLozinke}
          secureTextEntry={!showPassword}
          editable={!loading}
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Spremi novu lozinku</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1976D2',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#475569',
    marginBottom: 16,
    lineHeight: 20,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#dbeafe',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 14,
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#dbeafe',
    borderRadius: 10,
    marginBottom: 14,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
  },
  eyeButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  eyeText: {
    color: '#1d4ed8',
    fontWeight: '600',
  },
  button: {
    backgroundColor: '#1d4ed8',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
