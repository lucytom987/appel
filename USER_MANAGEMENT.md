# 👥 User Management System - Dokumentacija

## Pregled

APPEL aplikacija sada ima kompletan sistem za upravljanje korisnicima sa role-based access control (RBAC). Administrator može upravljati svim korisnicima, dodijeliti nivoe pristupa i resetirati lozinke.

## 🔐 Tri Nivoa Pristupa

### 1. **Serviser** (Osnovni pristup)
- Može **dodavati** nove servise
- Može **dodavati** nove popravke  
- Može **brisati** servise i popravke
- **Ne može** pristupiti User Management (upravljanju korisnicima)
- **Ne može** editirati podatke u bazi

### 2. **Menadžer** (Napredni pristup)
- Sve što **Serviser** može
- Može **editirati bazu podataka** (elevatore, servise, popravke)
- Može **brisati** podatke iz baze
- **Ne može** upravljati korisnicima

### 3. **Administrator** (Puni pristup)
- Sve što **Menadžer** može
- Može **upravljati korisnicima** (dodati, editirati, brisati)
- Može **dodijeliti nivoe pristupa**
- Može **resetirati lozinke** korisnicima
- Može **vidjeti** privremenu lozinku nakon resetiranja

## 🚀 Kako Koristiti

### Prijava
```
Email: admin@appel.com
Lozinka: admin123
```

Ili koristi demo korisnike:
```
Menadžer: menadzer@appel.com / menadzer123
Serviser: serviser@appel.com / serviser123
```

### Pristup User Management-u

1. **Prijavite se kao Administrator**
2. Idite na **Početnu stranicu (Home)**
3. Idite do sekcije **Administracija**
4. Kliknite na **"Upravljanje korisnicima"**

### Dodavanje Novog Korisnika

1. Na **User Management** ekranu, kliknite **"+"** dugme u desnom donjem kutu
2. Popunite formu:
   - **Ime** - obavezno
   - **Prezime** - obavezno
   - **Email** - obavezno (jedinstveno)
   - **Lozinka** - obavezno (najmanje 6 znakova)
   - **Telefonski broj** - opciono
   - **Nivo pristupa** - odaberite jedan od:
     - 🔧 Serviser (osnovni)
     - 👔 Menadžer (napredni)
     - 🛡️ Administrator (puni)
3. Kliknite **"Kreiraj korisnika"**

### Editiranje Korisnika

1. Na **User Management** ekranu, kliknite **"Uredi"** dugme na kartici korisnika
2. Ažurirajte podatke (ime, prezime, telefon, nivo pristupa)
3. Kliknite **"Spremi"**

### Reset Lozinke

1. Na **User Management** ekranu, kliknite **"Lozinka"** dugme na kartici korisnika
2. Unesite novu lozinku (najmanje 6 znakova)
3. Kliknite **"Resetiraj"**
4. Admin će vidjeti novu lozinku
5. Kliknite **"Kopiraj lozinku"** da je kopiraš
6. Korisnik se mora ponovno prijaviti sa novom lozinkom

### Brisanje Korisnika

1. Na **User Management** ekranu, kliknite **"Obriši"** dugme na kartici korisnika
   - *Napomena: Ne možete obrisati sebe (trenutnog admin-a)*
2. Potvrdi brisanje

## 📱 Ekrani

### UserManagementScreen
- Prikazuje listu svih korisnika
- Status indikator (zeleno = aktivan, crveno = neaktivan)
- Role badge sa bojom (crvena = admin, plava = serviser, teal = menadžer)
- Brze akcije: Uredi, Lozinka, Obriši

### AddUserScreen
- Forma za dodavanje novih korisnika
- Validacija svih polja
- Prikaz lozinke / sakrivanje lozinke
- Role selektor sa detaljnim opisima

### HomeScreen - Admin Sekcija
- Vidljiva samo za administratore
- Dugme za brz pristup User Management-u

## 🔄 Sinkronizacija

- Korisnici se automatski sinkroniziraju sa servera
- Samo administratori mogu vidjeti listu korisnika
- Non-admin korisnici ne vide User Management
- Offline modo: Admin ne može upravljati korisnicima bez interneta

## 🛡️ Sigurnost

- Lozinke su heširane sa bcryptom
- Privremena lozinka se prikazuje admin-u samo jednom
- Sve akcije (dodavanje, editiranje, brisanje, reset) se logiraju
- Admin ne može obrisati sebe

## 📊 Audit Log

Sve akcije su logirrane:
- Dodavanje korisnika
- Editiranje korisnika
- Brisanje korisnika
- Reset lozinke
- Pristup User Management-u

Pristup audit loglovu: `/api/audit-logs`

## 🔧 Tehnički Detalji

### Backend Routes
- `GET /api/users` - Sve korisnike (admin only)
- `GET /api/users/:id` - Jedan korisnik (admin only)
- `POST /api/users` - Kreiraj korisnika (admin only)
- `PUT /api/users/:id` - Uredi korisnika (admin only)
- `DELETE /api/users/:id` - Obriši korisnika (admin only)
- `PUT /api/users/:id/reset-password` - Reset lozinke (admin only)
- `GET /api/users/:id/password` - Provjeri da je lozinka hashirana (admin only)

### Mobile Components
- `UserManagementScreen.js` - UI za upravljanje
- `AddUserScreen.js` - Forma za dodavanje
- `UserDB` helper - Lokalna SQLite baza
- `usersAPI` - API komunikacija

### Sync Flow
1. Admin se prijavi
2. `syncUsersFromServer()` se pokreće
3. Svi korisnici se učitavaju u lokalnu SQLite bazu
4. UI prikazuje podatke iz lokalne baze
5. Izmjene se šalju na server

## ✅ Pripremi za Proizvodnju

- [ ] Postavi sigurnu MONGODB_URI
- [ ] Postavi JWT_SECRET
- [ ] Postavi NODE_ENV = 'production'
- [ ] Testiraj sa više korisnika istovremeno
- [ ] Aktiviraj HTTPS
- [ ] Provjeri audit loglove

---

**Verzija**: 1.0  
**Zadnja ažuriranja**: 2025  
**Status**: ✅ Produkcija spreman
