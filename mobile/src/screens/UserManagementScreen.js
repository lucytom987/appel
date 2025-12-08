import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Modal,
  TextInput,
  ScrollView,
  Clipboard,
  StatusBar,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usersAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { userDB } from '../database/db';

const UserManagementScreen = ({ navigation }) => {
  const { user, isOnline } = useAuth();
  const { goBack } = navigation;
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [editValues, setEditValues] = useState({});
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);

  useEffect(() => {
    loadUsers();
  }, []);

  // Provjeri je li korisnik admin
  if (user?.uloga !== 'admin') {
    return (
      <View style={styles.centeredContainer}>
        <Ionicons name="lock-closed" size={64} color="#FF6B6B" />
        <Text style={styles.errorText}>Samo admin može upravljati korisnicima!</Text>
      </View>
    );
  }

  // Provjeri je li korisnik online (offline admin ne može upravljati korisnicima sa servera)
  if (!isOnline) {
    return (
      <View style={styles.centeredContainer}>
        <Ionicons name="wifi-off" size={64} color="#FF6B6B" />
        <Text style={styles.errorText}>Upravljanje korisnicima zahtijeva konekciju na internet!</Text>
        <Text style={styles.infoText}>Trebate biti online da biste upravljali korisnicima.</Text>
      </View>
    );
  }

  const loadUsers = async () => {
    try {
      setLoading(true);
      console.log('📋 Počinjem učitavati korisnike...');
      
      // Učitaj sa lokalne baze
      const localUsers = userDB.getAll();
      console.log('📚 Lokalni korisnici:', localUsers.length);
      setUsers(localUsers);

      // Pokušaj učitati sa servera
      try {
        console.log('🌐 Pokušavam učitati sa servera...');
        const response = await usersAPI.getAll();
        console.log('✅Server odgovorio:', response.data?.length || 'unknown');
        const serverUsers = response.data;
        userDB.bulkInsert(serverUsers);
        setUsers(serverUsers);
        console.log('✅ Korisnici učitani sa servera:', serverUsers.length);
      } catch (error) {
        console.error('❌ Greška pri učitavanju sa servera:');
        console.error('  Status:', error.response?.status);
        console.error('  Poruka:', error.response?.data?.message || error.message);
        console.error('  URL:', error.config?.url);
        console.error('  Method:', error.config?.method);
        console.log('⚠️ Koristim lokalnu bazu - Server nije dostupan');
        // Koristi lokalnu bazu ako server nije dostupan
      }
    } catch (error) {
      console.error('❌ Kritična greška pri učitavanju korisnika:', error);
      Alert.alert('Greška', 'Greška pri učitavanju korisnika');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadUsers();
  }, []);

  const handleAddUser = () => {
    navigation.navigate('AddUser');
  };

  const isCurrentUser = (u) => {
    const uid = u?._id || u?.id;
    const me = user?._id || user?.id;
    return uid && me && uid === me;
  };

  const handleEditUser = (selectedUser) => {
    setEditingUser(selectedUser);
    setEditValues({
      ime: selectedUser.ime,
      prezime: selectedUser.prezime,
      uloga: selectedUser.uloga,
      telefon: selectedUser.telefon || '',
    });
    setModalVisible(true);
  };

  const handleSaveEdit = async () => {
    try {
      if (!editValues.ime || !editValues.prezime) {
        Alert.alert('Greška', 'Ime i prezime su obavezni');
        return;
      }

      await usersAPI.update(editingUser._id || editingUser.id, {
        ime: editValues.ime,
        prezime: editValues.prezime,
        uloga: editValues.uloga,
        telefon: editValues.telefon,
      });

      userDB.update(editingUser._id || editingUser.id, {
        ...editingUser,
        ...editValues,
      });

      Alert.alert('Uspjeh', 'Korisnik je uspješno ažuriran');
      setModalVisible(false);
      loadUsers();
    } catch (error) {
      console.error('❌ Greška pri ažuriranju korisnika:', error);
      Alert.alert('Greška', 'Greška pri ažuriranju korisnika');
    }
  };

  const handleDeleteUser = (selectedUser) => {
    Alert.alert(
      'Potvrda brisanja',
      `Sigurno želiš obrisati ${selectedUser.ime} ${selectedUser.prezime}?`,
      [
        { text: 'Otkaži', onPress: () => {} },
        {
          text: 'Obriši',
          onPress: async () => {
            try {
              await usersAPI.delete(selectedUser._id || selectedUser.id);
              userDB.delete(selectedUser._id || selectedUser.id);
              loadUsers();
              Alert.alert('Uspjeh', 'Korisnik je obrisan');
            } catch (error) {
              console.error('❌ Greška pri brisanju korisnika:', error);
              Alert.alert('Greška', 'Greška pri brisanju korisnika');
            }
          },
          style: 'destructive',
        },
      ]
    );
  };

  const openPasswordModal = (userToReset) => {
    setSelectedUser(userToReset);
    setPasswordInput('');
    setPasswordModalVisible(true);
  };

  const handleResetPassword = async () => {
    if (!selectedUser) return;
    if (!passwordInput || passwordInput.length < 6) {
      Alert.alert('Greška', 'Lozinka mora biti najmanje 6 znakova');
      return;
    }
    try {
      const response = await usersAPI.resetPassword(selectedUser._id || selectedUser.id, passwordInput);
      const tempPassword = response.data?.temporaryPassword || passwordInput;

      try {
        const localUser = { ...selectedUser, privremenaLozinka: tempPassword };
        userDB.update(selectedUser._id || selectedUser.id, localUser);
      } catch (e) {
        console.log('⚠️ Ne mogu lokalno spremiti privremenu lozinku:', e.message);
      }

      setPasswordModalVisible(false);
      Alert.alert(
        '✅ Lozinka resetirana',
        `Nova lozinka je: ${tempPassword}\n\nOvaj korisnik će morati koristiti ovu lozinku da se prijavi.`,
        [
          {
            text: 'Kopiraj lozinku',
            onPress: async () => {
              await Clipboard.setString(tempPassword);
              Alert.alert('✅ Kopirano', 'Lozinka je kopirana u clipboard');
            },
          },
          { text: 'OK' },
        ]
      );
    } catch (error) {
      console.error('❌ Greška pri resetiranju lozinke:', error);
      Alert.alert('Greška', 'Greška pri resetiranju lozinke');
    }
  };

  const getRoleColor = (uloga) => {
    switch (uloga) {
      case 'admin':
        return '#FF6B6B';
      case 'menadzer':
        return '#4ECDC4';
      case 'serviser':
        return '#22c55e';
      default:
        return '#999';
    }
  };

  const getRoleLabel = (uloga) => {
    switch (uloga) {
      case 'admin':
        return 'Administrator (Sve mogućnosti)';
      case 'menadzer':
        return 'Menadžer (Sve + Baza)';
      case 'serviser':
        return 'Serviser (Servisi i popravke)';
      default:
        return uloga;
    }
  };

  const renderUserItem = ({ item }) => (
    <View style={styles.userCard}>
      <View style={styles.userHeader}>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>
            {item.ime} {item.prezime}
          </Text>
          <Text style={styles.userEmail}>{item.email}</Text>
          <View
            style={[
              styles.roleBadge,
              { backgroundColor: getRoleColor(item.uloga) },
            ]}
          >
            <Text style={styles.roleText}>{item.uloga.toUpperCase()}</Text>
          </View>
        </View>
        <View
          style={[
            styles.statusIndicator,
            { backgroundColor: isCurrentUser(item) ? '#10b981' : '#d1d5db' },
          ]}
        />
      </View>

      {item.telefon && (
        <Text style={styles.userPhone}>
          <Ionicons name="call" size={14} /> {item.telefon}
        </Text>
      )}

      <View style={styles.actionsContainer}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => handleEditUser(item)}
        >
          <Ionicons name="pencil" size={16} color="#FFF" />
          <Text style={styles.actionButtonText}>Uredi</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.passwordButton]}
          onPress={() => openPasswordModal(item)}
        >
          <Ionicons name="key" size={16} color="#FFF" />
          <Text style={styles.actionButtonText}>Lozinka</Text>
        </TouchableOpacity>

        {item._id !== user._id && (
          <TouchableOpacity
            style={[styles.actionButton, styles.deleteButton]}
            onPress={() => handleDeleteUser(item)}
          >
            <Ionicons name="trash" size={16} color="#FFF" />
            <Text style={styles.actionButtonText}>Obriši</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color="#45B7D1" />
        <Text style={styles.loadingText}>Učitavam korisnike...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.pageHeader}>
        <TouchableOpacity onPress={() => goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.pageTitle}>Korisnici</Text>
          <Text style={styles.pageSubtitle}>Upravljanje korisnicima i lozinkama</Text>
        </View>
      </View>
      <FlatList
        data={users}
        keyExtractor={(item) => item._id || item.id}
        renderItem={renderUserItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="people" size={48} color="#999" />
            <Text style={styles.emptyText}>Nema korisnika</Text>
          </View>
        }
      />

      <TouchableOpacity style={styles.fab} onPress={handleAddUser}>
        <Ionicons name="add" size={28} color="#FFF" />
      </TouchableOpacity>

      {/* Reset password modal (radi i na Androidu) */}
      <Modal visible={passwordModalVisible} transparent animationType="fade">
        <View style={styles.passwordOverlay}>
          <View style={styles.passwordModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Reset lozinke</Text>
              <TouchableOpacity onPress={() => setPasswordModalVisible(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <Text style={styles.infoText}>
              {selectedUser ? `Nova lozinka za ${selectedUser.ime} ${selectedUser.prezime}` : ''}
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Unesite novu lozinku (min 6)"
              secureTextEntry
              value={passwordInput}
              onChangeText={setPasswordInput}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10, gap: 10 }}>
              <TouchableOpacity onPress={() => setPasswordModalVisible(false)}>
                <Text style={styles.cancelText}>Otkaži</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleResetPassword} style={styles.resetButton}>
                <Text style={styles.resetButtonText}>Resetiraj</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Uredi korisnika</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalForm}>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Ime</Text>
                <TextInput
                  style={styles.input}
                  value={editValues.ime}
                  onChangeText={(text) =>
                    setEditValues({ ...editValues, ime: text })
                  }
                  placeholder="Unesite ime"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Prezime</Text>
                <TextInput
                  style={styles.input}
                  value={editValues.prezime}
                  onChangeText={(text) =>
                    setEditValues({ ...editValues, prezime: text })
                  }
                  placeholder="Unesite prezime"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Telefonski broj</Text>
                <TextInput
                  style={styles.input}
                  value={editValues.telefon}
                  onChangeText={(text) =>
                    setEditValues({ ...editValues, telefon: text })
                  }
                  placeholder="Unesite broj"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Nivo pristupa</Text>
                <View style={styles.roleSelector}>
                  {['serviser', 'menadzer', 'admin'].map((role) => (
                    <TouchableOpacity
                      key={role}
                      style={[
                        styles.roleOption,
                        editValues.uloga === role && styles.roleOptionActive,
                      ]}
                      onPress={() =>
                        setEditValues({ ...editValues, uloga: role })
                      }
                    >
                      <Text
                        style={[
                          styles.roleOptionText,
                          editValues.uloga === role &&
                            styles.roleOptionTextActive,
                        ]}
                      >
                        {getRoleLabel(role)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.buttonText}>Otkaži</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.saveButton]}
                onPress={handleSaveEdit}
              >
                <Text style={[styles.buttonText, { color: '#FFF' }]}>
                  Spremi
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    paddingTop: Platform.OS === 'android'
      ? (StatusBar.currentHeight || 0) + 12
      : 24,
  },
  pageHeader: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F5F5F5',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    padding: 6,
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  pageSubtitle: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  listContent: {
    padding: 12,
  },
  userCard: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  userHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  userInfo: {
    flex: 1,
    marginRight: 12,
  },
  userName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  roleText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 4,
  },
  userPhone: {
    fontSize: 13,
    color: '#666',
    marginBottom: 12,
  },
  actionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionButton: {
    flexDirection: 'row',
    backgroundColor: '#45B7D1',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
    gap: 6,
  },
  passwordButton: {
    backgroundColor: '#FFB347',
  },
  resetButton: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  resetButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  cancelText: {
    color: '#6b7280',
    fontWeight: '600',
  },
  deleteButton: {
    backgroundColor: '#FF6B6B',
  },
  actionButtonText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#45B7D1',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 16,
    color: '#999',
  },
  errorText: {
    marginTop: 12,
    fontSize: 16,
    color: '#FF6B6B',
  },
  infoText: {
    marginTop: 8,
    fontSize: 14,
    color: '#999',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  passwordOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  passwordModalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  modalForm: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#333',
  },
  roleSelector: {
    gap: 8,
  },
  roleOption: {
    borderWidth: 2,
    borderColor: '#DDD',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFF',
  },
  roleOptionActive: {
    borderColor: '#45B7D1',
    backgroundColor: '#E8F4F8',
  },
  roleOptionText: {
    fontSize: 14,
    color: '#666',
  },
  roleOptionTextActive: {
    color: '#45B7D1',
    fontWeight: '600',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#EEE',
  },
  saveButton: {
    backgroundColor: '#45B7D1',
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
});

export default UserManagementScreen;
