import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { syncQueue } from '../database/db';

// Backend URL - produkcija na Render
const API_URL = 'https://appel-q97a.onrender.com/api';

// Axios instance sa default konfiguracijom
const api = axios.create({
  baseURL: API_URL,
  timeout: 30000, // 30 sekundi timeout za Render free tier
  headers: {
    'Content-Type': 'application/json',
  },
});

let refreshPromise = null;

// Request interceptor - dodaj JWT token (bez logiranja osjetljivih podataka)
api.interceptors.request.use(
  async (config) => {
    // Minimalni trace radi debug-a bez osjetljivih podataka
    console.log('🚀 Axios Request:', {
      method: config.method,
      url: config.url,
    });

    try {
      const token = await SecureStore.getItemAsync('userToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (err) {
      console.error('❌ Greška pri čitanju tokena iz SecureStore:', err.message);
    }

    return config;
  },
  (error) => {
    console.error('❌ Request interceptor error:', error.message);
    return Promise.reject(error);
  }
);

// Response interceptor - handle errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const isNetwork = !error.response;
    const status = error.response?.status;
    const method = error.config?.method?.toUpperCase();
    const endpoint = error.config?.url;

    // Standardiziraj error objekt (bez logiranja payload-a)
    const normalized = {
      status: status || 0,
      network: isNetwork,
      endpoint,
      method,
      message: error.response?.data?.message || error.message || 'Neuspješan zahtjev',
      raw: error.response?.data,
    };

    // 401: token istekao (osim offline demo) -> pokušaj refresh pa retry
    if (status === 401 && error.config && !error.config._retry) {
      const token = await SecureStore.getItemAsync('userToken');
      const isOffline = token && token.startsWith('offline_token_');
      if (!isOffline) {
        error.config._retry = true;
        if (!refreshPromise) {
          refreshPromise = (async () => {
            try {
              const storedRefresh = await SecureStore.getItemAsync('userRefreshToken');
              if (!storedRefresh) throw new Error('Nema refresh tokena');
              const res = await axios.post(`${API_URL}/auth/refresh`, { refreshToken: storedRefresh });
              const newAccess = res.data?.token;
              const newRefresh = res.data?.refreshToken;
              if (newAccess) await SecureStore.setItemAsync('userToken', newAccess);
              if (newRefresh) await SecureStore.setItemAsync('userRefreshToken', newRefresh);
              return newAccess;
            } finally {
              refreshPromise = null;
            }
          })();
        }
        try {
          const newToken = await refreshPromise;
          if (newToken) {
            error.config.headers = error.config.headers || {};
            error.config.headers.Authorization = `Bearer ${newToken}`;
            return api(error.config);
          }
        } catch (e) {
          // ako refresh padne, nastavi na sessionExpired flow
        }
      }
      try {
        await SecureStore.deleteItemAsync('userToken');
        await SecureStore.deleteItemAsync('userRefreshToken');
        await SecureStore.deleteItemAsync('userData');
      } catch (e) { /* ignore */ }
      normalized.sessionExpired = true;
      normalized.message = 'Vaša prijava je istekla. Molim prijavite se ponovno.';
    }

    // 403: nedovoljna prava - eksplicitna poruka
    if (status === 403) {
      normalized.message = 'Nedovoljna prava za ovu akciju.';
    }

    // Ako je network ili 5xx i radi se o mutaciji (POST/PUT/DELETE) -> offline queue
    if ((isNetwork || (status && status >= 500)) && ['POST','PUT','DELETE'].includes(method)) {
      try {
        syncQueue.add(method, endpoint, error.config?.data || '{}');
        return Promise.reject({ ...normalized, queued: true });
      } catch (qErr) {
        console.log('⚠️ Neuspješno spremanje u queue:', qErr.message);
      }
    }

    return Promise.reject(normalized);
  }
);

