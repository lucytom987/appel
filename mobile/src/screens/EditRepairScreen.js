import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { elevatorDB, repairDB, userDB } from '../database/db';
import { repairsAPI, usersAPI } from '../services/api';
import ms from '../utils/scale';
import { useFocusEffect } from '@react-navigation/native';

function formatName(person) {
  if (!person) return '';
  const full = `${person.ime || person.firstName || person.name || person.fullName || ''} ${person.prezime || person.lastName || ''}`.trim();
  return full || person.email || '';
}

function normalize(value) {
  if (!value) return '';
  return String(value)
    .toLowerCase()
    .replace(/č|ć/g, 'c')
    .replace(/š/g, 's')
    .replace(/ž/g, 'z')
    .replace(/đ/g, 'd');
}

const confirmDelete = (baseRepair, navigation, setSaving, online, canDelete) => {
  if (!canDelete) {
    Alert.alert('Nedovoljno prava', 'Samo administratori ili menadžeri mogu brisati popravke.');
    return;
  }
  const id = baseRepair?._id || baseRepair?.id;
  if (!id) {
    Alert.alert('Greska', 'Nije moguce obrisati zapis.');
    return;
  }

  Alert.alert('Brisanje popravka', 'Zelite li obrisati ovaj popravak?', [
    { text: 'Odustani', style: 'cancel' },
    {
      text: 'Obrisi',
      style: 'destructive',
      onPress: async () => {
        setSaving(true);
        try {
          if (online) {
            try {
              await repairsAPI.delete(id);
              repairDB.delete(id);
              Alert.alert('Obrisano', 'Popravak je obrisan', [
                { text: 'OK', onPress: () => navigation.navigate('Repairs') },
              ]);
              return;
            } catch (err) {
              const status = err?.response?.status || err?.status;
              if (status === 404) {
                repairDB.delete(id);
                Alert.alert('Info', 'Popravak je već obrisan na serveru. Uklonjeno lokalno.', [
                  { text: 'OK', onPress: () => navigation.navigate('Repairs') },
                ]);
                return;
              }
              console.log('Skip remote delete', err?.message);
            }
          }
          // Offline ili mrežna greška – označi za brisanje lokalno
          repairDB.delete(id);
          Alert.alert('Spremljeno lokalno', 'Popravak je označen za brisanje i čeka sync.', [
            { text: 'OK', onPress: () => navigation.navigate('Repairs') },
          ]);
        } catch (e) {
          Alert.alert('Greska', e?.message || 'Brisanje nije uspjelo');
        } finally {
          setSaving(false);
        }
      },
    },
  ]);
};

