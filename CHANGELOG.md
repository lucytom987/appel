# APPEL - Elevator Management App

## O Aplikaciji

APPEL je mobilna aplikacija za upravljanje dizalima, servisima i hitnim popravcima. Aplikacija je razvijena kao **offline-first** rješenje s mogućnošću sinkronizacije kada je dostupna internet veza.

### Glavne Značajke
- 📱 React Native + Expo (Bare Workflow)
- 💾 SQLite lokalna baza podataka
- 🔄 Offline-first arhitektura s mogućnošću sinkronizacije
- 🗺️ Google Maps integracija za prikaz lokacija dizala
- 📍 GPS koordinate s geocoding podrškom
- 🔐 Autentifikacija i upravljanje korisnicima
- 📊 Statistika servisa i popravaka

---

### Build 11 (v2.0.21) - 3. Rujna 2026
**Hardening spremanja i editiranja podataka + Play Store upload verzija**

#### Izmjene:
- 🛡️ Ojačano spremanje kod uređivanja dizala, servisa i popravaka kako bi se spriječio tihi gubitak podataka kod parcijalnih update zahtjeva.
- ✏️ U uređivanju servisa više se ne brišu napomene niti dodatni serviseri ako korisnik ne mijenja ta polja.
- 📋 Stabilizirano grupiranje i prikaz dizala nakon uređivanja opisa/broja dizala.
- 🔐 Backend update rute (`elevators`, `services`, `repairs`) prebačene su na eksplicitniji whitelist pristup za polja koja se smiju mijenjati.

#### Tehnički:
- Verzija aplikacije 2.0.21; Android versionCode 25; iOS buildNumber 24 (package.json, app.json, app.config.js).

---

### Build 10 (v2.0.20) - 2. Rujna 2026
**Obavezni update, godišnji pregledi po mjesecu i kompaktniji dashboard**

#### Izmjene:
- 🔔 Dodana je obavezna obavijest za update starijih verzija aplikacije.
- 📅 Godišnji pregled je prebačen na odabir mjeseca, bez datuma i godine.
- 🖨️ Popravci imaju novi print s nazivom i adresom u prvom stupcu, širim opisima te tokom prijave i izvedbe.
- 🧭 Početni ekran je zgusnut i pregledniji, s boljim rasporedom kartica i sažetaka.
- ✏️ U uređivanju i dodavanju dizala godišnji pregled se bira kao mjesec.

#### Tehnički:
- Verzija aplikacije 2.0.20; Android versionCode 24; iOS buildNumber 23 (package.json, app.json, app.config.js).

---

## Povijest Verzija

### Build 9 (v1.2.0) - 11. Prosinac 2025
**Chat sobe, nepročitane poruke i čišćenja UI-ja**

#### Izmjene:
- 📨 Nepročitane poruke: dodan backend endpoint `/messages/unread/count`, klijent označava poruke kao pročitane pri otvaranju sobe, a Home badge ispravno parsira broj.
- 🧹 Brojanje poruka: filtrira samo postojeće sobe i ignorira orfanirane/obrisane sobe i vlastite poruke.
- 👥 Članovi soba: svi korisnici vide broj članova (`membersCount`), bez potrebe za ručnim dodavanjem u članove.
- 🗑️ Brisanje chat soba: UI gumb s potvrdom; backend briše i sve poruke te sobe.
- ✂️ Uklonjen nefunkcionalni online indikator u listi korisnika.

#### Tehnički:
- Verzija aplikacije 1.2.0; Android versionCode 4; iOS buildNumber 4 (package.json, app.json, app.config.js).

### Build 8 (v1.1.0) - 9. Prosinac 2025
**UX i navigacija (popravci/dizala) + blaži zoom na karti**

