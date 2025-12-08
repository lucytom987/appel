import React, { createContext, useState, useEffect, useContext } from 'react';
import * as SecureStore from 'expo-secure-store';
import { authAPI } from '../services/api';
import { initDatabase, resetDatabase } from '../database/db';
import {
  syncAll,
  startAutoSync,
  stopAutoSync,
  subscribeToNetworkChanges,
  checkOnlineStatus,
} from '../services/syncService';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    initializeApp();

    const unsubscribe = subscribeToNetworkChanges((online) => {
      setIsOnline(online);
      console.log(online ? 'Online' : 'Offline');
    });

    return () => {
      unsubscribe();
      stopAutoSync();
    };
  }, []);

  const initializeApp = async () => {
    try {
      console.log('Inicijaliziram bazu...');
      initDatabase();

      const online = await checkOnlineStatus();
      setIsOnline(online);

      const token = await SecureStore.getItemAsync('userToken');
      const userData = await SecureStore.getItemAsync('userData');

      console.log('Provjera auto-login:', {
        tokenExists: !!token,
        tokenPreview: token ? token.substring(0, 20) + '...' : 'NE',
        userDataExists: !!userData,
      });

      if (token && userData) {
        setUser(JSON.parse(userData));

        if (online) {
          console.log('Auto-login - pokrecem inicijalni sync...');
          await syncAll().catch((err) => console.log('Sync error:', err));
          startAutoSync();
        }
      } else {
        console.log('Nema tokena - login je obavezan');
      }

      setLoading(false);
    } catch (error) {
      console.error('Greska pri inicijalizaciji:', error);
      setLoading(false);
    }
  };

  const login = async (email, lozinka) => {
    try {
      setLoading(true);
      console.log('Pokusavam login...', email);

      let response;
      try {
        response = await authAPI.login(email, lozinka);
      } catch (err) {
        const status = err.response?.status;
        const networkProblem = !err.response || status === 502 || status === 503;
        if (networkProblem) {
          const stillOnline = await checkOnlineStatus().catch(() => false);
          setLoading(false);
          if (!stillOnline) {
            return { success: false, message: 'Potrebna je online veza za login' };
          }
          return { success: false, message: 'Server trenutno nije dostupan. Pokušajte ponovo.' };
        }
        throw err;
      }

      const { token, korisnik } = response.data;
      if (!token || !korisnik) {
        throw new Error('Nevaljan login odgovor (nema tokena/korisnika)');
      }

      await SecureStore.setItemAsync('userToken', token);
      await SecureStore.setItemAsync('userData', JSON.stringify(korisnik));

      setUser(korisnik);
      setLoading(false);

      console.log('Pokrecem sync nakon logina...');
      syncAll().catch((err) => console.log('Background sync error:', err));
      startAutoSync();

      return { success: true };
    } catch (error) {
      console.error('Login greska:', error);
      setLoading(false);
      return {
        success: false,
        message: error.response?.data?.message || 'Greska pri prijavi',
      };
    }
  };

  const logout = async () => {
    try {
      setLoading(true);
      stopAutoSync();
      await SecureStore.deleteItemAsync('userToken');
      await SecureStore.deleteItemAsync('userData');
      resetDatabase();
      setUser(null);
    } catch (error) {
      console.error('Logout greska:', error);
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