export default function EditRepairScreen({ route, navigation }) {
  const { repair } = route.params;
  const { user, isOnline, serverAwake } = useAuth();
  const userRole = ((user?.uloga || user?.role || '') || '').toLowerCase();
  const canDelete = userRole === 'admin' || userRole === 'menadzer' || userRole === 'manager';

  // Hardverski back vraća na detalje popravka
  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        if (navigation.canGoBack()) {
          navigation.goBack();
          return true;
        }
        navigation.navigate('Repairs');
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [navigation, repair])
  );

  // Učitaj svježi zapis ako postoji u lokalnoj bazi
  const baseRepair = useMemo(() => {
    const id = repair?._id || repair?.id;
    if (!id) return repair || {};
    try {
      const fresh = repairDB.getById(id);
      return fresh ? { ...repair, ...fresh } : repair;
    } catch (e) {
      console.log('Ne mogu učitati popravak iz baze:', e?.message);
      return repair;
    }
  }, [repair]);

  const elevatorId = (typeof baseRepair.elevatorId === 'object' && baseRepair.elevatorId !== null)
    ? (baseRepair.elevatorId._id || baseRepair.elevatorId.id)
    : baseRepair.elevatorId;
  const initialElevator = elevatorDB.getById(elevatorId);
  const availableElevators = useMemo(
    () => (elevatorDB.getAll() || []).filter((e) => e && !e.is_deleted),
    []
  );

  const [showDateReported, setShowDateReported] = useState(false);
  const [showDateRepaired, setShowDateRepaired] = useState(false);
  const [showElevatorPicker, setShowElevatorPicker] = useState(false);
  const [elevatorSearchQuery, setElevatorSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [korisnici, setKorisnici] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showMajstori, setShowMajstori] = useState(false);
  const online = Boolean(isOnline && serverAwake);

  const parseDate = (val) => {
    if (!val) return null;
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const [form, setForm] = useState(() => ({
    elevatorId: elevatorId || '',
    datumPrijave: parseDate(baseRepair.datumPrijave) || new Date(),
    datumPopravka: parseDate(baseRepair.datumPopravka),
    prijavio: baseRepair.prijavio || '',
    pozivatelj: baseRepair.pozivatelj || baseRepair.Pozivatelj || '',
    kontaktTelefon: baseRepair.kontaktTelefon || '',
    primioPoziv: baseRepair.primioPoziv || formatName(user) || '',
    poslanMajstorId: typeof baseRepair.poslanMajstorId === 'object'
      ? (baseRepair.poslanMajstorId?._id || baseRepair.poslanMajstorId?.id)
      : (baseRepair.poslanMajstorId || null),
  }));

  React.useEffect(() => {
    const fetchUsers = async () => {
      setLoadingUsers(true);
      const currentUserId = user?._id || user?.id;
      const filterOutCurrent = (arr = []) => (Array.isArray(arr) ? arr : []).filter((u) => {
        const id = u?._id || u?.id;
        if (!id || String(id) === String(currentUserId)) return false;
        const role = String(u?.uloga || u?.role || '').toLowerCase();
        return role === 'serviser' || role === 'technician';
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

  const selectedElevator = useMemo(() => {
    if (!form.elevatorId) return initialElevator || null;
    return elevatorDB.getById(form.elevatorId)
      || availableElevators.find((e) => String(e.id || e._id) === String(form.elevatorId))
      || initialElevator
      || null;
  }, [form.elevatorId, availableElevators, initialElevator]);

  const filteredElevators = useMemo(() => {
    const q = normalize(elevatorSearchQuery.trim());
    if (!q) return availableElevators;

    return availableElevators.filter((item) => {
      const fields = [
        item.nazivStranke,
        item.ulica,
        item.mjesto,
        item.brojDizala,
        item.brojUgovora,
      ];
      return fields.some((f) => normalize(f).includes(q));
    });
  }, [availableElevators, elevatorSearchQuery]);

  const [showingSaveHint, setShowingSaveHint] = useState(false);

  const onChangeDate = (key, event, selected) => {
    if (key === 'datumPrijave') setShowDateReported(false);
    if (key === 'datumPopravka') setShowDateRepaired(false);
    if (selected) {
      setForm((prev) => ({ ...prev, [key]: selected }));
    }
  };

  const formatDate = (date) => date ? date.toLocaleString('hr-HR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'Nije postavljeno';

    const handleSave = async () => {
    const id = baseRepair._id || baseRepair.id;
    const payload = {
      elevatorId: form.elevatorId || elevatorId,
      datumPrijave: form.datumPrijave ? form.datumPrijave.toISOString() : null,
      datumPopravka: form.datumPopravka ? form.datumPopravka.toISOString() : null,
      status: baseRepair.status,
      opisKvara: baseRepair.opisKvara,
      opisPopravka: baseRepair.opisPopravka,
      napomene: baseRepair.napomene,
      pozivatelj: form.pozivatelj,
      prijavio: form.pozivatelj || form.prijavio,
      kontaktTelefon: form.kontaktTelefon,
      primioPoziv: form.primioPoziv,
      poslanMajstorId: form.poslanMajstorId || null,
      poslanMajstorIme: (() => {
        const selected = korisnici.find((k) => String(k._id || k.id) === String(form.poslanMajstorId || ''));
        if (selected) {
          return `${selected.ime || ''} ${selected.prezime || ''}`.trim() || selected.email || '';
        }

        const fromCache = form.poslanMajstorId ? userDB.getById(form.poslanMajstorId) : null;
        if (fromCache) {
          return `${fromCache.ime || ''} ${fromCache.prezime || ''}`.trim() || fromCache.email || '';
        }

        if (typeof baseRepair?.poslanMajstorIme === 'string' && baseRepair.poslanMajstorIme.trim()) {
          return baseRepair.poslanMajstorIme.trim();
        }

        return '';
      })(),
      radniNalogPotpisan: baseRepair.radniNalogPotpisan,
      popravkaUPotpunosti: baseRepair.popravkaUPotpunosti,
    };

    if (!payload.elevatorId) {
      Alert.alert('Greška', 'Odaberite dizalo prije spremanja.');
      return;
    }

    setSaving(true);

    const merged = { ...baseRepair, ...payload, synced: 0, sync_status: 'dirty', updated_at: Date.now() };

    try {
      const onlineNow = Boolean(isOnline && serverAwake);
      if (!onlineNow) {
        repairDB.update(id, merged);
        setShowingSaveHint(true);
      } else {
        const res = await repairsAPI.update(id, payload);
        const updated = res.data?.data || res.data || {};
        repairDB.update(id, { ...merged, ...updated, synced: 1, sync_status: 'synced' });
      }
    } catch (e) {
      console.log('Backend nedostupan, spremam lokalno', e?.message);
      repairDB.update(id, merged);
      setShowingSaveHint(true);
    } finally {
      setSaving(false);
      Alert.alert('Spremljeno', 'Podaci o popravku su ažurirani', [
        { text: 'OK', onPress: () => navigation.navigate('Repairs') },
      ]);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            if (navigation.canGoBack()) {
              navigation.goBack();
            } else {
              navigation.navigate('Repairs');
            }
          }}
        >
          <Ionicons name="arrow-back" size={24} color="#1f2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Uredi popravak</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : ms(2)}
      >
        <ScrollView
          style={styles.content}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 24 }}
        >
          {selectedElevator && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Dizalo</Text>
              <Text style={styles.elevatorTitle}>{selectedElevator.nazivStranke || ''}</Text>
              <Text style={styles.elevatorDetail}>{selectedElevator.ulica}, {selectedElevator.mjesto}</Text>
              <Text style={styles.elevatorCode}>Dizalo: {selectedElevator.brojDizala}</Text>

              <TouchableOpacity style={styles.selectorButton} onPress={() => setShowElevatorPicker((v) => !v)}>
                <Ionicons name={showElevatorPicker ? 'chevron-up' : 'chevron-down'} size={18} color="#1d4ed8" />
                <Text style={styles.selectorButtonText}>Promijeni dizalo</Text>
              </TouchableOpacity>

              {showElevatorPicker && (
                <View style={styles.elevatorPickerList}>
                  <View style={styles.elevatorSearchWrap}>
                    <Ionicons name="search-outline" size={18} color="#64748b" />
                    <TextInput
                      style={styles.elevatorSearchInput}
                      value={elevatorSearchQuery}
                      onChangeText={setElevatorSearchQuery}
                      placeholder="Pretraži po adresi, mjestu, broju dizala..."
                      placeholderTextColor="#94a3b8"
                    />
                    {elevatorSearchQuery ? (
                      <TouchableOpacity onPress={() => setElevatorSearchQuery('')}>
                        <Ionicons name="close-circle" size={18} color="#94a3b8" />
                      </TouchableOpacity>
                    ) : null}
                  </View>

                  <Text style={styles.elevatorPickerCount}>Pronađeno: {filteredElevators.length}</Text>

                  <ScrollView style={styles.elevatorPickerScroll} nestedScrollEnabled>
                    {filteredElevators.length === 0 ? (
                      <Text style={styles.elevatorEmptyText}>Nema rezultata za pretragu.</Text>
                    ) : filteredElevators.map((item) => {
                      const id = item.id || item._id;
                      const isSelected = String(form.elevatorId || '') === String(id || '');
                      return (
                        <TouchableOpacity
                          key={String(id)}
                          style={[styles.elevatorOption, isSelected && styles.elevatorOptionSelected]}
                          onPress={() => {
                            setForm((prev) => ({ ...prev, elevatorId: id }));
                            setShowElevatorPicker(false);
                          }}
                        >
                          <Ionicons
                            name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                            size={18}
                            color={isSelected ? '#2563eb' : '#9ca3af'}
                          />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.elevatorOptionTitle}>{item.nazivStranke || 'Bez naziva'}</Text>
                            <Text style={styles.elevatorOptionSub}>
                              {item.ulica || ''}{item.mjesto ? `, ${item.mjesto}` : ''}
                              {item.brojDizala ? ` • Dizalo: ${item.brojDizala}` : ''}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Datumi</Text>
            <Text style={styles.label}>Datum prijave</Text>
            <TouchableOpacity style={styles.dateButton} onPress={() => setShowDateReported(true)}>
              <Ionicons name="calendar-outline" size={20} color="#666" />
              <Text style={styles.dateText}>{formatDate(form.datumPrijave)}</Text>
            </TouchableOpacity>
            {showDateReported && (
              <DateTimePicker
                value={form.datumPrijave || new Date()}
                mode="date"
                display="default"
                onChange={(e, d) => onChangeDate('datumPrijave', e, d)}
              />
            )}

            <Text style={[styles.label, { marginTop: 14 }]}>Datum popravka</Text>
            <TouchableOpacity style={styles.dateButton} onPress={() => setShowDateRepaired(true)}>
              <Ionicons name="calendar-outline" size={20} color="#666" />
              <Text style={styles.dateText}>{form.datumPopravka ? formatDate(form.datumPopravka) : 'Nije postavljeno'}</Text>
            </TouchableOpacity>
            {showDateRepaired && (
              <DateTimePicker
                value={form.datumPopravka || new Date()}
                mode="date"
                display="default"
                onChange={(e, d) => onChangeDate('datumPopravka', e, d)}
              />
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Poziv</Text>
            <Text style={styles.label}>Primio poziv</Text>
            <TextInput
              style={styles.input}
              value={form.primioPoziv}
              onChangeText={(text) => setForm((p) => ({ ...p, primioPoziv: text }))}
              placeholder="Ime i prezime"
              placeholderTextColor="#9ca3af"
            />
            <Text style={[styles.label, { marginTop: 12 }]}>Pozivatelj</Text>
            <TextInput
              style={styles.input}
              value={form.pozivatelj}
              onChangeText={(text) => setForm((p) => ({ ...p, pozivatelj: text }))}
              placeholder="Ime i prezime pozivatelja"
              placeholderTextColor="#9ca3af"
            />
            <TextInput
              style={[styles.input, { marginTop: 10 }]}
              value={form.kontaktTelefon}
              onChangeText={(text) => setForm((p) => ({ ...p, kontaktTelefon: text }))}
              placeholder="Telefon pozivatelja"
              placeholderTextColor="#9ca3af"
              keyboardType="phone-pad"
            />

            <Text style={[styles.label, { marginTop: 12 }]}>Majstor poslan na kvar</Text>
            <TouchableOpacity style={styles.selectorButton} onPress={() => setShowMajstori((v) => !v)}>
              <Ionicons name={showMajstori ? 'chevron-up' : 'chevron-down'} size={18} color="#1d4ed8" />
              <Text style={styles.selectorButtonText}>
                {form.poslanMajstorId
                  ? (() => {
                      const found = korisnici.find((k) => String(k._id || k.id) === String(form.poslanMajstorId));
                      return found ? `${found.ime || ''} ${found.prezime || ''}`.trim() || found.email || 'Majstor odabran' : 'Majstor odabran';
                    })()
                  : 'Odaberi majstora (opcionalno)'}
              </Text>
            </TouchableOpacity>

            {showMajstori && (
              loadingUsers ? (
                <View style={styles.userRow}>
                  <Ionicons name="refresh" size={18} color="#0ea5e9" />
                  <Text style={styles.userRowText}>Učitavanje...</Text>
                </View>
              ) : (
                <ScrollView style={{ maxHeight: 320, marginTop: 8 }}>
                  {korisnici.map((k) => {
                    const id = k._id || k.id;
                    const selected = String(form.poslanMajstorId || '') === String(id || '');
                    return (
                      <TouchableOpacity
                        key={String(id)}
                        style={[styles.userRow, selected && styles.userRowSelected]}
                        onPress={() => {
                          setForm((prev) => ({ ...prev, poslanMajstorId: selected ? null : id }));
                          setShowMajstori(false);
                        }}
                      >
                        <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={selected ? '#16a34a' : '#94a3b8'} />
                        <Text style={styles.userRowText}>{(k.ime || '')} {(k.prezime || '')}</Text>
                      </TouchableOpacity>
                    );
                  })}
                  {korisnici.length === 0 && (
                    <Text style={{ color: '#94a3b8', marginTop: 6 }}>Nema dostupnih servisera.</Text>
                  )}
                </ScrollView>
              )
            )}
          </View>

          {showingSaveHint && (
            <Text style={styles.hintText}>Backend nije bio dostupan, promjene su snimljene lokalno i sinkat će se kasnije.</Text>
          )}

          <TouchableOpacity style={[styles.saveButton, saving && styles.saveButtonDisabled]} onPress={handleSave} disabled={saving}>
            <Ionicons name="save" size={20} color="#fff" />
            <Text style={styles.saveButtonText}>{saving ? 'Spremam...' : 'Spremi promjene'}</Text>
          </TouchableOpacity>

        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => confirmDelete(baseRepair, navigation, setSaving, online, canDelete)}
          disabled={saving}
        >
            <Ionicons name="trash" size={20} color="#b91c1c" />
            <Text style={styles.deleteButtonText}>Obriši popravak</Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { backgroundColor: '#fff', paddingTop: ms(50), paddingBottom: ms(15), paddingHorizontal: ms(20), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#e5e5e5' },
  headerTitle: { fontSize: ms(19), fontWeight: '700', color: '#1f2937' },
  content: { flex: 1 },
  card: { backgroundColor: '#fff', padding: ms(16), marginTop: ms(12), borderRadius: ms(12), shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
  sectionTitle: { fontSize: ms(17), fontWeight: '800', color: '#111827', marginBottom: ms(10) },
  elevatorTitle: { fontSize: ms(16), fontWeight: '700', color: '#111827' },
  elevatorDetail: { fontSize: ms(14), color: '#6b7280', marginTop: ms(2) },
  elevatorCode: { fontSize: ms(14), color: '#374151', marginTop: ms(4), fontWeight: '600' },
  selectorButton: {
    marginTop: ms(12),
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
    borderRadius: ms(8),
    paddingVertical: ms(10),
    paddingHorizontal: ms(12),
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(8),
  },
  selectorButtonText: { fontSize: ms(14), fontWeight: '700', color: '#1d4ed8' },
  elevatorPickerList: {
    marginTop: ms(10),
    borderWidth: 1,
    borderColor: '#dbeafe',
    borderRadius: ms(10),
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  elevatorSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(8),
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingHorizontal: ms(10),
    paddingVertical: ms(8),
    backgroundColor: '#f8fafc',
  },
  elevatorSearchInput: {
    flex: 1,
    fontSize: ms(14),
    color: '#0f172a',
    paddingVertical: ms(4),
  },
  elevatorPickerCount: {
    fontSize: ms(12),
    color: '#64748b',
    paddingHorizontal: ms(12),
    paddingTop: ms(8),
    paddingBottom: ms(4),
    fontWeight: '600',
  },
  elevatorPickerScroll: {
    maxHeight: ms(260),
  },
  elevatorOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(10),
    paddingVertical: ms(10),
    paddingHorizontal: ms(12),
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  elevatorOptionSelected: {
    backgroundColor: '#eff6ff',
  },
  elevatorOptionTitle: { fontSize: ms(14), fontWeight: '700', color: '#111827' },
  elevatorOptionSub: { fontSize: ms(12), color: '#64748b', marginTop: ms(2) },
  elevatorEmptyText: {
    fontSize: ms(13),
    color: '#64748b',
    paddingHorizontal: ms(12),
    paddingVertical: ms(14),
  },
  label: { fontSize: ms(14), fontWeight: '600', color: '#1f2937', marginBottom: ms(8) },
  dateButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: ms(8), padding: ms(12), gap: ms(10) },
  dateText: { fontSize: ms(16), color: '#1f2937' },
  input: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: ms(8), padding: ms(12), fontSize: ms(16), color: '#1f2937' },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: ms(8), paddingVertical: ms(8) },
  userRowText: { fontSize: ms(14), color: '#0f172a' },
  userRowSelected: { backgroundColor: '#f0fdf4', borderRadius: ms(8), paddingHorizontal: ms(6) },
  hintText: { marginTop: ms(10), marginHorizontal: ms(16), fontSize: ms(13), color: '#6b7280' },
  saveButton: { backgroundColor: '#2563eb', marginHorizontal: ms(16), marginTop: ms(16), padding: ms(16), borderRadius: ms(12), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: ms(8) },
  saveButtonDisabled: { opacity: 0.7 },
  saveButtonText: { color: '#fff', fontSize: ms(16), fontWeight: '700' },
  deleteButton: { borderWidth: 1, borderColor: '#fca5a5', backgroundColor: '#fef2f2', marginHorizontal: ms(16), marginTop: ms(12), padding: ms(14), borderRadius: ms(12), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: ms(8) },
  deleteButtonText: { color: '#b91c1c', fontSize: ms(15), fontWeight: '700' },
});