#### Izmjene:
- 📊 Home statistika: filtrira obrisana dizala/popravke i uklanja duplikate kako bi brojevi odgovarali listi.
- 🗺️ Karta: centriranje na korisnika s većim delta zoomom (manje “zalijepljeno” kod GPS offseta ~25 m).
- 🔁 Popravci: back (uključivo hardverski) iz liste vodi na Home.
- ✏️ Uređivanje dizala: svi backovi/alerti vode na listu popravaka (uključujući hardverski back).
- 📑 Lista dizala: adresa prva i istaknuta, naziv ispod; uklonjen status badge; filter čip u headeru (aktivna/neaktivna); pretraga fokus na adresu/naziv/kontakt osobu.

#### Tehnički:
- Bump verzije aplikacije na 1.0.1; Android versionCode 2, iOS buildNumber 2 (app.json, app.config.js, package.json).

### Build 7 (v1.0.6) - 22. Studeni 2025
**Poboljšanja korisničkog sučelja**

#### Izmjene:
- ✅ **SafeAreaView implementacija** - Sav sadržaj aplikacije se sada prikazuje iznad Android navigacijskih tipki (home/back buttons)
  - Primijenjeno na sve glavne ekrane: HomeScreen, MapScreen, ElevatorDetailsScreen, AddElevatorScreen, EditElevatorScreen, AddServiceScreen, AddRepairScreen
  - Korištenje `edges={['bottom']}` za preciznu kontrolu padding-a

- ✅ **KeyboardAvoidingView implementacija** - Automatsko pomicanje sadržaja kada se tipkovnica otvori
  - Primijenjeno na sve forme s multiline poljima
  - AddElevatorScreen (Napomene)
  - EditElevatorScreen (Napomene)
  - AddServiceScreen (Napomene servisa)
  - AddRepairScreen (Opis kvara)
  - Rješava problem gdje tipkovnica prekriva polje za unos

#### Tehnički Detalji:
- `react-native-safe-area-context: ^5.6.2`
- `KeyboardAvoidingView` s `behavior="height"` za Android
- `keyboardVerticalOffset={100}` za optimalan offset

---

### Build 6 (v1.0.5) - 22. Studeni 2025
**UX optimizacije i brzi pristup informacijama**

#### Izmjene:
- ✅ **Pojednostavljena brza kartica na karti** - Prikazuje samo adresu i ulaznu šifru s većim fontovima
  - Adresa: 18px bold
  - Ulazna šifra: 24px bold, zelena boja, povećan letter-spacing
  - Close button u gornjem desnom kutu
  - Vizualni separator između sekcija
  - Hint tekst "Tapni ponovo za sve detalje"

- ✅ **Optimizacija učitavanja karte**
  - Korištenje `getLastKnownPositionAsync()` za instant prikaz pozicije
  - Paralelno učitavanje dizala i precizne lokacije
  - Overlay loading indikatori umjesto full-screen blockera
  - Reduciranje vremena učitavanja s 10-20 sekundi na ~2-3 sekunde

- ✅ **Auto-centriranje na korisničku lokaciju**
  - Automatski zoom na korisničku poziciju pri otvaranju karte
  - Tight zoom (latitudeDelta: 0.0001, ~10m radius)
  - useEffect hook za jednom izvršavanje centriranja

- ✅ **Dva-koraka interakcija s markerima**
  - Prvi tap: Prikazuje brzu karticu s adresom i ulaznom šifrom
  - Drugi tap: Otvara ElevatorDetailsScreen s potpunim informacijama

#### Tehnički Detalji:
- MapScreen optimiziran s `lastKnownLocation` fallback-om
- Custom marker dizajn s `business` ikonom
- Retry funkcionalnost s `loadData` funkcijom

---

### Build 5 (v1.0.4) - 22. Studeni 2025
**GPS koordinate i upravljanje lokacijom**

#### Izmjene:
- ✅ **Geocoding funkcionalnost** - Automatska dodjela GPS koordinata na temelju adrese
  - Implementacija u AddElevatorScreen i EditElevatorScreen
  - Korištenje `Location.geocodeAsync` s formatom "${ulica}, ${mjesto}, Croatia"
  - Button "Nađi iz adrese" za brzu GPS dodjelu

