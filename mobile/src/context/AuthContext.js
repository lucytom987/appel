import React, { createContext, useState, useEffect, useContext } from 'react';
import * as SecureStore from 'expo-secure-store';
import { authAPI, usersAPI } from '../services/api';
import { initDatabase, elevatorDB, serviceDB, repairDB, userDB, resetDatabase } from '../database/db';
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
      
      console.log('🔍 Provjera auto-login:', {
        tokenExists: !!token,
        tokenPreview: token ? token.substring(0, 20) + '...' : 'NE',
        userDataExists: !!userData,
      });

      if (token && userData) {
        setUser(JSON.parse(userData));
        
        // Ako je offline token - NE pokreći sync
        const isOfflineUser = token.startsWith('offline_token_');
        
        // Ako si online I imaš token I token je pravi JWT - pokreni sync odmah
        if (online && !isOfflineUser) {
          console.log('🔄 Auto-login - pokrećem inicijalni sync...');
          await syncAll().catch(err => console.log('⚠️ Sync error:', err));
          startAutoSync();
        } else if (isOfflineUser) {
          console.log('⚠️ Offline korisnik (demo) - NE pokrećem sync');
        }
      } else {
        // Ako nemaš token, login je obavezan
        console.log('⚠️ Nema tokena - login je obavezan');
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
      
      // Offline login podršku - dummy korisnik za testiranje
      const offlineAdminUser = {
        _id: 'offline_admin',
        email: 'vidacek@appel.com',
        ime: 'Tomislav',
        prezime: 'Vidacek',
        uloga: 'admin',
        aktivan: true,
        telefon: '0987654321'
      };

      // Ako je korisnik koji se logira admin demo korisnik - dozvoli offline
      if (email === 'vidacek@appel.com' && lozinka === 'vidacek123') {
        console.log('⚠️ Offline login - admin demo korisnik');
        
        // Spremi token i user podatke (offline token)
        await SecureStore.setItemAsync('userToken', 'offline_token_' + Date.now());
        await SecureStore.setItemAsync('userData', JSON.stringify(offlineAdminUser));
        
        setUser(offlineAdminUser);
        setLoading(false);
        
        // NE pokreći sync - offline korisnik ne može sinkronizirati
        return { success: true };
      }

      // Pokušaj online login
      if (!isOnline) {
        console.log('⚠️ Nema interneta i nije demo korisnik - login nije moguć');
        return {
          success: false,
          message: 'Bez interneta možete se prijaviti kao vidacek@appel.com (lozinka: vidacek123)'
        };
      }

      const response = await authAPI.login(email, lozinka);
      console.log('✅ Login response:', response.data);
      console.log('🔍 Response keys:', Object.keys(response.data));
      
      const { token, korisnik } = response.data;
      
      if (!token) {
        console.error('❌ Token nije u odgovoru!', response.data);
        throw new Error('Greška pri prijavi - nema tokena u odgovoru');
      }
      
      if (!korisnik) {
        console.error('❌ Korisnik nije u odgovoru!', response.data);
        throw new Error('Greška pri prijavi - nema korisnika u odgovoru');
      }

      // Spremi token i user podatke
      console.log('💾 Spreminjem token u SecureStore:', token.substring(0, 20) + '...');
      await SecureStore.setItemAsync('userToken', token);
      await SecureStore.setItemAsync('userData', JSON.stringify(korisnik));
      
      // Provjeri da li je token sačuvan
      const savedToken = await SecureStore.getItemAsync('userToken');
      console.log('✅ Token sačuvan:', savedToken ? 'DA' : 'NE');
      
      setUser(korisnik);
      setLoading(false); // Odmah postavi loading na false

      // Čekaj da se token pravilno sačuva prije nego što pokreneš sync
      console.log('⏳ Čekam 500ms da se token sačuva u SecureStore...');
      await new Promise(resolve => setTimeout(resolve, 500));

      // Provjeri token prije nego što pokreneš sync
      const tokenBeforeSync = await SecureStore.getItemAsync('userToken');
      if (!tokenBeforeSync) {
        console.error('❌ KRITIČNO: Token nije dostupan nakon čekanja!');
        throw new Error('Token nije sačuvan pravilno - sync ne može da se pokrene');
      }
      console.log('✅ Token je dostupan - pokrećem sync');

      // Pokreni prvi sync u pozadini (ne blokiraj UI)
      console.log('🔄 Pokrećem sync nakon login-a...');
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
