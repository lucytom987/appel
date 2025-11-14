# 🔐 Permisije po Nivou Pristupa

## Pregled Tablica

| Akcija | Serviser | Menadžer | Admin |
|--------|----------|----------|-------|
| **Korisnici** | | | |
| Vidjeti listu | ❌ | ❌ | ✅ |
| Dodati korisnika | ❌ | ❌ | ✅ |
| Editirati korisnika | ❌ | ❌ | ✅ |
| Brisati korisnika | ❌ | ❌ | ✅ |
| Resetirati lozinku | ❌ | ❌ | ✅ |
| **Dizala** | | | |
| Vidjeti sve | ✅ | ✅ | ✅ |
| Vidjeti detalje | ✅ | ✅ | ✅ |
| Dodati dizalo | ✅ | ✅ | ✅ |
| Editirati dizalo | ❌ | ✅ | ✅ |
| Brisati dizalo | ❌ | ✅ | ✅ |
| **Servisi** | | | |
| Vidjeti sve | ✅ | ✅ | ✅ |
| Vidjeti detalje | ✅ | ✅ | ✅ |
| Dodati servis | ✅ | ✅ | ✅ |
| Editirati servis | ❌ | ✅ | ✅ |
| Brisati servis | ✅ | ✅ | ✅ |
| **Popravci** | | | |
| Vidjeti sve | ✅ | ✅ | ✅ |
| Vidjeti detalje | ✅ | ✅ | ✅ |
| Dodati popravak | ✅ | ✅ | ✅ |
| Editirati popravak | ❌ | ✅ | ✅ |
| Brisati popravak | ✅ | ✅ | ✅ |
| **Audit Log** | | | |
| Vidjeti log | ❌ | ❌ | ✅ |

## Detaljne Permisije

### 🔧 SERVISER (Osnovni pristup)
**Namjena**: Tehnički izvršava servise i popravke

**Dozvoljene akcije**:
```
✅ Može vidjeti sve dizale, servise i popravke
✅ Može dodati nove servise
✅ Može brisati servise
✅ Može dodati nove popravke
✅ Može brisati popravke
✅ Može dodati novo dizalo (ali ne može editirati/brisati)

❌ NE može editirati dizala, servise ili popravke
❌ NE može vidjeti listu korisnika
❌ NE može pristupiti Admin panelu
❌ NE može resetirati lozinke
```

**Primjer akcija**:
- "Dodaj novi servis na dizalo XYZ"
- "Obriši greško unesen servis"
- "Dodaj novi popravak - zamjena ulja"
- "Obriši greško unesen popravak"

### 👔 MENADŽER (Napredni pristup)
**Namjena**: Upravlja dizalima, servisima i popravcima

**Dozvoljene akcije**:
```
✅ Sve što SERVISER može
✅ Može editirati dizala (broj ugovora, naziv stranke, itd.)
✅ Može brisati dizala
✅ Može editirati servise (datum, status, napomene)
✅ Može editirati popravke (status, opis, itd.)
✅ Može pristupiti svim bazama podataka
✅ Može sinkronizirati podatke sa serverom

❌ NE može vidjeti listu korisnika
❌ NE može pristupiti Admin panelu
❌ NE može resetirati lozinke
❌ NE može upravljati korisnicima
```

**Primjer akcija**:
- "Editiraj dizalo - promijeni kontakt osobu"
- "Obriši dizalo koje više nije u bazi"
- "Ažuriraj status servisa na 'Završen'"
- "Editiraj opis greške popravka"
- "Promijeni interval servisa"

### 🛡️ ADMINISTRATOR (Puni pristup)
**Namjena**: Ima puni kontrolu nad aplikacijom i korisnicima

**Dozvoljene akcije**:
```
✅ Sve što MENADŽER može
✅ Može vidjeti listu svih korisnika
✅ Može dodati nove korisnike
✅ Može editirati podatke korisnika
✅ Može brisati korisnike
✅ Može resetirati lozinke korisnicima
✅ Može dodijeliti nivoe pristupa
✅ Može vidjeti audit log sve akcije
✅ Može pristupiti svim admin funkcijama

❌ NE može obrisati samog sebe (preventiva od slučajnog brisanja)
```

