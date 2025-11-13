import React, { createContext, useState, useEffect, useContext } from 'react';
import * as SecureStore from 'expo-secure-store';
import { authAPI } from '../services/api';
import { initDatabase, elevatorDB, serviceDB, repairDB, resetDatabase } from '../database/db';
import { seedDummyData } from '../utils/dummyData';
import { 
  syncAll, 
  startAutoSync, 
  stopAutoSync,
  subscribeToNetworkChanges,
  checkOnlineStatus 
} from '../services/syncService';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    // Inicijaliziraj bazu i provjeri auto-login
    initializeApp();

    // Subscribe na network changes
    const unsubscribe = subscribeToNetworkChanges((online) => {
      setIsOnline(online);
      console.log(online ? '🟢 Online' : '🔴 Offline');
    });

    return () => {
      unsubscribe();
      stopAutoSync();
    };
  }, []);

  const initializeApp = async () => {
    try {
      // 1. Inicijaliziraj SQLite bazu
      console.log('🔄 Inicijaliziram bazu...');
      initDatabase();
      
      // 3. Provjeri online status
      const online = await checkOnlineStatus();
      setIsOnline(online);

      // 4. Provjeri da li postoji token (auto-login)
      const token = await SecureStore.getItemAsync('userToken');
      const userData = await SecureStore.getItemAsync('userData');

      if (token && userData) {
        setUser(JSON.parse(userData));
        
        // Ako si online I imaš token, pokreni sync odmah
        if (online) {
          console.log('🔄 Auto-login - pokrećem inicijalni sync...');
          await syncAll().catch(err => console.log('⚠️ Sync error:', err));
          startAutoSync();
        }
      } else {
        // Ako nemaš token, dodaj dummy podatke za testiranje
        const elevatorCount = elevatorDB.getAll().length;
        if (elevatorCount === 0) {
          console.log('📝 Dodajem dummy podatke...');
          seedDummyData(elevatorDB, serviceDB, repairDB);
        }
      }
      
      setLoading(false);
    } catch (error) {
      console.error('❌ Greška pri inicijalizaciji:', error);
      setLoading(false);
    }
  };

  const login = async (email, lozinka) => {
    try {
      setLoading(true);
      console.log('🔑 Pokušavam login...', email);
      console.log('🌐 API URL:', 'https://appel-backend.onrender.com/api');
      
      const response = await authAPI.login(email, lozinka);
      console.log('✅ Login response:', response.data);
      
      const { token, korisnik } = response.data;

      // Spremi token i user podatke
      await SecureStore.setItemAsync('userToken', token);
      await SecureStore.setItemAsync('userData', JSON.stringify(korisnik));
      
      setUser(korisnik);
      setLoading(false); // Odmah postavi loading na false

      // Pokreni prvi sync u pozadini (ne blokiraj UI)
      syncAll().catch(err => console.log('⚠️ Background sync error:', err));
      startAutoSync();

      return { success: true };
    } catch (error) {
      console.error('❌ Login greška:', error);
      console.error('❌ Error response:', error.response?.data);
      console.error('❌ Error message:', error.message);
      setLoading(false);
      return { 
        success: false, 
        message: error.response?.data?.message || 'Greška pri prijavi' 
      };
    }
  };

  const logout = async () => {
    try {
      setLoading(true);
      
      // Zaustavi auto-sync
      stopAutoSync();

      // Obriši token i user podatke
      await SecureStore.deleteItemAsync('userToken');
      await SecureStore.deleteItemAsync('userData');
      
      // Obriši sve lokalne podatke iz baze
      resetDatabase();
      
      setUser(null);
    } catch (error) {
      console.error('❌ Logout greška:', error);
    } finally {
      setLoading(false);
    }
  };

  const value = {
    user,
    setUser,
    loading,
    isOnline,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth mora biti unutar AuthProvider-a');
  }
  return context;
};
