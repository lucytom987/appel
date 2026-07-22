import React, { useMemo, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  BackHandler,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { elevatorDB, serviceDB, userDB } from '../database/db';
import { servicesAPI, usersAPI } from '../services/api';
import ms from '../utils/scale';
import { applyUserPickerFilter } from '../utils/userPickerFilters';

const baseChecklistState = {
  lubrication: false,
  ups_check: false,
  voice_comm: false,
  shaft_cleaning: false,
  drive_check: false,
  brake_check: false,
  cable_inspection: false,
};

const checklistLabels = {
  lubrication: 'Podmazivanje',
  ups_check: 'Provjera UPS-a',
  voice_comm: 'Govorna veza',
  shaft_cleaning: 'Čišćenje šahta',
  drive_check: 'Provjera pog. stroja',
  brake_check: 'Provjera kočnice',
  cable_inspection: 'Inspekcija užeta',
};

export default function EditServiceScreen({ route, navigation }) {
  const { service, onSave } = route.params;
  const { user, isOnline, serverAwake } = useAuth();
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef(null);
  const napomeneInputRef = useRef(null);

  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        navigation.goBack();
        return true;
      };
      const backSub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => {
        backSub.remove();
      };
    }, [navigation, service])
  );

  const freshService = useMemo(() => {
    const id = service?._id || service?.id;
    if (!id) return service || {};
    try {
      const local = serviceDB.getById(id);
      return local ? { ...service, ...local } : service;
    } catch (e) {
      console.log('Load local service failed', e?.message);
      return service;
    }
  }, [service]);

  const elevatorId = typeof freshService.elevatorId === 'object'
    ? (freshService.elevatorId?._id || freshService.elevatorId?.id)
    : freshService.elevatorId;
  const elevator = elevatorDB.getById(elevatorId);

  const parseDate = (val) => {
    if (!val) return null;
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const initialChecklist = useMemo(() => {
    const map = { ...baseChecklistState };
    (freshService.checklist || []).forEach((item) => {
      const key = item?.stavka;
      if (key && key in map) {
        map[key] = item.provjereno === 1 || item.provjera === 1 || item.provjera === true || item.provjereno === true;
      }
    });
    return map;
  }, [freshService.checklist]);

  const initialStatus = useMemo(() => {
    const status = { ups: null, voice: null };
    (freshService.checklist || []).forEach((item) => {
      const key = item?.stavka;
      const note = typeof item?.napomena === 'string' ? item.napomena.trim() : '';
      if (key === 'ups_check' && (note === 'radi' || note === 'ne_radi')) {
        status.ups = note;
      }
      if (key === 'voice_comm' && (note === 'radi' || note === 'ne_radi')) {
        status.voice = note;
      }
    });
    return status;
  }, [freshService.checklist]);

  const [form, setForm] = useState(() => ({
    serviceDate: parseDate(freshService.datum) || new Date(),
    nextServiceDate: parseDate(freshService.sljedeciServis) || new Date(),
    napomene: freshService.napomene || '',
    utroseniMaterijal: freshService.utroseniMaterijal || '',
    kolegaId: Array.isArray(freshService.dodatniServiseri) && freshService.dodatniServiseri.length
      ? (freshService.dodatniServiseri[0]?._id || freshService.dodatniServiseri[0]?.id || freshService.dodatniServiseri[0])
      : null,
  }));

  const [checklistState, setChecklistState] = useState(initialChecklist);
  const [statusState, setStatusState] = useState(initialStatus);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [activeDateField, setActiveDateField] = useState('serviceDate');
  const [korisnici, setKorisnici] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showKolege, setShowKolege] = useState(false);
  const [saving, setSaving] = useState(false);

  const online = Boolean(isOnline && serverAwake);

  React.useEffect(() => {
    const fetchUsers = async () => {
      setLoadingUsers(true);
      const filterOutCurrent = (arr = []) => applyUserPickerFilter(arr, {
        currentUserId: user?._id || user?.id,
        requireActiveAccount: true,
      });
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
          const local = filterOutCurrent(userDB.getAll());
          setKorisnici(local);
        }
      } catch (e) {
        console.log('Load users failed', e?.message);
        const local = filterOutCurrent(userDB.getAll());
        setKorisnici(local);
      } finally {
        setLoadingUsers(false);
      }
    };
    fetchUsers();
  }, [online, user]);

  const handleDateChange = (event, selectedDate, field) => {
    setShowDatePicker(false);
    if (selectedDate) {
      setForm((prev) => ({ ...prev, [field]: selectedDate }));
    }
  };

  const toggleChecklistItem = (key) => {
    if (key === 'ups_check') {
      setStatusState((prev) => {
        const current = prev.ups ?? null;
        const next = current === null
          ? 'radi'
          : current === 'radi'
            ? 'ne_radi'
            : null;
        setChecklistState((prevChecklist) => ({ ...prevChecklist, ups_check: Boolean(next) }));
        return { ...prev, ups: next };
      });
      return;
    }

    if (key === 'voice_comm') {
      setStatusState((prev) => {
        const current = prev.voice ?? null;
        const next = current === null
          ? 'radi'
          : current === 'radi'
            ? 'ne_radi'
            : null;
        setChecklistState((prevChecklist) => ({ ...prevChecklist, voice_comm: Boolean(next) }));
        return { ...prev, voice: next };
      });
      return;
    }

    setChecklistState((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const buildChecklistPayload = () => (
    Object.keys(checklistState).map((key) => ({
      stavka: key,
      provjereno: checklistState[key] ? 1 : 0,
      napomena: key === 'ups_check'
        ? (checklistState[key] ? (statusState.ups || '') : '')
        : key === 'voice_comm'
          ? (checklistState[key] ? (statusState.voice || '') : '')
          : '',
    }))
  );

  const handleSave = async () => {
    const serviceId = freshService._id || freshService.id;
    if (!serviceId) {
      Alert.alert('Greška', 'Nedostaje ID servisa.');
      return;
    }

    setSaving(true);

    const payload = {
      elevatorId,
      serviserID: freshService.serviserID || user?._id,
      datum: form.serviceDate?.toISOString?.() || freshService.datum,
      napomene: form.napomene,
      utroseniMaterijal: form.utroseniMaterijal,
      imaNedostataka: freshService.imaNedostataka || false,
      nedostaci: freshService.nedostaci || [],
      sljedeciServis: form.nextServiceDate?.toISOString?.() || freshService.sljedeciServis,
      dodatniServiseri: form.kolegaId ? [form.kolegaId] : [],
      checklist: buildChecklistPayload(),
    };

    const mergedLocal = {
      ...freshService,
      ...payload,
      id: serviceId,
      synced: 0,
      sync_status: 'dirty',
      updated_at: Date.now(),
    };

    try {
      if (online) {
        const res = await servicesAPI.update(serviceId, payload);
        const updated = res.data?.data || res.data || {};
        serviceDB.update(serviceId, { ...mergedLocal, ...updated, synced: 1, sync_status: 'synced' });
      } else {
        serviceDB.update(serviceId, mergedLocal);
      }

      const updatedLocal = { ...freshService, ...payload };
      onSave?.(updatedLocal);
      Alert.alert('Spremljeno', 'Servis je ažuriran', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      console.log('Update service fallback lokalno', e?.message);
      serviceDB.update(serviceId, mergedLocal);
      const updatedLocal = { ...freshService, ...payload };
      onSave?.(updatedLocal);
      Alert.alert('Spremanje lokalno', 'Promjene su spremljene offline i čekaju sync.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (date) => date ? date.toLocaleDateString('hr-HR') : 'Nije postavljeno';

  const handleNapomeneInputFocus = () => {
    // Scrollaj do napomena polja kada se fokusira
    setTimeout(() => {
      napomeneInputRef.current?.measureLayout?.(
        scrollViewRef.current,
        (x, y) => {
          scrollViewRef.current?.scrollTo({ y: y - 100, animated: true });
        },
        () => {}
      );
    }, 100);
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#1f2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Uredi servis</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'ios' ? (insets.top + 60) : ms(2)}
      >
        <ScrollView
          ref={scrollViewRef}
          style={styles.content}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: Math.max((insets?.bottom || 0) + 120, 160) }}
        >
          {elevator && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Dizalo</Text>
              <Text style={styles.elevatorTitle}>{elevator.nazivStranke || ''}</Text>
              <Text style={styles.elevatorSubtitle}>{elevator.ulica || ''}{elevator.mjesto ? `, ${elevator.mjesto}` : ''}</Text>
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Datumi</Text>

            <TouchableOpacity style={styles.row} onPress={() => { setActiveDateField('serviceDate'); setShowDatePicker(true); }}>
              <Text style={styles.label}>Datum servisa</Text>
              <Text style={styles.value}>{formatDate(form.serviceDate)}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.row} onPress={() => { setActiveDateField('nextServiceDate'); setShowDatePicker(true); }}>
              <Text style={styles.label}>Sljedeći servis</Text>
              <Text style={styles.value}>{formatDate(form.nextServiceDate)}</Text>
            </TouchableOpacity>

            {showDatePicker && (
              <DateTimePicker
                value={form[activeDateField] || new Date()}
                mode="date"
                display="default"
                onChange={(e, d) => handleDateChange(e, d, activeDateField)}
              />
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Kolega (opcionalno)</Text>
            <TouchableOpacity style={styles.kolegaToggle} onPress={() => setShowKolege((v) => !v)}>
              <Ionicons name={showKolege ? 'chevron-up' : 'chevron-down'} size={18} color="#0f172a" />
              <Text style={styles.kolegaToggleText}>
                {form.kolegaId
                  ? (() => {
                      const found = korisnici.find((k) => (k._id || k.id) === form.kolegaId);
                      return found ? `${found.ime || ''} ${found.prezime || ''}`.trim() || 'Kolega odabran' : 'Kolega odabran';
                    })()
                  : 'Dodaj kolegu'}
              </Text>
            </TouchableOpacity>

            {showKolege && (
              loadingUsers ? (
                <View style={styles.userRow}>
                  <ActivityIndicator size="small" color="#0ea5e9" />
                  <Text style={styles.userRowText}>Učitavanje...</Text>
                </View>
              ) : (
                <ScrollView style={{ maxHeight: 320, marginTop: 8 }}>
                  {korisnici.map((k) => {
                    const id = k._id || k.id;
                    const selected = form.kolegaId === id;
                    return (
                      <TouchableOpacity
                        key={id}
                        style={[styles.userRow, selected && styles.userRowSelected]}
                        onPress={() => {
                          setForm((prev) => ({ ...prev, kolegaId: selected ? null : id }));
                          setShowKolege(false);
                        }}
                      >
                        <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={selected ? '#16a34a' : '#94a3b8'} />
                        <Text style={styles.userRowText}>{(k.ime || '')} {(k.prezime || '')}</Text>
                      </TouchableOpacity>
                    );
                  })}
                  {korisnici.length === 0 && (
                    <Text style={{ color: '#94a3b8', marginTop: 6 }}>Nema dostupnih korisnika.</Text>
                  )}
                </ScrollView>
              )
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Checklist</Text>
            {Object.keys(checklistLabels).map((key) => {
              const status = key === 'ups_check'
                ? statusState.ups
                : key === 'voice_comm'
                  ? statusState.voice
                  : null;
              const hasStatus = status === 'radi' || status === 'ne_radi';
              return (
                <View key={key} style={styles.checkItem}>
                  <TouchableOpacity
                    style={[
                      styles.checkbox,
                      status === 'radi' && styles.checkboxOk,
                      status === 'ne_radi' && styles.checkboxFail,
                    ]}
                    onPress={() => toggleChecklistItem(key)}
                    activeOpacity={0.7}
                  >
                    {checklistState[key] && (
                      <Ionicons name="checkmark" size={18} color={hasStatus ? '#fff' : '#16a34a'} />
                    )}
                  </TouchableOpacity>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.checkLabel}>{checklistLabels[key]}</Text>
                    {hasStatus && (
                      <View style={styles.statusRow}>
                        <View style={[styles.statusBadge, status === 'radi' ? styles.statusBadgeOk : styles.statusBadgeFail]}>
                          <Text style={styles.statusBadgeText}>{status === 'radi' ? 'Radi' : 'Ne radi'}</Text>
                        </View>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Napomene</Text>
            <TextInput
              ref={napomeneInputRef}
              style={styles.textArea}
              multiline
              placeholder="Napomene"
              value={form.napomene}
              onChangeText={(t) => setForm((prev) => ({ ...prev, napomene: t }))}
              onFocus={handleNapomeneInputFocus}
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Ugrađeno / zamijenjeno</Text>
            <TextInput
              style={styles.textArea}
              multiline
              placeholder="Npr. žarulja - 1 kom"
              value={form.utroseniMaterijal}
              onChangeText={(t) => setForm((prev) => ({ ...prev, utroseniMaterijal: t }))}
            />
          </View>

          <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.7 }]} disabled={saving} onPress={handleSave}>
            <Text style={styles.saveBtnText}>{saving ? 'Spremam...' : 'Spremi promjene'}</Text>
          </TouchableOpacity>
          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    backgroundColor: '#fff',
    paddingTop: 46,
    paddingBottom: 12,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#1f2937' },
  content: { flex: 1 },
  card: { backgroundColor: '#fff', padding: 16, marginTop: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1f2937', marginBottom: 8 },
  elevatorTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  elevatorSubtitle: { fontSize: 14, color: '#4b5563', marginTop: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  label: { fontSize: 14, color: '#6b7280' },
  value: { fontSize: 14, color: '#0f172a', fontWeight: '600' },
  kolegaToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  kolegaToggleText: { fontSize: 14, color: '#0f172a', fontWeight: '600' },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  userRowText: { fontSize: 14, color: '#0f172a' },
  userRowSelected: { backgroundColor: '#f0fdf4', borderRadius: 8, paddingHorizontal: 6 },
  checkItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: '#d1d5db',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOk: {
    backgroundColor: '#dcfce7',
    borderColor: '#22c55e',
  },
  checkboxFail: {
    backgroundColor: '#fee2e2',
    borderColor: '#ef4444',
  },
  checkLabel: { fontSize: 14, color: '#1f2937' },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  statusBadge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1 },
  statusBadgeOk: { backgroundColor: '#dcfce7', borderColor: '#22c55e' },
  statusBadgeFail: { backgroundColor: '#fee2e2', borderColor: '#ef4444' },
  statusBadgeText: { fontSize: 12, color: '#111827', fontWeight: '600' },
  textArea: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 12, minHeight: 100, textAlignVertical: 'top', color: '#0f172a' },
  saveBtn: { marginTop: 16, backgroundColor: '#2563eb', paddingVertical: 14, alignItems: 'center', borderRadius: 10, marginHorizontal: 16 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
