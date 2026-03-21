const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('./models/User');
const ChatRoom = require('./models/ChatRoom');
const { setupSoftDeleteRetentionJob } = require('./services/retentionService');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

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
app.use('/api/events', require('./routes/events'));
app.use('/api/chatrooms', require('./routes/chatrooms'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/simcards', require('./routes/simcards'));
app.use('/api/audit-logs', require('./routes/auditLogs'));
app.use('/api/superadmin', require('./routes/superadmin'));

// Socket.io setup
const activeUsers = new Map();

io.on('connection', async (socket) => {
  console.log(`🔌 Korisnik spojen: ${socket.id}`);

  // JWT autentifikacija u handshakeu
  try {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      socket.emit('auth-error', 'Nedostaje token');
      return socket.disconnect(true);
    }

    const decoded = jwt.verify(token.replace('Bearer ', ''), process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user || !user.aktivan) {
      socket.emit('auth-error', 'Korisnik nije aktivan');
      return socket.disconnect(true);
    }

    socket.userId = String(user._id);
    socket.companyId = String(user.companyId);
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
