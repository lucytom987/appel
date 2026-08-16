const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const User = require('./models/User');
const ChatRoom = require('./models/ChatRoom');
const { setupSoftDeleteRetentionJob } = require('./services/retentionService');

dotenv.config();

const configuredOrigins = String(process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowAnyOrigin = configuredOrigins.length === 0 || configuredOrigins.includes('*');

const corsOptions = {
  origin: (origin, callback) => {
    if (allowAnyOrigin || !origin || configuredOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
};

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowAnyOrigin ? true : configuredOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

// CORS mora biti PRIJE rate limitera da 429 odgovor ima CORS headere
app.use(cors(corsOptions));

// Security middleware
app.use(helmet());

const parsePositiveInt = (value, fallback) => {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const GENERAL_RATE_LIMIT_WINDOW_MS = parsePositiveInt(process.env.API_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000);
const GENERAL_RATE_LIMIT_MAX = parsePositiveInt(process.env.API_RATE_LIMIT_MAX, 300);
const AUTH_RATE_LIMIT_WINDOW_MS = parsePositiveInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 5 * 60 * 1000);
const AUTH_RATE_LIMIT_MAX = parsePositiveInt(process.env.AUTH_RATE_LIMIT_MAX, 5);

// Rate limiting - opća zaštita
const generalLimiter = rateLimit({
  windowMs: GENERAL_RATE_LIMIT_WINDOW_MS,
  max: GENERAL_RATE_LIMIT_MAX,
  message: { message: 'Previše zahtjeva, pokušajte ponovo za 15 minuta' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', generalLimiter);

// Strogi rate limit za login/register (zaštita od brute force)
const authKeyGenerator = (req) => ipKeyGenerator(req);
const authLimiter = rateLimit({
  windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
  max: AUTH_RATE_LIMIT_MAX,
  message: { message: 'Previše pokušaja prijave, pokušajte ponovo za 5 minuta' },
  keyGenerator: authKeyGenerator,
  skipSuccessfulRequests: true, // broji samo neuspješne pokušaje (4xx/5xx)
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/public-register', authLimiter);

// Uspješan login resetira brojač pokušaja za isti ključ (IP)
app.use('/api/auth/login', (req, res, next) => {
  res.on('finish', () => {
    if (res.statusCode < 400) {
      authLimiter.resetKey(authKeyGenerator(req));
    }
  });
  next();
});

const jsonBodyLimit = process.env.JSON_BODY_LIMIT || '25mb';
app.use(express.json({ limit: jsonBodyLimit }));
app.use(express.urlencoded({ limit: jsonBodyLimit, extended: true }));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('✅ MongoDB povezan');
    setupSoftDeleteRetentionJob();
  })
  .catch((err) => console.error('❌ MongoDB greška:', err));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/company', require('./routes/company'));
app.use('/api/users', require('./routes/users'));
app.use('/api/elevators', require('./routes/elevators'));
app.use('/api/services', require('./routes/services'));
app.use('/api/repairs', require('./routes/repairs'));
app.use('/api/work-orders', require('./routes/workOrders'));
app.use('/api/service-work-orders', require('./routes/serviceWorkOrders'));
app.use('/api/events', require('./routes/events'));
app.use('/api/app', require('./routes/app'));
app.use('/api/chatrooms', require('./routes/chatrooms'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/simcards', require('./routes/simcards'));
app.use('/api/audit-logs', require('./routes/auditLogs'));
app.use('/api/superadmin', require('./routes/superadmin'));

// Socket.io setup
const activeUsers = new Map();

io.on('connection', async (socket) => {
  console.log(`🔌 Korisnik spojen: ${socket.id}`);

  const hasValidSocketSession = () => {
    const exp = Number(socket.tokenExp || 0);
    if (!exp) return true;
    return (Date.now() / 1000) < exp;
  };

  // JWT autentifikacija u handshakeu
  try {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      socket.emit('auth-error', 'Nedostaje token');
      return socket.disconnect(true);
    }

    const decoded = jwt.verify(token.replace('Bearer ', ''), process.env.JWT_SECRET);
    if (decoded?.type === 'refresh') {
      socket.emit('auth-error', 'Neispravan tip tokena');
      return socket.disconnect(true);
    }
    const user = await User.findById(decoded.userId);

    if (!user || !user.aktivan) {
      socket.emit('auth-error', 'Korisnik nije aktivan');
      return socket.disconnect(true);
    }

    socket.userId = String(user._id);
    socket.companyId = String(user.companyId);
    socket.tokenExp = decoded?.exp;
    activeUsers.set(socket.userId, socket.id);
    console.log(`✅ Auth socket: ${user.email} (${socket.userId})`);
  } catch (err) {
    console.log('❌ Socket auth fail:', err.message);
    socket.emit('auth-error', 'Nevažeći token');
    return socket.disconnect(true);
  }

  // Join chat room
  socket.on('join-room', async (roomId) => {
    if (!socket.userId || !socket.companyId) return;
    if (!hasValidSocketSession()) {
      socket.emit('auth-error', 'Sesija je istekla');
      return socket.disconnect(true);
    }
    try {
      const room = await ChatRoom.findOne({ _id: roomId, companyId: socket.companyId }).select('_id');
      if (!room) {
        socket.emit('chat-error', 'Chat soba nije pronađena u vašoj firmi');
        return;
      }
      socket.join(`room-${roomId}`);
      console.log(`📍 Korisnik ${socket.userId} pridružen room-${roomId}`);
    } catch (error) {
      socket.emit('chat-error', 'Greška pri ulasku u chat sobu');
    }
  });

  // Send message
  socket.on('send-message', async (data) => {
    if (!socket.userId || !socket.companyId) return;
    if (!hasValidSocketSession()) {
      socket.emit('auth-error', 'Sesija je istekla');
      return socket.disconnect(true);
    }
    const { roomId, message } = data;
    try {
      const room = await ChatRoom.findOne({ _id: roomId, companyId: socket.companyId }).select('_id');
      if (!room) {
        socket.emit('chat-error', 'Chat soba nije pronađena u vašoj firmi');
        return;
      }
    } catch (error) {
      socket.emit('chat-error', 'Greška pri slanju poruke');
      return;
    }

    io.to(`room-${roomId}`).emit('new-message', {
      senderId: socket.userId,
      message,
      timestamp: new Date()
    });
  });

  // Disconnect
  socket.on('disconnect', () => {
    if (socket.userId) {
      activeUsers.delete(socket.userId);
    }
    console.log(`🔌 Korisnik odspojen: ${socket.id}`);
  });
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ message: 'APPEL Backend - Elevator Service API v2.0' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.message);
  res.status(err.status || 500).json({
    message: err.message || 'Greška na serveru',
    error: process.env.NODE_ENV === 'development' ? err : undefined
  });
});

const PORT = process.env.PORT || 5000;
const HOST = process.env.NODE_ENV === 'development' ? 'localhost' : '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`🚀 APPEL Backend pokrenut na portu ${PORT}`);
  console.log(`📍 Okruženje: ${process.env.NODE_ENV || 'development'}`);
  if (process.env.NODE_ENV === 'production') {
    console.log(`🌐 Backend je online i dostupan!`);
  }
});

module.exports = { app, io };
