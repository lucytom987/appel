# Sustav Događaja (Events) - Dokumentacija

## Pregled

Refaktoriran je sustav "Popravaka" u fleksibilniji "Sustav Događaja" koji omogućava grupiranje različitih tipova aktivnosti na dizalu:
- **Popravci (Repairs)** - registracija kvarova i njihova popravka
- **Napomene sa servisa (Service Notes)** - zabilješke iz obavljanja servisa
- **Aktivnosti (Activities)** - opće aktivnosti na dizalu (posjeta, pregledavanje, kalibracija, čišćenje, ostalo)

## Struktura Podataka

### Backend - Event Model

```javascript
{
  id: ObjectId,
  elevatorId: ObjectId (ref: Elevator),
  eventType: 'repair' | 'service_note' | 'activity',
  datum: Date,
  
  // Za tip 'repair'
  repair: {
    serviserID: ObjectId,
    opisKvara: String,
    opisPopravka: String,
    status: 'pending' | 'in_progress' | 'completed',
    trebaloBi: Boolean,
    radniNalogPotpisan: Boolean,
    popravkaUPotpunosti: Boolean
  },
  
  // Za tip 'service_note'
  serviceNote: {
    serviserID: ObjectId,
    tekst: String,
    fotografija: String (Base64)
  },
  
  // Za tip 'activity'
  activity: {
    serviserID: ObjectId,
    opis: String,
    tip: 'posjeta' | 'pregledavanje' | 'kalibracija' | 'cistenje' | 'ostalo'
  },
  
  napomene: String,
  updated_by: ObjectId,
  updated_at: Date,
  is_deleted: Boolean,
  deleted_at: Date,
  
  // Za migraciju podataka
  migratedFromRepairId: ObjectId,
  migratedFromServiceId: ObjectId
}
```

### Mobile - SQLite tablice

#### Glavna tablica: `events`
- `id` - Jedinstveni identifikator
- `elevatorId` - Referencija na dizalo
- `eventType` - Tip događaja (repair, service_note, activity)
- `datum` - Datum događaja
- `repair_*` - Polja za popravke (repair_serviserID, repair_opisKvara, repair_status, itd.)
- `serviceNote_*` - Polja za napomene (serviceNote_serviserID, serviceNote_tekst, itd.)
- `activity_*` - Polja za aktivnosti (activity_serviserID, activity_opis, activity_tip)
- `napomene` - Dodatne napomene
- `is_deleted` - Soft delete flag
- `sync_status` - Status sinkronizacije (synced, dirty, pending_delete)
- `updated_at`, `updated_by` - Audit polja

#### Helper funkcija: `parseEvent(row)`
- Pretvara SQLite redak u JavaSript objekt s logičkom strukturom
- Koristi se u svim `eventDB` metodama

## API Rute

### Events API (`/api/events`)

#### GET /api/events
- **Opis**: Dohvati listu wydarzaja s filtrima i delta sync
- **Query params**:
  - `elevatorId`: Filtriraj po dizalu
  - `eventType`: Filtriraj po tipu (repair, service_note, activity)
  - `status`: Filtriraj po statusu (samo za repair tip)
  - `startDate`, `endDate`: Filtriraj po datumu
  - `serviserId`: Filtriraj po serviserу
  - `updatedAfter`: Delta sync od datuma
  - `limit`: Broj rezultata (default: 200, max: 500)
  - `skip`: Stranica (offset)
  - `includeDeleted`: Uključi obrisane (default: false)

#### GET /api/events/elevator/:elevatorId
- **Opis**: Dohvati sve događaje za određeno dizalo
- **Params**:
  - `elevatorId`: ID dizala
- **Query params**: Isti kao GET /api/events

#### POST /api/events
- **Opis**: Kreiraj novi događaj
- **Body**:
  ```json
  {
    "elevatorId": "dizalo-id",
    "eventType": "repair",
    "repair": {
      "opisKvara": "Opis kvara",
      "status": "pending"
    },
    "napomene": "Dodatne napomene",
    "datum": "ISO date"
  }
  ```

