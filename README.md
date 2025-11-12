# APPEL - Elevator Service Management App

**Offline-first elevator service management aplikacija** za servisere dizala.

## 📋 Projekt Overview

APPEL je aplikacija za upravljanje servisiranjem i popravcima dizala sa:
- ✅ **Offline-first** pristup - radi bez interneta
- ✅ **Real-time sync** - automatska sinkronizacija
- ✅ **Multi-user** - do 20 korisnika istovremeno
- ✅ **GPS tracking** - prikaz dizala na mapi
- ✅ **Statistika** - servisi i popravci po mjesecima
- ✅ **Chat** - grupna komunikacija
- ✅ **Audit log** - puna evidencija akcija

## 🏗️ Arhitektura

```
appel/
├── backend/           ✅ Node.js + Express + MongoDB + Socket.io
│   ├── models/        ✅ 8 Mongoose modela (User, Elevator, Service, Repair, ...)
│   ├── routes/        ✅ 7 API ruta (auth, elevators, services, repairs, ...)
│   ├── middleware/    ✅ JWT autentifikacija + Role-based access
│   ├── services/      ✅ Audit logging
│   └── server.js      ✅ Express server sa Socket.io
│
└── mobile/            ⏳ React Native + Expo + SQLite (čeka se)
    ├── src/
    │   ├── screens/   ⏳ UI zasloni
    │   ├── services/  ⏳ Offline sync + SQLite
    │   ├── context/   ⏳ State management
    │   └── components/⏳ Reusable komponente
    └── app.json       ⏳ Expo config
```

## ✅ Status: Backend Ready

### Implementirano:
- ✅ MongoDB modeli (User, Elevator, Service, Repair, ChatRoom, Message, SimCard, AuditLog)
- ✅ API endpoints za sve operacije (CRUD + statistika)
- ✅ JWT autentifikacija + role-based access control
- ✅ Socket.io za real-time chat
- ✅ Audit logging za sve akcije
- ✅ Filteri, pagination, sorting
- ✅ Server pokrenut i testiran

### Sljedeći koraci:
1. ⏳ Kreirati mobilnu aplikaciju (React Native + Expo)
2. ⏳ Implementirati SQLite offline bazu
3. ⏳ Sync mehanizam (offline → online)
4. ⏳ UI/UX zasloni
5. ⏳ Testing i debugging
6. ⏳ APK build za Android

## 🚀 Pokretanje

### Backend server:
```powershell
cd backend
npm install
npm run dev
```

Server će biti na `http://localhost:5000`

### Mobile app (kada bude kreirana):
```powershell
cd mobile
npm install
npx expo start
```

## 📚 Dokumentacija

- [Backend README](./backend/README.md) - API endpoints, modeli, autentifikacija
- [SPECIFICATION.md](./SPECIFICATION.md) - Puna specifikacija projekta
- [CONVERSATION_TRANSCRIPT.md](./CONVERSATION_TRANSCRIPT.md) - Sažetak konverzacije

## 🔧 Tech Stack

### Backend:
- Node.js + Express.js
- MongoDB + Mongoose
- Socket.io (real-time)
- JWT (autentifikacija)
- bcryptjs (lozinke)

### Mobile (planirano):
- React Native + Expo
- SQLite (offline baza)
- AsyncStorage (cache)
- React Navigation
- Axios (API pozivi)

## 👥 Korisničke uloge

- **Admin** - Puni pristup (kreiranje korisnika, brisanje)
- **Manager** - Upravljanje servisima, popravcima, chat sobama
- **Technician** - Kreiranje servisa, popravaka, chat

## 📊 Core Features

### Dizala
- Baza podataka sa 300-500 dizala
- GPS koordinate za mapu
- Status tracking (active, out_of_order, maintenance)
- Povezanost sa SIM karticama

### Servisiranje
- Kreiranje servisa sa checklistama
- Logiranje izvršenih radova
- Fotografije prije/poslije
- Automatsko ažuriranje zadnjeg servisa

### Popravci
- Prijava kvarova sa prioritetima
- Status tracking (pending, in_progress, completed)
- Opis kvara + popravka
- Radni nalog + potpis

### Chat
- Grupni chat sobe
- Kreiranje novih soba
- Real-time poruke (Socket.io)
- Notifikacije o novim porukama

### Statistika
- Servisi po mjesecu
- Popravci po mjesecu
- Koliko dizala treba servisirat
- SIM kartice koje ističu

### Mapa
- Prikaz svih dizala na Google Maps
- Trenutna lokacija korisnika
- Zoom na 20x20m
- Prikazivanje šifre za ulaz u zgradu

## 📝 Licenca

Proprietary - APPEL Development Team

---

**Verzija:** 2.0.0  
**Datum:** Studeni 2025  
**Status:** Backend ✅ | Mobile ⏳
