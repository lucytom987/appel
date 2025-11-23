# Conflict Resolution - Timestamp-based Sync

## Kako radi?

Aplikacija koristi **timestamp-based conflict resolution** za sync podataka između lokalne SQLite baze i Supabase/Backend servera.

### Princip rada

```
┌─────────────┐         ┌─────────────┐
│   Lokalna   │         │   Server    │
│   SQLite    │  ◄────► │  (Backend)  │
│   Baza      │         │             │
└─────────────┘         └─────────────┘
      │                       │
      │   updated_at          │   updated_at
      │   synced flag         │   
      └───────────────────────┘
```

### Pravila za Conflict Resolution

1. **Server ima noviju `updated_at`** → Koristi server verziju
2. **Local ima `synced=0`** (unsynced promjene) → Local ima prioritet
3. **Iste timestamps** → Server ima prioritet (sigurnija opcija)
4. **Local ne postoji, server da** → Koristi server
5. **Server ne postoji, local da** → Zadrži local

### Primjer scenarija

#### Scenarij 1: Server je noviji
```javascript
Local:  { id: '123', name: 'Dizalo A', updated_at: 1700000000, synced: 1 }
Server: { id: '123', name: 'Dizalo A Updated', updated_at: 1700001000 }
→ KORISTI SERVER (server je noviji)
```

#### Scenarij 2: Local ima unsynced promjene
```javascript
Local:  { id: '456', name: 'Dizalo B Edited', updated_at: 1700000500, synced: 0 }
Server: { id: '456', name: 'Dizalo B', updated_at: 1700001000 }
→ KORISTI LOCAL (local ima unsynced promjene, prioritet)
```

#### Scenarij 3: Server obrisao zapis
```javascript
Local:  { id: '789', name: 'Dizalo C', synced: 1 }
Server: (ne postoji)
→ OBRIŠI LOCAL (server ga više nema)
```

### Implementacija

#### 1. Schema (SQLite)

Svaka tablica ima:
```sql
CREATE TABLE elevators (
  id TEXT PRIMARY KEY,
  ...
  synced INTEGER DEFAULT 0,    -- 0 = unsynced, 1 = synced
  updated_at INTEGER           -- Unix timestamp (Date.now())
);
```

#### 2. CRUD operacije

Svaki `insert` i `update` postavlja:
```javascript
db.runSync(
  `INSERT INTO elevators (..., synced, updated_at) VALUES (?, ?, ...)`,
  [..., 0, Date.now()]
);
```

#### 3. Sync proces

**syncService.js**:
```javascript
import { mergeRecords } from './conflictResolver';

// 1. Dohvati server records
const serverRecords = await api.getAll();

// 2. Dohvati local records
const localRecords = db.getAll();

// 3. Merge s conflict resolution
const { toUpdate, toDelete, conflicts } = mergeRecords(localRecords, serverRecords);

// 4. Primijeni promjene
toUpdate.forEach(record => db.update(record));
toDelete.forEach(id => db.delete(id));
```

### Testiranje

Testiranje conflict resolution-a:

```bash
# 1. Kreiraj novi servis offline
# 2. Editaj isti servis na backend-u (putem web dashboarda ili drugog uređaja)
# 3. Okrenuo sync na mobilnom uređaju
# 4. Provjeri koji zapis je "pobijedio" (trebao bi local jer ima synced=0)
```

### Logiranje

Aplikacija logira sve conflict resolution odluke:

```
🔧 Local conflict: local_time=1700000500, server_time=1700001000, synced=0 → use LOCAL
📥 Server conflict: server_time=1700001000 > local_time=1700000000 → use SERVER
⚖️ Equal conflict: server_time=1700000000 === local_time=1700000000 → use SERVER (default)
```

### Future Enhancements

- **UI dialog za konflikte**: Prikaži korisniku conflict i dopusti mu da odabere koja verzija ostaje
- **Field-level merge**: Umjesto cijelog zapisa, merge pojedinačna polja
- **History tracking**: Čuvaj povijest promjena za svaki zapis
- **Real-time sync**: WebSocket za instant sync umjesto polling-a

---

## API Reference

### `conflictResolver.js`

#### `resolveConflict(localRecord, serverRecord)`

Odluči koja verzija zapisa je "winner".

**Parametri:**
- `localRecord` - Local record s `updated_at` i `synced` flagom
- `serverRecord` - Server record s `updated_at`

**Returns:**
```javascript
{
  action: 'use_server' | 'use_local' | 'conflict',
  winner: Object,
  reason: String
}
```

#### `mergeRecords(localRecords, serverRecords, idField)`

Merge array of records s conflict resolution.

**Parametri:**
- `localRecords` - Array local records
- `serverRecords` - Array server records
- `idField` - Ime ID polja (default: `'id'`)

**Returns:**
```javascript
{
  toUpdate: Array,    // Records za update/insert
  toDelete: Array,    // IDs za brisanje
  conflicts: Array    // Unresolved conflicts (za UI dialog)
}
```

#### `mergeSingleRecord(localRecord, serverRecord)`

Merge single record (korisno za real-time updates).

**Returns:**
```javascript
{
  shouldUpdate: Boolean,
  record: Object,
  reason: String,
  isConflict: Boolean  // Optional
}
```

---

## Troubleshooting

### Problem: Local promjene se ne šalju na server

**Uzrok**: `synced` flag nije postavljen na `0` nakon edit-a.

**Rješenje**: Provjerite da update funkcija postavlja `synced: 0`:
```javascript
db.runSync(
  'UPDATE elevators SET ..., synced=0, updated_at=? WHERE id=?',
  [..., Date.now(), id]
);
```

### Problem: Server uvijek "pobijedi" iako local ima promjene

**Uzrok**: `updated_at` timestamp nije postavljen pravilno.

**Rješenje**: Provjerite da insert/update postavljaju `Date.now()`:
```javascript
updated_at: Date.now()  // ✅ Pravilno
updated_at: new Date()  // ❌ Krivo (treba biti broj)
```

### Problem: Konflikti se ne logiraju

**Uzrok**: `console.log` ne prikazuje logove u production build-u.

**Rješenje**: Koristite `adb logcat` za prikaz logova:
```bash
adb logcat | grep -i "conflict"
```

---

## Changelog

### v1.1.0 (Build 10) - 23. Studeni 2025
- ✅ Implementiran timestamp-based conflict resolution
- ✅ Kreiran `conflictResolver.js` s merge logikom
- ✅ Ažuriran `syncService.js` za sve entitete (elevators, services, repairs)
- ✅ Osigurano da svi CRUD postavljaju `updated_at = Date.now()`
- ✅ Dodana dokumentacija za conflict resolution

---

© 2025 APPEL - Elevator Management
