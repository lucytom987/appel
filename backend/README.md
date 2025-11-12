# APPEL Backend - Elevator Service API

Potpuno novi, čist backend API za APPEL aplikaciju - offline-first elevator service management.

## ✅ Što je implementirano

### 🗄️ Database Modeli (MongoDB)
- **User** - Korisnici sa ulogama (admin, manager, technician)
- **Elevator** - Dizala sa lokacijama, statusima, GPS koordinatama
- **Service** - Servisni radovi sa checklistama
- **Repair** - Popravci/kvarovi sa prioritetima i statusima
- **ChatRoom** - Chat sobe
- **Message** - Poruke u chat sobama
- **SimCard** - SIM kartice dodjeljene dizalima
- **AuditLog** - Audit trail svih akcija

### 🌐 API Endpoints

#### Auth (`/api/auth`)
- `POST /login` - Prijava korisnika
- `POST /register` - Registracija (admin only)
- `GET /me` - Trenutni korisnik

#### Elevators (`/api/elevators`)
- `GET /` - Sva dizala (offline sync)
- `GET /stats/overview` - Statistika dizala
- `GET /:id` - Jedno dizalo
- `POST /` - Kreiraj dizalo (admin/manager)
- `PUT /:id` - Ažuriraj dizalo (admin/manager)
- `DELETE /:id` - Obriši dizalo (admin only)

#### Services (`/api/services`)
- `GET /` - Svi servisi (sa filterima: elevatorId, status, date range, technician)
- `GET /stats/monthly` - Statistika servisa po mjesecu
- `GET /:id` - Jedan servis
- `POST /` - Kreiraj servis
- `PUT /:id` - Ažuriraj servis
- `DELETE /:id` - Obriši servis (admin only)

#### Repairs (`/api/repairs`)
- `GET /` - Svi popravci (sa filterima: elevatorId, status, priority, date range)
- `GET /stats/overview` - Pregled popravaka
- `GET /stats/monthly` - Statistika po mjesecu
- `GET /:id` - Jedan popravak
- `POST /` - Kreiraj popravak (prijavi kvar)
- `PUT /:id` - Ažuriraj popravak (promijeni status)
- `DELETE /:id` - Obriši popravak (admin only)

#### Chat Rooms (`/api/chatrooms`)
- `GET /` - Sve chat sobe
- `GET /:id` - Jedna chat soba
- `POST /` - Kreiraj sobu (admin/manager)
- `PUT /:id` - Ažuriraj sobu (admin/manager)
- `DELETE /:id` - Obriši sobu (admin only)
- `POST /:id/members` - Dodaj člana (admin/manager)
- `DELETE /:id/members/:userId` - Ukloni člana (admin/manager)

#### Messages (`/api/messages`)
- `GET /unread/count` - Broj nepročitanih poruka
- `GET /room/:roomId` - Sve poruke u sobi (sa pagination)
- `POST /` - Pošalji poruku
- `PUT /:id/read` - Označi kao pročitanu
- `DELETE /:id` - Obriši poruku (sender ili admin)

#### SIM Cards (`/api/simcards`)
- `GET /` - Sve SIM kartice (sa filterima: status, provider)
- `GET /expiring/soon` - Kartice koje ističu uskoro (7 dana)
- `GET /stats/overview` - Statistika SIM kartica
- `GET /:id` - Jedna SIM kartica
- `POST /` - Kreiraj SIM karticu (admin/manager)
- `PUT /:id` - Ažuriraj SIM karticu (admin/manager)
- `DELETE /:id` - Obriši SIM karticu (admin only)

#### Audit Logs (`/api/audit-logs`)
- `GET /` - Svi audit logovi (admin/manager) - sa filterima
- `GET /user/:userId` - Aktivnosti korisnika (admin/manager)
- `GET /entity/:entityType/:entityId` - Aktivnosti na entitetu (admin/manager)
- `GET /stats/activity` - Statistika aktivnosti (admin/manager)
- `GET /:id` - Jedan audit log (admin/manager)
- `DELETE /cleanup` - Očisti stare logove (admin only)

### 🔒 Authentication & Authorization
- JWT token autentifikacija
- Role-based access control (admin, manager, technician)
- Audit logging za sve CREATE/UPDATE/DELETE akcije

### 🔌 Real-time Features (Socket.io)
- Chat sobe sa real-time porukama
- Online/offline korisnici tracking
- `authenticate` event za povezivanje korisnika
- `join-room` event za pridruživanje sobi
- `send-message` event za slanje poruka
- `new-message` event za primanje poruka

## 🚀 Pokretanje

### Instalacija dependencies
```powershell
cd C:\Users\vidac\appel\backend
npm install
```

### Konfiguracija (.env)
Kopiraj `.env` i postavi:
```
MONGODB_URI=mongodb+srv://...
JWT_SECRET=tvoj-tajni-kljuc
PORT=5000
NODE_ENV=development
CORS_ORIGIN=*
```

### Pokretanje servera
```powershell
# Development mod (sa nodemon)
npm run dev

# Production mod
npm start
```

Server će se pokrenuti na `http://localhost:5000`

## 📦 Tech Stack
- **Express.js** - Web framework
- **MongoDB + Mongoose** - Baza podataka
- **Socket.io** - Real-time komunikacija
- **JWT** - Autentifikacija
- **bcryptjs** - Hash lozinki
- **express-validator** - Validacija inputa

## 📝 Sljedeći koraci

1. ✅ Backend API - GOTOVO!
2. ⏳ Mobile aplikacija (React Native / Expo)
   - SQLite offline baza
   - Sync mehanizam
   - UI/UX dizajn
3. ⏳ Testing
4. ⏳ Deployment

## 🔧 Development Tips

### Testiranje API-ja sa Postman/Thunder Client

**Login:**
```
POST http://localhost:5000/api/auth/login
Body: { "email": "admin@appel.com", "lozinka": "password123" }
```

**Dohvati sva dizala:**
```
GET http://localhost:5000/api/auth/elevators
Headers: Authorization: Bearer <token>
```

### Kreiranje prvog admin korisnika (ručno u MongoDB)
```javascript
{
  "ime": "Admin",
  "prezime": "User",
  "email": "admin@appel.com",
  "lozinka": "$2a$10$...", // hash od "password123"
  "uloga": "admin",
  "aktivan": true
}
```

---

**Autor:** APPEL Development Team  
**Verzija:** 2.0.0 (Nov 2025)  
**Status:** ✅ Backend Ready - čeka mobilnu aplikaciju
