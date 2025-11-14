import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usersAPI } from '../services/api';
import { userDB } from '../database/db';

const AddUserScreen = ({ navigation }) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    ime: '',
    prezime: '',
    email: '',
    lozinka: '',
    telefon: '',
    uloga: 'serviser',
  });

  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);

  const validateForm = () => {
    const newErrors = {};

    if (!formData.ime.trim()) newErrors.ime = 'Ime je obavezno';
    if (!formData.prezime.trim()) newErrors.prezime = 'Prezime je obavezno';
    if (!formData.email.trim()) {
      newErrors.email = 'Email je obavezan';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email nije valjan';
    }
    if (!formData.lozinka) {
      newErrors.lozinka = 'Lozinka je obavezna';
    } else if (formData.lozinka.length < 6) {
      newErrors.lozinka = 'Lozinka mora biti najmanje 6 znakova';
    }
    if (!['serviser', 'menadzer', 'admin'].includes(formData.uloga)) {
      newErrors.uloga = 'Nivo pristupa je obavezan';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    try {
      setLoading(true);
      const response = await usersAPI.create(formData);

      // Spremi u lokalnu bazu
      userDB.insert(response.data.user);

      Alert.alert('Uspjeh', `Korisnik ${formData.email} je kreiran`);
      navigation.goBack();
    } catch (error) {
      console.error('❌ Greška pri kreiranju korisnika:', error);
      const message =
        error.response?.data?.message || 'Greška pri kreiranju korisnika';
      Alert.alert('Greška', message);
    } finally {
      setLoading(false);
    }
  };

  const getRoleDescription = (role) => {
    switch (role) {
      case 'serviser':
        return 'Može dodavati i brisati servise i popravke';
      case 'menadzer':
        return 'Može sve kao serviser + editirati bazu podataka i brisati';
      case 'admin':
        return 'Punog pristupa - upravljanje korisnicima, bazom i svim operacijama';
      default:
        return '';
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="#45B7D1" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Dodaj korisnika</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.content}>
          {/* Ime */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>
              Ime <Text style={styles.required}>*</Text>
            </Text>
            <View
              style={[
                styles.inputWrapper,
                errors.ime && styles.inputError,
              ]}
            >
              <Ionicons
                name="person"
                size={20}
                color={errors.ime ? '#FF6B6B' : '#999'}
              />
              <TextInput
                style={styles.input}
                placeholder="Unesite ime"
                value={formData.ime}
                onChangeText={(text) =>
                  setFormData({ ...formData, ime: text })
                }
                editable={!loading}
              />
            </View>
            {errors.ime && <Text style={styles.errorText}>{errors.ime}</Text>}
          </View>

          {/* Prezime */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>
              Prezime <Text style={styles.required}>*</Text>
            </Text>
            <View
              style={[
                styles.inputWrapper,
                errors.prezime && styles.inputError,
              ]}
            >
              <Ionicons
                name="person"
                size={20}
                color={errors.prezime ? '#FF6B6B' : '#999'}
              />
              <TextInput
                style={styles.input}
                placeholder="Unesite prezime"
                value={formData.prezime}
                onChangeText={(text) =>
                  setFormData({ ...formData, prezime: text })
                }
                editable={!loading}
              />
            </View>
            {errors.prezime && (
              <Text style={styles.errorText}>{errors.prezime}</Text>
            )}
          </View>

          {/* Email */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>
              Email <Text style={styles.required}>*</Text>
            </Text>
            <View
              style={[
                styles.inputWrapper,
                errors.email && styles.inputError,
              ]}
            >
              <Ionicons
                name="mail"
                size={20}
                color={errors.email ? '#FF6B6B' : '#999'}
              />
              <TextInput
                style={styles.input}
                placeholder="unesite@email.com"
                value={formData.email}
                onChangeText={(text) =>
                  setFormData({ ...formData, email: text.toLowerCase() })
                }
                keyboardType="email-address"
                autoCapitalize="none"
                editable={!loading}
              />
            </View>
            {errors.email && (
              <Text style={styles.errorText}>{errors.email}</Text>
            )}
          </View>

          {/* Lozinka */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>
              Lozinka <Text style={styles.required}>*</Text>
            </Text>
            <View
              style={[
                styles.inputWrapper,
                errors.lozinka && styles.inputError,
              ]}
            >
              <Ionicons
                name="lock-closed"
                size={20}
                color={errors.lozinka ? '#FF6B6B' : '#999'}
              />
              <TextInput
                style={styles.input}
                placeholder="Najmanje 6 znakova"
                value={formData.lozinka}
                onChangeText={(text) =>
                  setFormData({ ...formData, lozinka: text })
                }
                secureTextEntry={!showPassword}
                editable={!loading}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
              >
                <Ionicons
                  name={showPassword ? 'eye' : 'eye-off'}
                  size={20}
                  color="#999"
                />
              </TouchableOpacity>
            </View>
            {errors.lozinka && (
              <Text style={styles.errorText}>{errors.lozinka}</Text>
            )}
          </View>

          {/* Telefonski broj */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Telefonski broj</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="call" size={20} color="#999" />
              <TextInput
                style={styles.input}
                placeholder="+385 1 2345 6789"
                value={formData.telefon}
                onChangeText={(text) =>
                  setFormData({ ...formData, telefon: text })
                }
                keyboardType="phone-pad"
                editable={!loading}
              />
            </View>
          </View>

          {/* Nivo pristupa (uloga) */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>
              Nivo pristupa <Text style={styles.required}>*</Text>
            </Text>
            <View style={styles.roleContainer}>
              {['serviser', 'menadzer', 'admin'].map((role) => (
                <TouchableOpacity
                  key={role}
                  style={[
                    styles.roleCard,
                    formData.uloga === role && styles.roleCardActive,
                  ]}
                  onPress={() => setFormData({ ...formData, uloga: role })}
                  disabled={loading}
                >
                  <View
                    style={[
                      styles.roleIcon,
                      {
                        backgroundColor:
                          role === 'serviser'
                            ? '#45B7D1'
                            : role === 'menadzer'
                            ? '#4ECDC4'
                            : '#FF6B6B',
                      },
                    ]}
                  >
                    <Ionicons
                      name={
                        role === 'serviser'
                          ? 'hammer'
                          : role === 'menadzer'
                          ? 'briefcase'
                          : 'shield'
                      }
                      size={24}
                      color="#FFF"
                    />
                  </View>
                  <Text style={styles.roleName}>
                    {role.charAt(0).toUpperCase() + role.slice(1)}
                  </Text>
                  <Text style={styles.roleDescription}>
                    {getRoleDescription(role)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {errors.uloga && (
              <Text style={styles.errorText}>{errors.uloga}</Text>
            )}
          </View>

          {/* Informativni tekst */}
          <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={20} color="#45B7D1" />
            <Text style={styles.infoText}>
              Korisnici će moći mijenjati svoju lozinku nakon prve prijave
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Dugmadi */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.button, styles.cancelButton]}
          onPress={() => navigation.goBack()}
          disabled={loading}
        >
          <Text style={styles.cancelButtonText}>Otkaži</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.submitButton]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Ionicons name="add-circle" size={20} color="#FFF" />
              <Text style={styles.submitButtonText}>Kreiraj korisnika</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  content: {
    padding: 16,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  required: {
    color: '#FF6B6B',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inputError: {
    borderColor: '#FF6B6B',
  },
  input: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
    color: '#333',
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 12,
    marginTop: 6,
  },
  roleContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  roleCard: {
    flex: 1,
    minWidth: '48%',
    backgroundColor: '#FFF',
    borderWidth: 2,
    borderColor: '#DDD',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  roleCardActive: {
    borderColor: '#45B7D1',
    backgroundColor: '#E8F4F8',
  },
  roleIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  roleName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  roleDescription: {
    fontSize: 11,
    color: '#666',
    textAlign: 'center',
    lineHeight: 16,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#E8F4F8',
    borderRadius: 8,
    padding: 12,
    gap: 10,
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#45B7D1',
    lineHeight: 18,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#EEE',
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  cancelButton: {
    backgroundColor: '#EEE',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  submitButton: {
    backgroundColor: '#45B7D1',
  },
  submitButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
  },
});

export default AddUserScreen;
