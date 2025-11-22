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

// Request interceptor - dodaj JWT token
api.interceptors.request.use(
  async (config) => {
    console.log('🚀 Axios Request:', {
      method: config.method,
      url: config.url,
      baseURL: config.baseURL,
      fullURL: `${config.baseURL}${config.url}`,
      data: config.data, // LOG REQUEST BODY
    });
    
    try {
      const token = await SecureStore.getItemAsync('userToken');
      console.log('🔑 Token fetch attempt:', {
        tokenExists: !!token,
        tokenType: token ? (token.startsWith('offline_token_') ? 'OFFLINE' : 'ONLINE') : 'NONE',
        tokenPreview: token ? token.substring(0, 30) + '...' : 'NE',
      });
      
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
        console.log('✅ Token dodan u Authorization header');
      } else {
        console.warn('⚠️ Token nije pronađen u SecureStore!');
      }
    } catch (err) {
      console.error('❌ Greška pri čitanju tokena iz SecureStore:', err);
    }
    
    return config;
  },
  (error) => {
    console.error('❌ Request interceptor error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor - handle errors
api.interceptors.response.use(
  (response) => {
    console.log('✅ Axios Response:', {
      status: response.status,
      statusText: response.statusText,
      dataType: typeof response.data,
    });
    return response;
  },
  async (error) => {
    const isNetwork = !error.response;
    const status = error.response?.status;
    const method = error.config?.method?.toUpperCase();
    const endpoint = error.config?.url;

    console.error('❌ Axios Response Error:', {
      network: isNetwork,
      message: error.message,
      status,
      endpoint,
      method,
    });

    // Standardiziraj error objekt
    const normalized = {
      status: status || 0,
      network: isNetwork,
      endpoint,
      method,
      message: error.response?.data?.message || error.message || 'Neuspješan zahtjev',
      raw: error.response?.data,
    };

    // 401: token istekao (osim offline demo)
    if (status === 401) {
      const token = await SecureStore.getItemAsync('userToken');
      if (token && token.startsWith('offline_token_')) {
        console.log('⚠️ Offline token (demo) - ne brišem');
      } else {
        await SecureStore.deleteItemAsync('userToken');
        await SecureStore.deleteItemAsync('userData');
        console.log('🔓 Token uklonjen (401)');
      }
    }

    // 403: nedovoljna prava - eksplicitna poruka
    if (status === 403) {
      normalized.message = 'Nedovoljna prava za ovu akciju.';
    }

    // Ako je network ili 5xx i radi se o mutaciji (POST/PUT/DELETE) -> offline queue
    if ((isNetwork || (status && status >= 500)) && ['POST','PUT','DELETE'].includes(method)) {
      try {
        syncQueue.add(method, endpoint, error.config?.data || '{}');
        console.log('🗂️ Zahtjev dodan u offline queue:', { method, endpoint });
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
  getAll: () => api.get('/elevators'),
  getOne: (id) => api.get(`/elevators/${id}`),
  create: (data) => api.post('/elevators', data),
  update: (id, data) => api.put(`/elevators/${id}`, data),
  delete: (id) => api.delete(`/elevators/${id}`),
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
  create: (data) => api.post('/repairs', data),
  update: (id, data) => api.put(`/repairs/${id}`, data),
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
  send: (data) => api.post('/messages', data),
  markAsRead: (id) => api.put(`/messages/${id}/read`),
  delete: (id) => api.delete(`/messages/${id}`),
  getUnreadCount: () => api.get('/messages/unread/count'),
};

// SimCards API
export const simcardsAPI = {
  getAll: (params) => api.get('/simcards', { params }),
  getOne: (id) => api.get(`/simcards/${id}`),
  create: (data) => api.post('/simcards', data),
  update: (id, data) => api.put(`/simcards/${id}`, data),
  delete: (id) => api.delete(`/simcards/${id}`),
  getExpiringSoon: (days) => api.get('/simcards/expiring/soon', { params: { days } }),
  getStats: () => api.get('/simcards/stats/overview'),
};

export default api;
