import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

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
      data: response.data,
    });
    return response;
  },
  async (error) => {
    console.error('❌ Axios Response Error:', {
      message: error.message,
      code: error.code,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      config: {
        url: error.config?.url,
        method: error.config?.method,
        baseURL: error.config?.baseURL,
      }
    });
    
    if (error.response?.status === 401) {
      console.log('🔓 401 Unauthorized - provjeriavam token tip');
      // Token je istekao - ali ako je offline token, NE briši ga
      const token = await SecureStore.getItemAsync('userToken');
      if (token && token.startsWith('offline_token_')) {
        console.log('⚠️ Offline token - ne brišem jer je to demo korisnik');
        // NE briši offline token - korisnik je u offline modu
      } else {
        console.log('🔓 Brisanje online tokena jer je istekao');
        await SecureStore.deleteItemAsync('userToken');
        await SecureStore.deleteItemAsync('userData');
      }
    }
    return Promise.reject(error);
  }
);

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