// Generic helper s fallback-om (opcionalno za ručnu upotrebu)
export const requestWithQueue = async (method, url, data = {}) => {
  try {
    const res = await api.request({ method, url, data });
    return { data: res.data, status: res.status, queued: false };
  } catch (err) {
    if (err.queued) {
      return { data: null, status: err.status, queued: true, message: err.message };
    }
    throw err; // Propagiraj normalizirani error ako nije queue slučaj
  }
};

// Auth API
export const authAPI = {
  login: (email, lozinka) => api.post('/auth/login', { email, lozinka }),
  register: (data) => api.post('/auth/register', data),
  getMe: () => api.get('/auth/me'),
};

// Elevators API
export const elevatorsAPI = {
  getAll: (params) => api.get('/elevators', { params }),
  getOne: (id) => api.get(`/elevators/${id}`),
  create: (data) => api.post('/elevators', data),
  update: (id, data) => api.put(`/elevators/${id}`, data),
  delete: (id) => api.delete(`/elevators/${id}`),
  remove: (id) => api.delete(`/elevators/${id}`), // alias radi kompatibilnosti
  getStats: () => api.get('/elevators/stats/overview'),
};

// Services API
export const servicesAPI = {
  getAll: (params) => api.get('/services', { params }),
  getOne: (id) => api.get(`/services/${id}`),
  create: (data) => api.post('/services', data),
  update: (id, data) => api.put(`/services/${id}`, data),
  delete: (id) => api.delete(`/services/${id}`),
  getMonthlyStats: (year, month) => api.get('/services/stats/monthly', { params: { year, month } }),
};

// Users API - Admin Management
export const usersAPI = {
  getAll: () => api.get('/users'),
  getLite: () => api.get('/users/lite'),
  getOne: (id) => api.get(`/users/${id}`),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  delete: (id) => api.delete(`/users/${id}`),
  resetPassword: (id, novaLozinka) => api.put(`/users/${id}/reset-password`, { novaLozinka }),
  getPassword: (id) => api.get(`/users/${id}/password`),
};

// Repairs API
export const repairsAPI = {
  getAll: (params) => api.get('/repairs', { params }),
  getOne: (id) => api.get(`/repairs/${id}`),
  create: (data) =>
    api.post('/repairs', {
      elevatorId: data.elevatorId || data.elevator,
      status: data.status || 'pending',
      datumPrijave: data.datumPrijave || data.reportedDate,
      datumPopravka: data.datumPopravka || data.repairedDate,
      opisKvara: data.opisKvara || data.faultDescription,
      opisPopravka: data.opisPopravka || data.repairDescription,
      // Označi "trebalo bi" ako klijent šalje bilo koji flag/alias
      trebaloBi: Boolean(
        data.trebaloBi || data.trebalo_bi || data.trebalobi || data.trebaloBI ||
        data.category === 'trebalo_bi' || data.category === 'trebalo-bi' || data.category === 'trebaloBi' || data.category === 'trebalo' ||
        data.type === 'trebalo_bi' || data.type === 'trebalo-bi' || data.type === 'trebaloBi' || data.type === 'trebalo'
      ),
      radniNalogPotpisan: typeof data.radniNalogPotpisan === 'boolean'
        ? data.radniNalogPotpisan
        : (typeof data.workOrderSigned === 'boolean' ? data.workOrderSigned : false),
      popravkaUPotpunosti: typeof data.popravkaUPotpunosti === 'boolean'
        ? data.popravkaUPotpunosti
        : (typeof data.repairCompleted === 'boolean' ? data.repairCompleted : false),
      napomene: data.napomene || data.notes,
      prijavio: data.prijavio || data.reportedBy,
      kontaktTelefon: data.kontaktTelefon || data.contactPhone,
      primioPoziv: data.primioPoziv || data.callReceivedBy,
    }),
  update: (id, data) =>
    api.put(`/repairs/${id}`, {
      status: data.status,
      opisKvara: data.opisKvara || data.faultDescription,
      opisPopravka: data.opisPopravka || data.repairDescription,
      datumPopravka: data.datumPopravka || data.repairedDate,
      trebaloBi: typeof data.trebaloBi === 'boolean' ? data.trebaloBi : undefined,
      radniNalogPotpisan: typeof data.radniNalogPotpisan === 'boolean'
        ? data.radniNalogPotpisan
        : (typeof data.workOrderSigned === 'boolean' ? data.workOrderSigned : undefined),
      popravkaUPotpunosti: typeof data.popravkaUPotpunosti === 'boolean'
        ? data.popravkaUPotpunosti
        : (typeof data.repairCompleted === 'boolean' ? data.repairCompleted : undefined),
      napomene: data.napomene || data.notes,
      prijavio: data.prijavio || data.reportedBy,
      kontaktTelefon: data.kontaktTelefon || data.contactPhone,
      primioPoziv: data.primioPoziv || data.callReceivedBy,
    }),
  delete: (id) => api.delete(`/repairs/${id}`),
  getStats: () => api.get('/repairs/stats/overview'),
  getMonthlyStats: (year, month) => api.get('/repairs/stats/monthly', { params: { year, month } }),
};