- ✅ **Interaktivni map picker** - Odabir lokacije prstom na karti
  - Nova komponenta `LocationPickerModal.js`
  - Full-screen MapView s draggable markerom
  - onPress handler za postavljanje lokacije tapom
  - Prikaz trenutnih koordinata na dnu
  - Button "Odaberi na karti" u formama za dizala

- ✅ **GPS management UI**
  - Vizualni indikator "Lokacija postavljena" kada su koordinate postavljene
  - Inline TextInput za ručno uređivanje koordinata
  - Sekcija s dva buttona za geocoding i map picker

#### Tehnički Detalji:
- `expo-location: ^19.0.7`
- `Location.geocodeAsync()` API
- LocationPickerModal s last known + current location inicijalizacijom

---

### Build 4 (v1.0.3) - 21. Studeni 2025
**Google Maps integracija i vizualizacija dizala**

#### Izmjene:
- ✅ **MapScreen implementacija** - Prikaz svih dizala s GPS koordinatama na Google karti
  - Prikazuje trenutnu lokaciju korisnika
  - Custom marker ikone (plavi bubble s business ikonom)
  - FAB button "Moja trenutna lokacija" za brzo centriranje
  - Info bar kada nema dizala s GPS koordinatama
  - Filter: samo dizala koja imaju postavljene koordinate

- ✅ **Google Maps API konfiguracija**
  - API ključ konfiguriran u `AndroidManifest.xml` i `app.json`
  - Dodano u `AndroidManifest.xml` kao `<meta-data>`
  - Konfiguracija u `app.json` za Expo

- ✅ **Navigacija na kartu**
  - Dodana "Karta" kartice na HomeScreen (zamjena za "Hitni popravci")
  - Route `Map` u Navigation.js
  - Ikona `map` za brzu identifikaciju

- ✅ **Location permissions**
  - Zahtjev za foreground location permissions
  - Retry funkcionalnost ako su dozvole odbijene
  - Graceful fallback ako nema dostupne lokacije

#### Bug Fix:
- 🐛 **Crni ekran na karti** - Riješeno dodavanjem Google Maps API ključa u AndroidManifest.xml
  - Problem: MapView prikazivao crni ekran
  - Uzrok: Android zahtijeva API ključ u manifestu za PROVIDER_GOOGLE
  - Rješenje: Dodano `<meta-data android:name="com.google.android.geo.API_KEY" />`

#### Tehnički Detalji:
- `react-native-maps: 1.20.1` s `PROVIDER_GOOGLE`
- `expo-location: ^19.0.7`
- Koordinate format: `{ latitude: number, longitude: number }`

---

### Build 3 (v1.0.2) - 21. Studeni 2025
**Servisni checklist overhaul**

#### Izmjene:
- ✅ **Novi servisni checklist** - Zamjena postojećih 8 stavki s 7 novih:
  1. Podmazivanje
  2. Provjera UPS-a
  3. Govorna veza
  4. Čišćenje šahta
  5. Provjera pog. stroja (pogonskog stroja)
  6. Provjera kočnice
  7. Inspekcija užeta

- ✅ **AddServiceScreen ažuriran** - Novi checklist sa odgovarajućim ikonama
- ✅ **ServiceDetailsScreen ažuriran** - Prikaz novih checklist stavki

#### Tehnički Detalji:
- Checklist spremljen kao JSON string u SQLite bazi
- Svaka stavka ima `item` i `checked` property
- Checkbox UI s Ionicons `checkmark` ikonom

---

### Build 2 (v1.0.1) - 20. Studeni 2025
**Password field fix i opcionalni broj ugovora**

#### Izmjene:
- ✅ **Password visibility toggle** - Riješen problem s `secureTextEntry` na Androidu
  - Problem: Android automatski prikazuje password visibility toggle, što je stvaralo dvostruke ikone
  - Rješenje: Ručna implementacija s eye ikonom i state managementom
  - `showPassword` state za kontrolu vidljivosti

