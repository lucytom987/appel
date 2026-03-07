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
└── mobile/            ✅ React Native + Expo + SQLite
    ├── src/
    │   ├── screens/   ✅ 18 UI zaslona
    │   ├── services/  ✅ Offline sync + SQLite
    │   ├── context/   ✅ Auth state management
    │   ├── database/  ✅ SQLite wrapper
    │   └── components/✅ Reusable komponente
    ├── android/       ✅ Native Android build setup
    └── app.config.js  ✅ Expo config
```

## ✅ Status: Backend & Mobile Ready

### Implementirano:

**Backend:**
- ✅ MongoDB modeli (User, Elevator, Service, Repair, ChatRoom, Message, SimCard, AuditLog)
- ✅ API endpoints za sve operacije (CRUD + statistika)
- ✅ JWT autentifikacija + role-based access control
- ✅ Socket.io za real-time chat
- ✅ Audit logging za sve akcije
- ✅ Filteri, pagination, sorting
- ✅ Deployed na Render.com

**Mobile (React Native + Expo):**
- ✅ SQLite offline baza
- ✅ Sync mehanizam (offline → online)
- ✅ UI/UX zasloni (18 screens)
- ✅ Google Maps integracija
- ✅ Real-time chat
- ✅ Service duplicate prevention
- ✅ Elevator recovery system (soft-delete + restore)
- ✅ Keyboard handling fixes
- ✅ APK build za Android (Gradle)

### Sljedeći koraci:
1. 🚀 Google Play Store deployment
2. 📱 iOS build (opciono)
3. 🔄 Over-the-air (OTA) updates setup

## 🚀 Pokretanje

### Backend server:
```powershell
cd backend
npm install
npm run dev
```

Server će biti na `http://localhost:5000`

### Mobile app:
```powershell
cd mobile
npm install
npx expo start

# Za Android build (release APK):
cd android
.\gradlew.bat assembleRelease

# Za Google Play Store (AAB):
.\gradlew.bat bundleRelease
```

Vidi [DEPLOYMENT.md](./DEPLOYMENT.md) za kompletnu build proceduru.

## 📚 Dokumentacija

- [Backend README](./backend/README.md) - API endpoints, modeli, autentifikacija
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Backend deployment (Render) + Mobile build procedure
- [GOOGLE_PLAY_STORE.md](./GOOGLE_PLAY_STORE.md) - Kompletni guide za Google Play Store objavu
- [PLAY_STORE_SETUP.md](./PLAY_STORE_SETUP.md) - Quick start guide za Play Store
- [PRIVACY_POLICY.md](./PRIVACY_POLICY.md) - Privacy Policy (EN/HR) za app store
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

**Verzija:** 1.2.1  
**Datum:** Ožujak 2026  
**Status:** Backend ✅ | Mobile ✅ | Google Play Store 🚀