// ChatRooms API
export const chatroomsAPI = {
  getAll: () => api.get('/chatrooms'),
  getOne: (id) => api.get(`/chatrooms/${id}`),
  create: (data) => api.post('/chatrooms', data),
  update: (id, data) => api.put(`/chatrooms/${id}`, data),
  delete: (id) => api.delete(`/chatrooms/${id}`),
  addMember: (id, userId) => api.post(`/chatrooms/${id}/members`, { userId }),
  removeMember: (id, userId) => api.delete(`/chatrooms/${id}/members/${userId}`),
};

// Messages API
export const messagesAPI = {
  getByRoom: (roomId, params) => api.get(`/messages/room/${roomId}`, { params }),
  send: (data) =>
    api.post('/messages', {
      chatRoomId: data.chatRoomId || data.chatRoom,
      tekst: data.tekst || data.content,
      slika: data.slika || data.imageUrl,
    }),
  markAsRead: (id) => api.put(`/messages/${id}/read`),
  delete: (id) => api.delete(`/messages/${id}`),
  getUnreadCount: () => api.get('/messages/unread/count'),
};

// SimCards API
export const simcardsAPI = {
  getAll: (params) => api.get('/simcards', { params }),
  getOne: (id) => api.get(`/simcards/${id}`),
  create: (data) =>
    api.post('/simcards', {
      serijaSimKartice: data.serijaSimKartice || data.serial || data.series,
      brojTelefona: data.brojTelefona || data.phoneNumber,
      vrstaUredaja: data.vrstaUredaja || data.deviceType,
      datumIsteka: data.datumIsteka || data.expiryDate,
      aktivna: typeof data.aktivna === 'boolean' ? data.aktivna : data.status !== 'inactive',
      elevatorId: data.elevatorId || data.assignedTo,
      napomene: data.napomene || data.notes,
    }),
  update: (id, data) =>
    api.put(`/simcards/${id}`, {
      serijaSimKartice: data.serijaSimKartice || data.serial || data.series,
      brojTelefona: data.brojTelefona || data.phoneNumber,
      vrstaUredaja: data.vrstaUredaja || data.deviceType,
      datumIsteka: data.datumIsteka || data.expiryDate,
      aktivna: typeof data.aktivna === 'boolean' ? data.aktivna : data.status !== 'inactive',
      elevatorId: data.elevatorId || data.assignedTo,
      napomene: data.napomene || data.notes,
    }),
  delete: (id) => api.delete(`/simcards/${id}`),
  getExpiringSoon: (days) => api.get('/simcards/expiring/soon', { params: { days } }),
  getStats: () => api.get('/simcards/stats/overview'),
};

export default api;