- ✅ **Opcionalni broj ugovora** - Broj ugovora više nije obavezan
  - Placeholder: "(opcionalno)"
  - Hint tekst dodan ispod polja
  - Validacija uklonjena

#### Bug Fixes:
- 🐛 **Dupli eye icon na password polju** - Riješeno uklanjanjem Android default togglea

---

### Build 1 (v1.0.0) - 20. Studeni 2025
**Inicijalni production build**

#### Izmjene:
- ✅ **Lokalni Gradle build workflow** - Konfiguracija za lokalno buildanje bez Expo servera
  - `expo prebuild --platform android --clean`
  - Gradle 8.14.3, Android SDK 36
  - New Architecture enabled (`newArchEnabled=true`)

- ✅ **Keystore generacija i signing konfiguracija**
  - Keystore: `appel-release-key.jks`
  - Alias: `appelrelease`
  - Signing config u `build.gradle`
  - Credentials u `gradle.properties`

- ✅ **Build optimizacije**
  - minSdkVersion: 24 (Android 7.0)
  - targetSdkVersion: 36 (Android 14)
  - compileSdkVersion: 36
  - NDK: 27.1.12297006

#### Tehnički Stack:
- React Native 0.81.5
- Expo SDK 54
- Bare Workflow (nakon prebuild)
- SQLite za lokalnu bazu
- @react-navigation/native-stack za navigaciju
- expo-secure-store za credentials storage

#### Kompilacija:
- Prvi uspješni release build
- APK lokacija: `mobile/android/app/build/outputs/apk/release/app-release.apk`
- Build vrijeme: ~2-3 minute

---

## Tehničke Specifikacije

### Platforma
- **OS**: Android (minSdk 24, targetSdk 36)
- **Framework**: React Native 0.81.5 + Expo SDK 54
- **Build Tool**: Gradle 8.14.3
- **JDK**: Temurin 17

### Native Dependencies
```json
"react-native-gesture-handler": "^2.21.0",
"react-native-screens": "~4.16.0",
"react-native-reanimated": "^4.1.5",
"react-native-maps": "1.20.1",
"react-native-safe-area-context": "^5.6.2",
"expo-location": "^19.0.7",
"expo-secure-store": "~15.0.7",
"expo-sqlite": "~16.0.9"
```

### Baza Podataka
- **SQLite** - 3 glavne tablice:
  - `elevators` - Informacije o dizalima
  - `services` - Zapisi servisa
  - `repairs` - Zapisi hitnih popravaka

### API Integracija
- **Backend**: Node.js + Express (kada online)
- **Sync**: Ručna sinkronizacija offline → online
- **Auth**: JWT token authentication

### Google Services
- **Maps API**: Konfiguriran u app.json (privatni ključ)
- **Geocoding**: Location.geocodeAsync() za address → coordinates

---

## Build Process

### Zahtjevi
1. Node.js (preporučeno LTS verzija)
2. Android SDK (SDK 36)
3. JDK 17 (Temurin)
4. Gradle 8.14.3

### Build Naredbe
```bash
# Development
npm run android

# Production build
cd mobile/android
./gradlew assembleRelease

# APK lokacija
mobile/android/app/build/outputs/apk/release/app-release.apk
```

### Keystore Info
- **Keystore**: `appel-release-key.jks`
- **Keystore Password**: AppelStore123
- **Key Alias**: appelrelease
- **Key Password**: AppelKey123

---

## Roadmap

### Planirane Značajke
- [ ] Push notifikacije za servise koji pristižu
- [ ] Izvoz PDF izvještaja
- [ ] QR kod skeniranje za brzi pristup dizalu
- [ ] Offline map tiles za rad bez interneta
- [ ] Automatska sinkronizacija u pozadini
- [ ] Podršza za iOS platformu

### Poznati Bugovi
- Nema trenutno poznatih bugova

---

## Kontakt
**Projekt**: APPEL Elevator Management  
**Verzija**: 1.0.6 (Build 7)  
**Datum**: Studeni 2025  
**Platforma**: Android