**Primjer akcija**:
- "Kreiraj novog korisnika - Ivan Serviser"
- "Promijeni nivo Ivana sa 'Serviser' na 'Menadžer'"
- "Resetiraj lozinku korisniku jer je zaboravio"
- "Obriši korisnika koji je otišao sa posla"
- "Vidjeti sve akcije korisnika u audit logu"
- "Editiraj ime ili email korisnika"

## API Pristupne Kontrole

### Elevators Routes
```javascript
GET    /api/elevators          [authenticate]           ✅ Svi
POST   /api/elevators          [authenticate]           ✅ Svi
GET    /api/elevators/:id      [authenticate]           ✅ Svi
PUT    /api/elevators/:id      [menadzer, admin]        👔🛡️
DELETE /api/elevators/:id      [menadzer, admin]        👔🛡️
```

### Services Routes
```javascript
GET    /api/services           [authenticate]           ✅ Svi
POST   /api/services           [authenticate]           ✅ Svi
GET    /api/services/:id       [authenticate]           ✅ Svi
PUT    /api/services/:id       [menadzer, admin]        👔🛡️
DELETE /api/services/:id       [serviser, menadzer, admin] 🔧👔🛡️
```

### Repairs Routes
```javascript
GET    /api/repairs            [authenticate]           ✅ Svi
POST   /api/repairs            [authenticate]           ✅ Svi
GET    /api/repairs/:id        [authenticate]           ✅ Svi
PUT    /api/repairs/:id        [menadzer, admin]        👔🛡️
DELETE /api/repairs/:id        [serviser, menadzer, admin] 🔧👔🛡️
```

### Users Routes
```javascript
GET    /api/users              [admin]                  🛡️
POST   /api/users              [admin]                  🛡️
GET    /api/users/:id          [admin]                  🛡️
PUT    /api/users/:id          [admin]                  🛡️
DELETE /api/users/:id          [admin]                  🛡️
PUT    /api/users/:id/reset-password [admin]            🛡️
```

## 🔍 Kako Funkcionira Pristupna Kontrola

### Backend Middleware
```javascript
// Autentifikacija - provjera tokena
router.post('/api/resource', authenticate, (req, res) => {
  // Korisnik je autentificiran
  req.user sadrži: { _id, email, uloga, ime, prezime, ... }
});

// Autentifikacija + Role Check
router.post('/api/resource', authenticate, checkRole(['admin']), (req, res) => {
  // Samo admin može pristupiti
});

router.post('/api/resource', authenticate, checkRole(['menadzer', 'admin']), (req, res) => {
  // Samo menadžer i admin mogu pristupiti
});
```

### Mobile Side
- UI se dinamički prikazuje ovisno o ulozi korisnika
- User Management dugme je vidljivo samo za admin-e
- Operacije (PUT, DELETE) se pokušavaju na serveru
- Server vraća 403 ako korisnik nema pristupa

## 📋 Audit Trail

Sve akcije se logiraju u audit logu:
```
- Korisnik koji je izvršio akciju
- Tip akcije (CREATE, UPDATE, DELETE, VIEW)
- Entitet na koji je akcija izvršena (User, Elevator, Service, Repair)
- Stare i nove vrijednosti
- IP adresa
- Vremenske oznake
```

### Primjer Audit Loga
```json
{
  "korisnikId": "631a1234567890abcd1234ef",
  "akcija": "UPDATE",
  "entitet": "Elevator",
  "entitetId": "631a5678901234567890abcd",
  "entitetNaziv": "Dizalo 101",
  "stareVrijednosti": {
    "nazivStranke": "Stara Stranka"
  },
  "noveVrijednosti": {
    "nazivStranke": "Nova Stranka"
  },
  "ipAdresa": "192.168.1.100",
  "timestamp": "2025-01-15T10:30:45Z"
}
```

## ✅ Sigurnosne Mjere

1. **Token Autentifikacija**: JWT tokeni se koriste za sve API pozive
2. **Role-Based Access Control**: Svaka ruta ima definirane dozvoljene uloge
3. **Audit Logging**: Sve akcije se prate i logiraju
4. **IP Tracking**: IP adresa se bilježi za svaku akciju
5. **Self-Delete Prevention**: Admin ne može obrisati sebe
6. **Offline Token Protection**: Offline demo korisnici ne mogu pristupiti User Management-u

---

**Verzija**: 1.0  
**Datum**: 2025-01-15  
**Status**: ✅ Implementirano i testirano
