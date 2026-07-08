import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Linking,
  Modal,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../context/AuthContext';
import { repairDB, userDB } from '../database/db';
import { repairsAPI, usersAPI } from '../services/api';
import ms from '../utils/scale';
import { applyUserPickerFilter } from '../utils/userPickerFilters';

export default function AddRepairScreen({ navigation, route }) {
  const { elevator } = route.params || {};
  const { user, isOnline, serverAwake } = useAuth();
  const [isOfflineDemo, setIsOfflineDemo] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isTrebaloBi, setIsTrebaloBi] = useState(false);
  const [korisnici, setKorisnici] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showTechnicianModal, setShowTechnicianModal] = useState(false);
  const [currentStep, setCurrentStep] = useState('opis');
  const [didAutoFocusOpis, setDidAutoFocusOpis] = useState(false);
  const [didAutoFocusKontakt, setDidAutoFocusKontakt] = useState(false);
  const [callPrompt, setCallPrompt] = useState({
    visible: false,
    name: '',
    phone: '',
    hasPhone: false,
  });

  // Konvertiraj isOnline u boolean i čekaj da se backend probudi
  const online = Boolean(isOnline && serverAwake);

  // Detektiraj offline demo token da omogući lokalni unos
  React.useEffect(() => {
    (async () => {
      const token = await SecureStore.getItemAsync('userToken');
      setIsOfflineDemo(Boolean(token && token.startsWith('offline_token_')));
    })();
  }, []);

  const [selectedElevator] = useState(() => elevator || null);

  const [formData, setFormData] = useState({
    reportedDate: new Date(),
    opis: '',
    primioPoziv: '',
    pozivatelj: '',
    pozivateljTelefon: '',
    poslanMajstorId: null,
  });
  const opisInputRef = useRef(null);
  const callerInputRef = useRef(null);

  // Prefill reporter/contact from logged-in user for convenience
  const defaultReporter = React.useMemo(() => {
    if (!user) return { name: '', phone: '' };
    const name = `${user.ime || user.firstName || ''} ${user.prezime || user.lastName || ''}`.trim() || user.name || user.fullName || '';
    const phone = user.telefon || user.phone || '';
    return { name, phone };
  }, [user]);

  React.useEffect(() => {
    if (!defaultReporter.name && !defaultReporter.phone) return;
    setFormData((prev) => ({
      ...prev,
      primioPoziv: prev.primioPoziv || defaultReporter.name,
      pozivateljTelefon: prev.pozivateljTelefon || '',
    }));
  }, [defaultReporter.name, defaultReporter.phone]);

  React.useEffect(() => {
    setCurrentStep('opis');
    setDidAutoFocusOpis(false);
    setDidAutoFocusKontakt(false);
  }, [isTrebaloBi]);

  const focusInput = React.useCallback((inputRef) => {
    const target = inputRef?.current;
    if (!target) return;

    requestAnimationFrame(() => {
      setTimeout(() => {
        target.focus?.();
      }, 60);
    });
  }, []);

  // Kada se odabere "Trebalo bi", auto-popuni tko prijavljuje
  React.useEffect(() => {
    if (!isTrebaloBi) return;
    if (!defaultReporter.name) return;
    setFormData((prev) => ({
      ...prev,
      pozivatelj: prev.pozivatelj || defaultReporter.name,
      primioPoziv: prev.primioPoziv || defaultReporter.name,
    }));
  }, [isTrebaloBi, defaultReporter.name]);

  React.useEffect(() => {
    const fetchUsers = async () => {
      setLoadingUsers(true);
      const currentUserId = user?._id || user?.id;
      const filterAssignableUsers = (arr = []) => {
        const filtered = applyUserPickerFilter(arr, {
          currentUserId: null,
          technicianOnly: true,
          requireActiveAccount: true,
        });

        if (!currentUserId) return filtered;

        const hasCurrentUser = filtered.some((u) => String(u?._id || u?.id) === String(currentUserId));
        if (hasCurrentUser) return filtered;

        const meFromList = (Array.isArray(arr) ? arr : []).find((u) => String(u?._id || u?.id) === String(currentUserId));
        if (meFromList) return [meFromList, ...filtered];

        if (user) {
          const me = {
            _id: currentUserId,
            id: currentUserId,
            ime: user.ime || user.firstName || '',
            prezime: user.prezime || user.lastName || '',
            email: user.email || '',
            telefon: user.telefon || user.phone || '',
            uloga: user.uloga || user.role || 'serviser',
            aktivan: true,
          };
          return [me, ...filtered];
        }

        return filtered;
      };

      const filterOutCurrent = (arr = []) => filterAssignableUsers(arr);

      try {
        if (online) {
          const res = await usersAPI.getLite();
          const data = res.data?.data || res.data || [];
          const filtered = filterOutCurrent(data);
          try {
            userDB.bulkInsert(filtered);
          } catch (err) {
            console.log('Cache users failed', err?.message);
          }
          setKorisnici(filtered);
        } else {
          setKorisnici(filterOutCurrent(userDB.getAll()));
        }
      } catch (e) {
        console.log('Load users failed', e?.message);
        setKorisnici(filterOutCurrent(userDB.getAll()));
      } finally {
        setLoadingUsers(false);
      }
    };

    fetchUsers();
  }, [online, user]);

  if (!selectedElevator) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="#1f2937" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Novi popravak</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={{ padding:20 }}>
          <Text style={{ fontSize:16, color:'#6b7280' }}>Nema učitanih dizala. Sinkronizirajte podatke i pokušajte ponovno.</Text>
        </View>
      </View>
    );
  }

  const handleSubmit = async () => {
    if (loading) return;

    if (!selectedElevator) {
      Alert.alert('Greška', 'Odaberite dizalo');
      return;
    }

    if (!formData.opis.trim()) {
      Alert.alert('Greška', 'Molim unesite opis kvara');
      return;
    }

    if (!online && !isOfflineDemo) {
      Alert.alert('Offline', 'Za slanje prijave potreban je internet.');
      return;
    }

    const result = await persistRepair({
      assignedTechnicianId: formData.poslanMajstorId,
      showSuccessAlert: true,
      navigateAfterSave: true,
    });

    return result;
  };

  const persistRepair = async ({ assignedTechnicianId, showSuccessAlert = true, navigateAfterSave = true }) => {
    const normalizedAssignedId = assignedTechnicianId || null;
    const assignedTechnician = korisnici.find((k) => String(k._id || k.id) === String(normalizedAssignedId || '')) || null;

    setLoading(true);

    try {
      const receiverName = formData.primioPoziv?.trim() || defaultReporter.name;
      const reporterName = formData.pozivatelj?.trim() || '';
      const reporterPhone = formData.pozivateljTelefon?.trim() || '';
      const assignedTechnicianName = assignedTechnician
        ? `${assignedTechnician.ime || ''} ${assignedTechnician.prezime || ''}`.trim() || assignedTechnician.email || ''
        : '';
      const serviserId = user?._id || user?.id;
      const repairData = {
        elevatorId: selectedElevator._id || selectedElevator.id,
        serviserID: serviserId,
        datumPrijave: (formData.reportedDate || new Date()).toISOString(),
        datumPopravka: null,
        opisKvara: formData.opis,
        opisPopravka: '',
        status: 'pending',
        radniNalogPotpisan: false,
        popravkaUPotpunosti: false,
        napomene: '',
        pozivatelj: reporterName,
        prijavio: reporterName,
        kontaktTelefon: reporterPhone,
        primioPoziv: receiverName,
        poslanMajstorId: normalizedAssignedId,
        poslanMajstorIme: assignedTechnicianName,
        poslanMajstorAt: normalizedAssignedId ? new Date().toISOString() : null,
        trebaloBi: isTrebaloBi,
      };

      // Provjeri je li offline korisnik (demo korisnik)
      const token = await SecureStore.getItemAsync('userToken');
      const isOfflineUser = token && token.startsWith('offline_token_');

      if (isOfflineUser || !online) {
        // Offline korisnik - spremi samo lokalno
        console.log('📱 Demo/offline korisnik - dodajem popravak lokalno bez API poziva');
        repairDB.insert({
          id: 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
          ...repairData,
          synced: 0, // Bit će syncirano kada se prijavi s pravim korisnicima
        });

        if (showSuccessAlert) {
          Alert.alert('Prijavljeno', 'Prijava kvara je spremljena lokalno', [
            { text: 'OK', onPress: () => navigateAfterSave && navigation.navigate('Repairs') }
          ]);
        } else if (navigateAfterSave) {
          navigation.navigate('Repairs');
        }

        return { success: true, assignedTechnician };
      } else {
        // Online s pravim korisničkim tokenom - spremi na backend
        try {
          const response = await repairsAPI.create(repairData);

          // Spremi u lokalnu bazu (osiguraj "trebalo bi" flag i offline kompatibilnost)
          const created = response.data?.data || response.data || {};
          repairDB.insert({
            id: created._id || created.id,
            ...created,
            trebaloBi: typeof created.trebaloBi === 'boolean' ? created.trebaloBi : isTrebaloBi,
            synced: true,
          });

          if (showSuccessAlert) {
            Alert.alert('Prijavljeno', 'Prijava kvara je uspješno poslana', [
              { text: 'OK', onPress: () => navigateAfterSave && navigation.navigate('Repairs') }
            ]);
          } else if (navigateAfterSave) {
            navigation.navigate('Repairs');
          }

          return { success: true, assignedTechnician };
        } catch (error) {
          console.error('Greška pri slanju na backend:', error);
          if (error.response?.status === 401) {
            throw new Error('Vaša prijava je istekla. Molim prijavite se ponovno.');
          }
          // Fallback na lokalnu bazu
          console.log('⚠️ Backend greška - fallback na lokalnu bazu');
          repairDB.insert({
            id: 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            ...repairData,
            synced: 0,
          });

          if (showSuccessAlert) {
            Alert.alert('Prijavljeno', 'Kvar je spremljen lokalno (sync kad budete online)', [
              { text: 'OK', onPress: () => navigateAfterSave && navigation.navigate('Repairs') }
            ]);
          } else if (navigateAfterSave) {
            navigation.navigate('Repairs');
          }

          return { success: true, assignedTechnician };
        }
      }

    } catch (error) {
      console.error('Greška pri logranju popravka:', error);
      Alert.alert('Greška', error.message || error.response?.data?.message || 'Nije moguće logirati popravak');
      return { success: false, assignedTechnician: null };
    } finally {
      setLoading(false);
    }
  };

  const handleAssignedTechnicianSelection = async (technicianId, selectedTechnician) => {
    const nextId = technicianId || null;
    const alreadySelected = String(formData.poslanMajstorId || '') === String(nextId || '');
    const currentUserId = user?._id || user?.id;
    const selectedSelf = Boolean(nextId) && String(nextId) === String(currentUserId || '');

    setFormData((prev) => ({ ...prev, poslanMajstorId: alreadySelected ? null : nextId }));
    setShowTechnicianModal(false);

    if (alreadySelected) return;
    if (!nextId) return;

    if (!selectedElevator) return;

    if (!formData.opis.trim()) {
      Alert.alert('Odabran majstor', 'Majstor je odabran. Za automatsko spremanje prvo unesite opis kvara.');
      return;
    }

    if (!online && !isOfflineDemo) {
      Alert.alert('Offline', 'Za automatsko spremanje i poziv majstora potreban je internet.');
      return;
    }

    const result = await persistRepair({
      assignedTechnicianId: nextId,
      showSuccessAlert: false,
      navigateAfterSave: false,
    });

    if (!result?.success) return;

    if (selectedSelf) {
      navigation.navigate('Repairs');
      return;
    }

    const name = selectedTechnician
      ? `${selectedTechnician.ime || ''} ${selectedTechnician.prezime || ''}`.trim() || selectedTechnician.email || 'odabrani majstor'
      : 'odabrani majstor';
    const rawPhone = selectedTechnician?.telefon || selectedTechnician?.phone || selectedTechnician?.mobitel || '';
    const normalizedPhone = String(rawPhone || '').trim().replace(/\s+/g, '');

    setCallPrompt({
      visible: true,
      name,
      phone: normalizedPhone,
      hasPhone: Boolean(normalizedPhone),
    });
  };

  const closeCallPrompt = () => {
    setCallPrompt({ visible: false, name: '', phone: '', hasPhone: false });
  };

  const openTechnicianModal = () => {
    setShowTechnicianModal(true);
  };

  const selectedTechnicianLabel = formData.poslanMajstorId
    ? (() => {
        const found = korisnici.find((k) => String(k._id || k.id) === String(formData.poslanMajstorId));
        return found ? `${found.ime || ''} ${found.prezime || ''}`.trim() || found.email || 'Majstor odabran' : 'Majstor odabran';
      })()
    : 'Odaberi majstora (opcionalno)';

  const handleContinueFromOpis = () => {
    if (!formData.opis.trim()) {
      Alert.alert('Opis je obavezan', 'Prvo unesite opis kvara.');
      return;
    }
    setDidAutoFocusKontakt(false);
    setCurrentStep('kontakt');
  };

  const handleContinueFromKontakt = () => {
    if (!formData.opis.trim()) {
      setCurrentStep('opis');
      Alert.alert('Opis je obavezan', 'Prvo unesite opis kvara.');
      return;
    }
    if (!formData.pozivatelj.trim()) {
      Alert.alert('Pozivatelj je obavezan', 'Unesite ime pozivatelja prije dodjele majstora.');
      return;
    }
    Keyboard.dismiss();
    setCurrentStep('majstor');
  };

  const handleCallPromptSaveOnly = () => {
    closeCallPrompt();
    navigation.navigate('Repairs');
  };

  const handleCallPromptCall = async () => {
    if (!callPrompt.phone) return;

    try {
      await Linking.openURL(`tel:${callPrompt.phone}`);
    } catch (e) {
      Alert.alert('Poziv nije uspio', 'Nije moguće pokrenuti telefonski poziv na ovom uređaju.');
    } finally {
      closeCallPrompt();
      navigation.navigate('Repairs');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#1f2937" />
        </TouchableOpacity>
          <Text style={styles.headerTitle}>{isTrebaloBi ? 'Nova stavka "Trebalo bi"' : 'Novi hitni popravak'}</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : ms(2)}
      >
        <ScrollView
          style={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          contentContainerStyle={styles.contentContainer}
        >
        {/* Vrsta prijave: popravak ili "trebalo bi" */}
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.typeToggle, !isTrebaloBi && styles.typeToggleActive]}
            onPress={() => setIsTrebaloBi(false)}
            activeOpacity={0.8}
          >
            <Text style={[styles.typeToggleText, !isTrebaloBi && styles.typeToggleTextActive]}>
              Popravak
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.typeToggle, isTrebaloBi && styles.typeToggleActiveAlt]}
            onPress={() => setIsTrebaloBi(true)}
            activeOpacity={0.8}
          >
            <Text style={[styles.typeToggleText, isTrebaloBi && styles.typeToggleTextActiveAlt]}>
              Trebalo bi
            </Text>
          </TouchableOpacity>
        </View>

        {/* Offline warning */}
        {!online && !isOfflineDemo && (
          <View style={styles.offlineWarning}>
            <Ionicons name="warning" size={20} color="#ef4444" />
            <Text style={styles.offlineText}>
              Za logiranje popravaka morate biti online
            </Text>
          </View>
        )}

        <View style={styles.stepIndicatorWrap}>
          <View style={[styles.stepIndicatorItem, currentStep === 'opis' && styles.stepIndicatorItemActive]}>
            <Text style={[styles.stepIndicatorNumber, currentStep === 'opis' && styles.stepIndicatorNumberActive]}>1</Text>
            <Text style={[styles.stepIndicatorLabel, currentStep === 'opis' && styles.stepIndicatorLabelActive]}>Opis</Text>
          </View>
          <View style={styles.stepIndicatorLine} />
          <View style={[styles.stepIndicatorItem, currentStep === 'kontakt' && styles.stepIndicatorItemActive]}>
            <Text style={[styles.stepIndicatorNumber, currentStep === 'kontakt' && styles.stepIndicatorNumberActive]}>2</Text>
            <Text style={[styles.stepIndicatorLabel, currentStep === 'kontakt' && styles.stepIndicatorLabelActive]}>Pozivatelj</Text>
          </View>
          <View style={styles.stepIndicatorLine} />
          <View style={[styles.stepIndicatorItem, currentStep === 'majstor' && styles.stepIndicatorItemActive]}>
            <Text style={[styles.stepIndicatorNumber, currentStep === 'majstor' && styles.stepIndicatorNumberActive]}>3</Text>
            <Text style={[styles.stepIndicatorLabel, currentStep === 'majstor' && styles.stepIndicatorLabelActive]}>Majstor</Text>
          </View>
        </View>

        {/* Opis kvara */}
        {currentStep === 'opis' && (
        <View
          style={styles.section}
          onLayout={() => {
            if (didAutoFocusOpis) return;
            setDidAutoFocusOpis(true);
            focusInput(opisInputRef);
          }}
        >
          <Text style={styles.stepCaption}>Korak 1 od 3</Text>
          <Text style={styles.label}>{isTrebaloBi ? 'Opis problema *' : 'Opis kvara *'}</Text>
          <TextInput
            ref={opisInputRef}
            style={[styles.input, styles.textArea]}
            value={formData.opis}
            onChangeText={(text) => setFormData(prev => ({ ...prev, opis: text }))}
            placeholder={isTrebaloBi ? 'Što treba napraviti / nabaviti...' : 'Detaljno opišite kvar...'}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            showSoftInputOnFocus
          />
          {isTrebaloBi && !!defaultReporter.name && (
            <Text style={styles.helperText}>
              Prijavljuje: {defaultReporter.name}
            </Text>
          )}

          <TouchableOpacity style={styles.stepButton} onPress={handleContinueFromOpis} activeOpacity={0.85}>
            <Text style={styles.stepButtonText}>Nastavi na pozivatelja</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
        )}

        {/* Pozivatelj */}
        {currentStep === 'kontakt' && (
        <View
          style={styles.section}
          onLayout={() => {
            if (didAutoFocusKontakt) return;
            setDidAutoFocusKontakt(true);
            focusInput(callerInputRef);
          }}
        >
          <Text style={styles.stepCaption}>Korak 2 od 3</Text>
          <Text style={styles.label}>Pozivatelj</Text>
          <TextInput
            ref={callerInputRef}
            style={styles.input}
            value={formData.pozivatelj}
            onChangeText={(text) => setFormData(prev => ({ ...prev, pozivatelj: text }))}
            placeholder="Ime i prezime pozivatelja"
            placeholderTextColor="#9ca3af"
            showSoftInputOnFocus
          />
          <TextInput
            style={[styles.input, { marginTop: 10 }]}
            value={formData.pozivateljTelefon}
            onChangeText={(text) => setFormData(prev => ({ ...prev, pozivateljTelefon: text }))}
            placeholder="Telefon pozivatelja"
            placeholderTextColor="#9ca3af"
            keyboardType="phone-pad"
          />

          <View style={styles.stepActionsRow}>
            <TouchableOpacity
              style={styles.stepSecondaryButton}
              onPress={() => {
                setDidAutoFocusOpis(false);
                setCurrentStep('opis');
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.stepSecondaryButtonText}>Nazad</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.stepButtonCompact} onPress={handleContinueFromKontakt} activeOpacity={0.85}>
              <Text style={styles.stepButtonText}>Dodijeli majstora</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
        )}

        {currentStep === 'majstor' && (
        <View style={styles.section}>
          <Text style={styles.stepCaption}>Korak 3 od 3</Text>
          <Text style={styles.label}>Majstor poslan na kvar</Text>
          <TouchableOpacity style={styles.selectorButton} onPress={openTechnicianModal} activeOpacity={0.85}>
            <Ionicons name="people-outline" size={18} color="#1d4ed8" />
            <Text style={styles.selectorButtonText}>{selectedTechnicianLabel}</Text>
            <Ionicons name="chevron-forward" size={18} color="#1d4ed8" style={{ marginLeft: 'auto' }} />
          </TouchableOpacity>

          <Text style={styles.selectorHint}>
            Nakon odabira majstora prijava se automatski sprema i otvara se pozivni prozor.
          </Text>

          <View style={styles.stepActionsRow}>
            <TouchableOpacity
              style={styles.stepSecondaryButton}
              onPress={() => {
                setDidAutoFocusKontakt(false);
                setCurrentStep('kontakt');
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.stepSecondaryButtonText}>Nazad</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitButtonInline, (loading || (!online && !isOfflineDemo)) && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={loading || (!online && !isOfflineDemo)}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={22} color="#fff" />
                  <Text style={styles.submitButtonText}>{formData.poslanMajstorId ? 'Spremi bez poziva' : (isTrebaloBi ? 'Spremi "trebalo bi"' : 'Logiraj popravak')}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal
        visible={showTechnicianModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTechnicianModal(false)}
      >
        <View style={styles.technicianModalOverlay}>
          <View style={styles.technicianModalCard}>
            <View style={styles.technicianModalHeader}>
              <View>
                <Text style={styles.technicianModalTitle}>Odaberi majstora</Text>
                <Text style={styles.technicianModalSubtitle}>Dodjela je opcionalna. Odabir odmah sprema prijavu.</Text>
              </View>
              <TouchableOpacity onPress={() => setShowTechnicianModal(false)} style={styles.technicianModalClose}>
                <Ionicons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>

            {loadingUsers ? (
              <View style={styles.technicianLoadingWrap}>
                <ActivityIndicator size="small" color="#0ea5e9" />
                <Text style={styles.userRowText}>Učitavanje servisera...</Text>
              </View>
            ) : (
              <ScrollView style={styles.technicianList} contentContainerStyle={styles.technicianListContent} keyboardShouldPersistTaps="handled">
                {korisnici.map((k) => {
                  const id = k._id || k.id;
                  const selected = String(formData.poslanMajstorId || '') === String(id || '');
                  return (
                    <TouchableOpacity
                      key={String(id)}
                      style={[styles.technicianRow, selected && styles.technicianRowSelected]}
                      onPress={() => handleAssignedTechnicianSelection(id, k)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.technicianAvatar}>
                        <Ionicons name={selected ? 'checkmark-circle' : 'person-outline'} size={18} color={selected ? '#16a34a' : '#1d4ed8'} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.technicianName}>{(k.ime || '')} {(k.prezime || '')}</Text>
                        <Text style={styles.technicianMeta}>
                          {String(k._id || k.id) === String(user?._id || user?.id)
                            ? 'Ja (bez poziva)'
                            : (k.telefon || k.email || 'Bez kontakta')}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
                {korisnici.length === 0 && (
                  <Text style={styles.technicianEmptyText}>Nema dostupnih servisera.</Text>
                )}
              </ScrollView>
            )}

            <TouchableOpacity style={styles.technicianSkipButton} onPress={() => setShowTechnicianModal(false)} activeOpacity={0.8}>
              <Text style={styles.technicianSkipButtonText}>Zatvori bez dodjele</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={callPrompt.visible}
        transparent
        animationType="fade"
        onRequestClose={closeCallPrompt}
      >
        <View style={styles.callPromptOverlay}>
          <View style={styles.callPromptCard}>
            <TouchableOpacity style={styles.callPromptClose} onPress={closeCallPrompt}>
              <Ionicons name="close" size={22} color="#64748b" />
            </TouchableOpacity>

            <View style={styles.callPromptIconWrap}>
              <Ionicons name="call" size={28} color="#16a34a" />
            </View>

            <Text style={styles.callPromptTitle}>Prijava spremljena</Text>
            <Text style={styles.callPromptMessage}>
              {callPrompt.hasPhone
                ? `Kvar je spremljen i dodijeljen: ${callPrompt.name}. Želite li odmah nazvati majstora?`
                : `Kvar je spremljen i dodijeljen: ${callPrompt.name}. Broj telefona nije upisan.`}
            </Text>

            {callPrompt.hasPhone ? (
              <TouchableOpacity style={styles.callPromptPrimaryButton} onPress={handleCallPromptCall} activeOpacity={0.85}>
                <Ionicons name="call" size={22} color="#fff" />
                <Text style={styles.callPromptPrimaryButtonText}>Pozovi majstora</Text>
              </TouchableOpacity>
            ) : null}

            <View style={styles.callPromptSecondaryRow}>
              <TouchableOpacity style={styles.callPromptSecondaryButton} onPress={closeCallPrompt} activeOpacity={0.8}>
                <Text style={styles.callPromptSecondaryButtonText}>Natrag</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.callPromptGhostButton} onPress={handleCallPromptSaveOnly} activeOpacity={0.8}>
                <Text style={styles.callPromptGhostButtonText}>Samo spremi</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#fff',
    paddingTop: 50,
    paddingBottom: 15,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 32,
    flexGrow: 1,
  },
  offlineWarning: {
    backgroundColor: '#fef2f2',
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#fecaca',
  },
  offlineText: {
    flex: 1,
    fontSize: 14,
    color: '#ef4444',
  },
  section: {
    backgroundColor: '#fff',
    padding: 20,
    marginTop: 15,
    borderRadius: 24,
    marginHorizontal: 16,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 2,
  },
  stepCaption: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f766e',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 10,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    paddingBottom: 10,
  },
  stepIndicatorWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  stepIndicatorItem: {
    alignItems: 'center',
    gap: 6,
  },
  stepIndicatorItemActive: {
    transform: [{ scale: 1.02 }],
  },
  stepIndicatorNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    textAlign: 'center',
    textAlignVertical: 'center',
    lineHeight: 28,
    backgroundColor: '#e5e7eb',
    color: '#64748b',
    fontWeight: '800',
    fontSize: 13,
  },
  stepIndicatorNumberActive: {
    backgroundColor: '#0f766e',
    color: '#fff',
  },
  stepIndicatorLabel: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '700',
  },
  stepIndicatorLabelActive: {
    color: '#0f172a',
  },
  stepIndicatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#dbe4ea',
    marginHorizontal: 10,
    marginBottom: 18,
  },
  typeToggle: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  typeToggleActive: {
    backgroundColor: '#dcfce7',
    borderColor: '#10b981',
  },
  typeToggleActiveAlt: {
    backgroundColor: '#ffedd5',
    borderColor: '#f59e0b',
  },
  typeToggleText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4b5563',
  },
  typeToggleTextActive: {
    color: '#065f46',
  },
  typeToggleTextActiveAlt: {
    color: '#b45309',
  },
  helperText: {
    marginTop: 8,
    fontSize: 12,
    color: '#6b7280',
  },
  input: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    color: '#1f2937',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  selectorButton: {
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  selectorButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1d4ed8',
  },
  selectorHint: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 18,
    color: '#64748b',
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  userRowText: {
    fontSize: 14,
    color: '#0f172a',
  },
  userRowSelected: {
    backgroundColor: '#f0fdf4',
    borderRadius: 8,
    paddingHorizontal: 6,
  },
  readonlyInput: {
    backgroundColor: '#f3f4f6',
  },
  textArea: {
    minHeight: 100,
    paddingTop: 12,
  },
  stepButton: {
    marginTop: 16,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: '#0f766e',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  stepButtonCompact: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: '#0f766e',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
  },
  stepButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
  },
  stepActionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    alignItems: 'stretch',
  },
  stepSecondaryButton: {
    minWidth: 96,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  stepSecondaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#334155',
  },
  submitButton: {
    backgroundColor: '#b91c1c',
    marginHorizontal: 20,
    marginTop: 20,
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  submitButtonInline: {
    flex: 1,
    backgroundColor: '#b91c1c',
    minHeight: 52,
    paddingHorizontal: 16,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  submitButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  callPromptOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.48)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  callPromptCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 18,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 8,
  },
  callPromptClose: {
    alignSelf: 'flex-end',
    padding: 4,
  },
  callPromptIconWrap: {
    alignSelf: 'center',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    marginBottom: 14,
  },
  callPromptTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 10,
  },
  callPromptMessage: {
    fontSize: 17,
    lineHeight: 24,
    color: '#334155',
    textAlign: 'center',
    marginBottom: 20,
  },
  callPromptPrimaryButton: {
    minHeight: 58,
    borderRadius: 18,
    backgroundColor: '#16a34a',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 18,
    marginBottom: 14,
  },
  callPromptPrimaryButtonText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
  },
  callPromptSecondaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  callPromptSecondaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  callPromptSecondaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#334155',
  },
  callPromptGhostButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eff6ff',
  },
  callPromptGhostButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1d4ed8',
  },
  technicianModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.48)',
    justifyContent: 'flex-end',
  },
  technicianModalCard: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 28,
    maxHeight: '78%',
  },
  technicianModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  technicianModalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
  },
  technicianModalSubtitle: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: '#64748b',
    maxWidth: '90%',
  },
  technicianModalClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  technicianLoadingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 18,
  },
  technicianList: {
    maxHeight: 420,
  },
  technicianListContent: {
    gap: 10,
    paddingBottom: 8,
  },
  technicianRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  technicianRowSelected: {
    backgroundColor: '#f0fdf4',
    borderColor: '#86efac',
  },
  technicianAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  technicianName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  technicianMeta: {
    marginTop: 2,
    fontSize: 13,
    color: '#64748b',
  },
  technicianEmptyText: {
    paddingVertical: 20,
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
  },
  technicianSkipButton: {
    marginTop: 16,
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  technicianSkipButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1d4ed8',
  },
});