#### PUT /api/events/:id
- **Opis**: Ažuriraj postojeći događaj
- **Body**: Slično kao POST, ali samo polja koja trebam ažurirati

#### DELETE /api/events/:id
- **Opis**: Obriši događaj (soft delete)

## Frontend - Mobile UI

### ElevatorDetailsScreen Izmjene

1. **Novi tab**: "Događaji" se pojavljuje između "Servisi" i "Popravci"
2. **renderEventsTab()**: Prikazuje sve događaje za dizalo
3. **Event Card prikaz**:
   - Datum događaja
   - Tip događaja s ikonom i lablelom
   - Kratak opis (opisKvara, tekst napomene, opis aktivnosti)
   - Status (samo za popravke)
   - Dodatne napomene

### Broj Događaja
- Tab prikazuje broj događaja: `Događaji (X)`
- Automatski se ažurira kada se učita novi podatak

## Što Trebam Još Napraviti

### Prioritet 1: Kreiranje Novih Događaja
- [ ] Novi ekran `AddEventScreen.js`
- [ ] Mogućnost izbora tipa događaja
- [ ] Forma za unos podataka specifičnih za tip
- [ ] Slanje na server i lokalni sync

### Prioritet 2: Uređivanje Događaja
- [ ] Novi ekran `EventDetailsScreen.js` 
- [ ] Mogućnost uređivanja svih polja
- [ ] Brisanje događaja

### Prioritet 3: Migracija Podataka
- [ ] Skript za migraciju starih Repair i Service zapisa u Events
- [ ] Postavljanje `migratedFromRepairId` i `migratedFromServiceId`
- [ ] Brisanje ili arhiviranje starih tablica (opciono)

### Prioritet 4: Sinkronizacija
- [ ] Dodati `eventDB` u `syncService.js`
- [ ] Delta sync za Events
- [ ] Offline queue podrška za Events

### Prioritet 5: Replikacija Starih Ekrana
- [ ] `AddEventScreen.js` - kompletan (slično AddRepairScreen)
- [ ] `EventDetailsScreen.js` - kompletan (za prikaz detaljau)
- [ ] `EditEventScreen.js` - opciono

## Migracijske Skripte (Backend)

Trebam kreirati skripte za migraciju:

### `/scripts/migrateRepairsToEvents.js`
```javascript
// Prebaci sve Repair zapise u Event zapise tipa 'repair'
// Postavi migratedFromRepairId
// Zapiši statistiku
```

### `/scripts/migrateServicesToEvents.js` (opciono)
```javascript
// Prebaci Service.nedostaci zapise u Event zapise tipa 'service_note'
// Prebaci Service.napomene u Event zapise tipa 'service_note'
```

## Baza Podataka - Verzija i Migracija

- **Mobile DB_VERSION**: Povećana sa 13 na 14
- **Nova tablica**: `events` s indeksima za elevatorId, eventType, datum, repair_status
- **Backward compatibility**: ALTER TABLE statements za starije verzije baze

## Testiranje

1. **Lokalno**: 
   - Provjeri da se Events tab pojavljuje na ElevatorDetailsScreen
   - Provjeri da se stari popravci i napomene možda trebaju premapirati

2. **Backend API**:
   - Testira sve rote s Postmanom ili curl-om
   - Provjera delta sync-a

3. **Mobile**:
   - Provjera učitavanja podataka iz baze
   - Provjera prikaza događaja

4. **Sync**:
   - Testira offline rad
   - Testira sync nakon povratka na internet

## Future Enhancements

1. **Filtriranje događaja**: Po tipu, po datumu, po serviserу
2. **Pretraga**: Brza pretraga po opisima
3. **Izvozi**: Export događaja u PDF ili CSV
4. **Statistika**: Grafički prikaz događaja po vremenu
5. **Push notifikacije**: Kada se doda novi događaj
6. **Attachments**: Fotografije, datoteke uz događaj
