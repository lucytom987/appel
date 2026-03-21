import React, { useState, useRef } from 'react';
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
  ScrollView,
} from 'react-native';
import { useAuth } from '../context/AuthContext';

export default function RegisterScreen({ navigation }) {
  const { register, loading } = useAuth();
  const [ime, setIme] = useState('');
  const [prezime, setPrezime] = useState('');
  const [email, setEmail] = useState('');
  const [nazivFirme, setNazivFirme] = useState('');
  const [lozinka, setLozinka] = useState('');
  const [potvrdaLozinke, setPotvrdaLozinke] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const scrollRef = useRef(null);

  const scrollToInput = (y) => {
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 150), animated: true });
  };

  const handleRegister = async () => {
    if (!ime || !prezime || !email || !nazivFirme || !lozinka || !potvrdaLozinke) {
      Alert.alert('Greška', 'Molimo popunite sva polja');
      return;
    }

    if (lozinka.length < 6) {
      Alert.alert('Greška', 'Lozinka mora imati najmanje 6 znakova');
      return;
    }

    if (lozinka !== potvrdaLozinke) {
      Alert.alert('Greška', 'Lozinke se ne podudaraju');
      return;
    }

    const result = await register({ ime, prezime, email, lozinka, nazivFirme });

    if (!result.success) {
      Alert.alert('Greška pri registraciji', result.message);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.formContainer}>
          <View style={styles.header}>
            <Text style={styles.title}>Registracija</Text>
            <Text style={styles.subtitle}>Kreirajte svoj račun i firmu</Text>
          </View>

          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="Ime"
              placeholderTextColor="#999"
              value={ime}
              onChangeText={setIme}
              editable={!loading}
            />

            <TextInput
              style={styles.input}
              placeholder="Prezime"
              placeholderTextColor="#999"
              value={prezime}
              onChangeText={setPrezime}
              editable={!loading}
            />

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
              placeholder="Naziv firme"
              placeholderTextColor="#999"
              value={nazivFirme}
              onChangeText={setNazivFirme}
              editable={!loading}
              onFocus={(e) => e.target.measure((x, y, w, h, px, py) => scrollToInput(py))}
            />

            <View 
              style={styles.passwordContainer}
              onLayout={() => {}}
            >
              <TextInput
                style={styles.passwordInput}
                placeholder="Lozinka (min. 6 znakova)"
                placeholderTextColor="#999"
                value={lozinka}
                onChangeText={setLozinka}
                secureTextEntry={!showPassword}
                editable={!loading}
                onFocus={(e) => e.target.measure((x, y, w, h, px, py) => scrollToInput(py))}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword(!showPassword)}
              >
                <Text style={styles.eyeIcon}>{showPassword ? '👁️' : '👁️‍🗨️'}</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Potvrda lozinke"
              placeholderTextColor="#999"
              value={potvrdaLozinke}
              onChangeText={setPotvrdaLozinke}
              secureTextEntry={!showPassword}
              editable={!loading}
              onFocus={(e) => e.target.measure((x, y, w, h, px, py) => scrollToInput(py))}
            />

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleRegister}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Registriraj se</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.loginLink}
              onPress={() => navigation.navigate('Login')}
              disabled={loading}
            >
              <Text style={styles.loginLinkText}>
                Već imate račun? <Text style={styles.loginLinkBold}>Prijavite se</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1976D2',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  formContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 30,
    paddingVertical: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#E3F2FD',
  },
  form: {
    width: '100%',
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    fontSize: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  passwordInput: {
    flex: 1,
    padding: 15,
    fontSize: 16,
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
  loginLink: {
    alignItems: 'center',
    marginTop: 20,
  },
  loginLinkText: {
    color: '#E3F2FD',
    fontSize: 15,
  },
  loginLinkBold: {
    fontWeight: 'bold',
    color: '#fff',
    textDecorationLine: 'underline',
  },
});
