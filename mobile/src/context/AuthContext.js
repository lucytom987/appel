import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { authAPI, companyAPI, API_URL } from '../services/api';
import { initDatabase, resetDatabase, elevatorDB, serviceDB, repairDB } from '../database/db';
import {
  syncAll,
  startAutoSync,
  stopAutoSync,
  subscribeToNetworkChanges,
  checkOnlineStatus,
  primeFullSync,
} from '../services/syncService';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(false);
  const [serverAwake, setServerAwake] = useState(null); // null = nepoznato, false = spava, true = spreman
  const [companySetupRequired, setCompanySetupRequired] = useState(false); // Trebam li popuniti podatke firme?
  const serverProbeRef = useRef(null);
  const userRef = useRef(null);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    initializeApp();

    const unsubscribe = subscribeToNetworkChanges((online) => {
      setIsOnline(online);
      console.log(online ? 'Online' : 'Offline');
      if (online) {
        wakeBackendAndSync(Boolean(userRef.current));
      } else {
        setServerAwake(false);
      }
    });

    return () => {
      unsubscribe();
      stopAutoSync();
      stopServerProbe();
    };
  }, []);

  const HEALTH_URL = API_URL.replace(/\/api\/?$/, '/');
  const SERVER_PING_TIMEOUT = 4000;

  const stopServerProbe = () => {
    if (serverProbeRef.current) {
      clearInterval(serverProbeRef.current);
      serverProbeRef.current = null;
    }
  };

  const pingBackend = async () => {
    try {
      const onlineNow = await checkOnlineStatus();
      setIsOnline(onlineNow);
      if (!onlineNow) {
        setServerAwake(false);
        return false;
      }

      const res = await axios.get(HEALTH_URL, { timeout: SERVER_PING_TIMEOUT });
      const ok = res?.status && res.status < 500;
      setServerAwake(ok);
      return ok;
    } catch (err) {
      setServerAwake(false);
      return false;
    }
  };

  const scheduleServerProbe = (shouldSyncAfterWake = false) => {
    if (serverProbeRef.current) return;
    serverProbeRef.current = setInterval(async () => {
      const awake = await pingBackend();
      if (awake) {
        stopServerProbe();
        if (shouldSyncAfterWake) {
          syncAll().catch((err) => console.log('Background sync error:', err?.message || err));
          startAutoSync();
        }
      }
    }, 7000);
  };

  const wakeBackendAndSync = async (shouldSyncAfterWake = false) => {
    const awake = await pingBackend();
    if (awake) {
      if (shouldSyncAfterWake) {
        syncAll().catch((err) => console.log('Background sync error:', err?.message || err));
        startAutoSync();
      }
    } else if (shouldSyncAfterWake) {
      scheduleServerProbe(true);
    }
  };

  const initializeApp = async () => {
    try {
      // App.js već zove initDatabase; ovdje preskačemo dupli poziv
      console.log('Preskačem initDatabase u AuthContext (već inicijalizirano)');

      const online = await checkOnlineStatus();
      setIsOnline(online);
      setServerAwake(online ? null : false);

      const token = await SecureStore.getItemAsync('userToken');
      const userData = await SecureStore.getItemAsync('userData');

      console.log('Provjera auto-login:', {
        tokenExists: !!token,
        tokenPreview: token ? token.substring(0, 20) + '...' : 'NE',
        userDataExists: !!userData,
      });

      if (token && userData) {
        setUser(JSON.parse(userData));

        try {
          const localElevators = elevatorDB.getAll?.() || [];
          const localServices = serviceDB.getAll?.() || [];
          const localRepairs = repairDB.getAll?.() || [];
          if (!localElevators.length && !localServices.length && !localRepairs.length) {
            await primeFullSync();
            console.log('Local cache empty - forced full sync');
          }
        } catch (e) {
          console.log('Local cache check failed:', e?.message);
        }

        // Backend wake-up i sync idu u pozadini da se UI ne blokira na cold start-u
        wakeBackendAndSync(true);
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
        // 429 = rate limit - prikaži poruku s backend-a
        if (status === 429) {
          setLoading(false);
          return { success: false, message: err.response?.data?.message || 'Previše pokušaja prijave. Pokušajte ponovo za 1 sat.' };
        }
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

      const { token, refreshToken, korisnik } = response.data;
      if (!token || !korisnik) {
        throw new Error('Nevaljan login odgovor (nema tokena/korisnika)');
      }

      await SecureStore.setItemAsync('userToken', token);
      if (refreshToken) {
        await SecureStore.setItemAsync('userRefreshToken', refreshToken);
      }
      await SecureStore.setItemAsync('userData', JSON.stringify(korisnik));

      setUser(korisnik);

      // Ako je admin, provjeri je li firma "setup"
      if (korisnik.uloga === 'admin') {
        try {
          const setupStatus = await companyAPI.checkSetupStatus();
          setCompanySetupRequired(!setupStatus.data?.isSetup);
          console.log('✅ Company setup status:', setupStatus.data?.isSetup);
        } catch (setupError) {
          const status = setupError?.response?.status;
          const is404 = status === 404 || String(setupError?.message || '').includes('404');
          if (is404) {
            try {
              const companyResponse = await companyAPI.getInfo();
              const companyData = companyResponse.data?.data || companyResponse.data || {};
              const isSetup = Boolean(
                companyData?.naziv?.trim() && companyData?.adresa?.trim() && companyData?.email?.trim()
              );
              setCompanySetupRequired(!isSetup);
              console.log('ℹ️ setup-status endpoint ne postoji, fallback na /company:', isSetup);
            } catch (fallbackError) {
              console.error('⚠️ Fallback setup provjera nije uspjela:', fallbackError.message);
              setCompanySetupRequired(true);
            }
          } else {
            console.error('⚠️ Greška pri provjeri setup statusa:', setupError.message);
            // Ako nema konekcije ili je server problem, ostavi setup required=true
            setCompanySetupRequired(true);
          }
        }
      } else {
        setCompanySetupRequired(false);
      }

      setLoading(false);

      console.log('Provjera backend statusa nakon logina...');
      wakeBackendAndSync(true);

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

  const register = async (data) => {
    try {
      setLoading(true);
      console.log('Pokušavam registraciju...', data.email);

      let response;
      try {
        response = await authAPI.publicRegister(data);
      } catch (err) {
        const status = err.response?.status || err.status;
        const networkProblem = !err.response && !err.status || status === 502 || status === 503;
        if (networkProblem) {
          setLoading(false);
          return { success: false, message: 'Server trenutno nije dostupan. Pokušajte ponovo.' };
        }
        setLoading(false);
        return {
          success: false,
          message: err.response?.data?.message || err.message || 'Greška pri registraciji',
        };
      }

      const { token, refreshToken, korisnik } = response.data;
      if (!token || !korisnik) {
        throw new Error('Nevaljan registracijski odgovor');
      }

      await SecureStore.setItemAsync('userToken', token);
      if (refreshToken) {
        await SecureStore.setItemAsync('userRefreshToken', refreshToken);
      }
      await SecureStore.setItemAsync('userData', JSON.stringify(korisnik));

      setUser(korisnik);
      setCompanySetupRequired(true); // Nova firma uvijek treba setup
      setLoading(false);

      wakeBackendAndSync(true);

      return { success: true };
    } catch (error) {
      console.error('Register greška:', error);
      setLoading(false);
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Greška pri registraciji',
      };
    }
  };

  const logout = async () => {
    try {
      setLoading(true);
      stopAutoSync();
      stopServerProbe();
      await SecureStore.deleteItemAsync('userToken');
      await SecureStore.deleteItemAsync('userRefreshToken');
      await SecureStore.deleteItemAsync('userData');
      resetDatabase();
      setUser(null);
      setCompanySetupRequired(false);
      setServerAwake(null);
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
    serverAwake,
    companySetupRequired,
    setCompanySetupRequired,
    login,
    register,
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
