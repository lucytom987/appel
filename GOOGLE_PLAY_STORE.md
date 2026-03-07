# 📱 Google Play Store - Deployment Guide

## 🎯 Kompletan proces za objavu APPEL aplikacije

---

## ⚙️ PRIPREMA - Kreiranje Production Keystore

### Korak 1: Generiraj Keystore File

**VAŽNO:** Ovaj keystore čuvaj ZAUVIJEK! Bez njega ne možeš raditi update app-a na Google Playu!

```powershell
# Navigiraj u android/app direktorij
Set-Location C:\Users\vidac\appel\mobile\android\app

# Generiraj keystore (Java keytool)
keytool -genkeypair -v -storetype PKCS12 -keystore appel-release.keystore -alias appel-key-alias -keyalg RSA -keysize 2048 -validity 10000

# Što će pitati (primjer odgovora za pojedinca):
# Enter keystore password: AppelSecure2026!      (ZAPAMTI OVO!)
# Re-enter new password: AppelSecure2026!
# What is your first and last name? Vida Cmarin
# What is the name of your organizational unit? Individual
# What is the name of your organization? Personal
# What is the name of your City or Locality? [tvoj grad]
# What is the name of your State or Province? [tvoja županija]
# What is the two-letter country code for this unit? HR
# Is CN=... correct? yes
# Enter key password: AppelSecure2026!          (ISTI kao za keystore!)
```

**Rezultat:**
- File: `appel-release.keystore` kreiran u `mobile/android/app/`
- Validity: 27+ godina (10000 dana)

### Korak 2: Backup Keystore (KRITIČNO!)

```powershell
# Kopiraj na SIGURNO mjesto (Google Drive, USB, itd.)
Copy-Item appel-release.keystore C:\backup-keys\

# VAŽNO: Nikad nemoj commitati keystore u Git!
# Već je u .gitignore, ali provjeri:
Get-Content ..\.gitignore | Select-String "keystore"
```

### Korak 3: Konfiguracija Gradle

**Dodaj u `mobile/android/gradle.properties`:**

```properties
# Idi na kraj dokumenta i dodaj:

# Release signing config (NE commitaj ovo u public Git!)
APPEL_RELEASE_STORE_FILE=appel-release.keystore
APPEL_RELEASE_KEY_ALIAS=appel-key-alias
APPEL_RELEASE_STORE_PASSWORD=AppelSecure2026!
APPEL_RELEASE_KEY_PASSWORD=AppelSecure2026!
```

**VRLO VAŽNO:**
- Ako je GitHub repo **PUBLIC**: Dodaj ove linije u `.gitignore` ili koristi Android Keystore mehanizam
- Ako je **PRIVATE**: OK je, ali najbolje koristiti environment varijable

### Korak 4: Ažuriraj `mobile/android/app/build.gradle`

Promijeni `signingConfigs` i `buildTypes` sekciju:

```gradle
signingConfigs {
    debug {
        storeFile file('debug.keystore')
        storePassword 'android'
        keyAlias 'androiddebugkey'
        keyPassword 'android'
    }
    release {
        if (project.hasProperty('APPEL_RELEASE_STORE_FILE')) {
            storeFile file(APPEL_RELEASE_STORE_FILE)
            storePassword APPEL_RELEASE_STORE_PASSWORD
            keyAlias APPEL_RELEASE_KEY_ALIAS
            keyPassword APPEL_RELEASE_KEY_PASSWORD
        }
    }
}

buildTypes {
    debug {
        signingConfig signingConfigs.debug
    }
    release {
        signingConfig signingConfigs.release  // Promijenjeno sa debug!
        minifyEnabled enableMinifyInReleaseBuilds
        proguardFiles getDefaultProguardFile("proguard-android.txt"), "proguard-rules.pro"
        shrinkResources (findProperty('android.enableShrinkResourcesInReleaseBuilds') ?: 'false').toBoolean()
        crunchPngs (findProperty('android.enablePngCrunchInReleaseBuilds') ?: 'true').toBoolean()
    }
}
```

### Korak 5: Testni Build s Production Keystoreom

```powershell
Set-Location C:\Users\vidac\appel\mobile\android

# Clean prije
.\gradlew.bat clean

# Build signed APK
.\gradlew.bat assembleRelease

# Ili build AAB (Android App Bundle - preporučeno za Play Store)
.\gradlew.bat bundleRelease
```

**Očekivani output:**
```
BUILD SUCCESSFUL in 12-15m

APK: mobile/android/app/build/outputs/apk/release/app-release.apk
AAB: mobile/android/app/build/outputs/bundle/release/app-release.aab
```

**Provjeri da je signed:**
```powershell
# Install apksigner ako nemaš (Android SDK tools)
# Provjeri signature
jarsigner -verify -verbose -certs app/build/outputs/apk/release/app-release.apk

# Očekujem: "jar verified."
```

---

## 🏪 GOOGLE PLAY CONSOLE SETUP

### Korak 1: Kreiraj Google Play Developer Account

1. **Idi na:** https://play.google.com/console/signup
2. **Sign in** s Google računom (može i privatni Gmail)
3. **Plati $25 USD** jednokratnu registracijsku naknadu
   - Prihvati Google Play Developer Distribution Agreement
   - Plati kreditnom karticom
4. **Odaberi account type:** **Personal account (pojedinac)**
5. **Popuni Developer Profile:**
   - Developer Name: `Vida Cmarin` (ili ime brenda koje želiš prikazati korisnicima)
   - Email address: tvoj email
   - Website: (opciono)
   - Phone: +385...
   - Address: osobna adresa (nije potrebno imati firmu)
6. **Dovrši verifikaciju identiteta** ako Google zatraži (ID dokument + osnovni podaci)

**Trajanje:** Account će biti aktivan u roku par sati do 48h.

> Napomena: Za objavu aplikacije **nije potrebna organizacija ni firma**. Personal account je dovoljan.

### Korak 2: Kreiraj Novu App

1. U Play Console dashboardu klikni **Create app**
2. Popuni:
   - **App name:** `APPEL - Elevator Service`
   - **Default language:** Croatian (Hrvatski)
   - **App or game:** App
   - **Free or paid:** Free
3. Checkboxaj:
   - ✅ Developer Program Policies
   - ✅ US export laws
4. Klikni **Create app**

---

## 📋 APP STORE LISTING

### Korak 3: Store Listing (Main Tab)

**App Details:**
- **App name:** `APPEL - Elevator Service`
- **Short description (80 chars max):**
  ```
  Upravljanje održavanjem dizala - servisi, popravci, inventar i chat
  ```
- **Full description (4000 chars max):**
  ```
  APPEL je kompletno rješenje za upravljanje servisiranjem i održavanjem dizala.

  🔧 GLAVNE FUNKCIONALNOSTI:
  • Evidencija svih dizala s detaljnim podacima
  • Praćenje redovnih servisa s checklistama
  • Upravljanje popravcima i troškovima
  • Google Maps integracija za lokacije
  • Chat komunikacija između djelatnika
  • Offline podrška - radi bez interneta
  • Automatska sinkronizacija kad se spoji na mrežu

  📊 SERVISI:
  • Kreiranje novih servisa s checklistama (16 točaka)
  • Istorija svih servisa po dizalu
  • Duplikat detekcija - upozorenje na postojeće servise
  • Dodavanje napomena i fotografija

  🔨 POPRAVCI:
  • Evidencija kvarova i popravaka
  • Praćenje troškova materijala i rada
  • Status praćenje (u tijeku/završeno)
  • Foto dokumentacija

  📍 INVENTAR DIZALA:
  • Kompletni podaci: adresa, tip, nosivnost, godine
  • SIM kartica i mrežni operater
  • Status: aktivno/neaktivno/obrisano
  • Mogućnost obnavljanja slučajno obrisanih dizala

  💬 TIMSKA KOMUNIKACIJA:
  • Chat sobe za različite adrese/projekte
  • Real-time poruke između tehničara
  • Prilog slika i dokumenata

  🔐 KORISNIČKE ROLE:
  • Admin - puna kontrola
  • Manager - upravljanje servisima i korisnicima
  • Tehničar - izvođenje servisa i popravaka

  Dizajnirano za lakši rad tehničara na terenu i bolju evidenciju za tvrtke koje se bave održavanjem dizala.
  ```

**Graphics Assets:**

1. **App icon** (već imaš u `assets/icon.png`)
   - 512 x 512 px
   - PNG, 32-bit PNG with alpha
   - Upload: Koristi postojeći `icon.png`

2. **Feature graphic** (KREIRAJ):
   - **Dimenzija:** 1024 x 500 px
   - **Format:** PNG ili JPEG
   - **Sadržaj:** Logo + slogan "Elevator Service Management"
   - **Tool:** Canva.com (besplatno)

3. **Screenshots** (OBAVEZNO - minimalno 2):
   - **Phone screenshots:** (minimalno 2, max 8)
   - **Dimenzije:** 16:9 ili 9:16 aspect ratio
   - **Preporuka:** 1080 x 1920 px (portrait)

**Kako napraviti screenshote:**

```powershell
# Instaliraj APK na emulator ili telefon
adb install mobile/android/app/build/outputs/apk/release/app-release.apk

# Screenshot-aj glavne ekrane:
# 1. Login screen
# 2. Home screen (lista dizala)
# 3. Elevator details
# 4. Service checklist
# 5. Chat room (opciono)

# Na telefonu: Screenshot + crop na device dimensions
# Ili koristi Android Studio Device Frame Screenshot Tool
```

**Categorization:**
- **App category:** Business ili Productivity
- **Tags:** elevator, service, maintenance, facility management

**Contact details:**
- **Email:** tvoj aktivan email
- **Phone:** +385... (opciono ali preporučeno)
- **Website:** (opciono)

**Privacy Policy:** (OBAVEZNO - vidi Korak 4)

---

### Korak 4: Privacy Policy

Google zahtijeva Privacy Policy URL za sve apps koji skupljaju korisničke podatke.

**Opcija 1: Koristi besplatni generator**
- https://www.privacypolicygenerator.info/
- https://app-privacy-policy-generator.firebaseapp.com/

**Opcija 2: Jednostavan template:**

```markdown
# Privacy Policy for APPEL

Last updated: March 7, 2026

## Information We Collect
APPEL collects the following information:
- User account data (name, email, role)
- Elevator inventory data (addresses, technical specifications)
- Service records and repair logs
- Chat messages between team members
- Photos uploaded by users

## How We Use Information
- To provide elevator maintenance management services
- To enable team communication via chat
- To sync data across devices
- To authenticate users and control access based on roles

## Data Storage
- Data is stored on our secure MongoDB database
- Local copies cached on device for offline functionality
- We do not share your data with third parties

## User Rights
- You can request deletion of your account and data by contacting us
- Admins can manage user access within the app

## Contact
For questions about this Privacy Policy, contact: [tvoj email]
```

**Hosting Privacy Policy:**
- **Opcija A:** GitHub Pages (besplatno)
  - Kreiraj `privacy-policy.md` u repo
  - Enable GitHub Pages u Settings
  - URL: `https://[username].github.io/appel/privacy-policy.html`
  
- **Opcija B:** Google Sites (besplatno)
  - https://sites.google.com/new
  - Upload text
  - Publish

- **Opcija C:** Render static site
  - Deploy kao HTML page na Render (besplatno)

---

## 📦 UPLOAD APP

### Korak 5: Production Release - Internal Testing

**PREPORUKA:** Pokreni prvo s **Internal Testing** da testiraš prije public releasea.

1. U Play Console, idi na **Testing > Internal testing**
2. Klikni **Create new release**
3. **Upload AAB** (Android App Bundle - preferabilan format):
   ```
   mobile/android/app/build/outputs/bundle/release/app-release.aab
   ```
   - Ako AAB nije buildan: `.\gradlew.bat bundleRelease`
   
4. **Release name:** `1.2.1 (5)` (verzija + versionCode)
5. **Release notes:**
   ```
   🔧 Nova funkcionalnost:
   • Duplikat detekcija kod dodavanja servisa
   • Mogućnost brisanja servisa (pojedinačno ili grupno)
   • Oporavak slučajno obrisanih dizala
   • Fiksano: Tipkovnica više ne prekriva polja za unos

   📝 Poboljšanja:
   • Tri-state filtriranje dizala (aktivna/neaktivna/obrisana)
   • Opcija trajnog brisanja dizala
   • Automatska provjera duplikata prije spremanja servisa
   ```

6. **Testers:**
   - Dodaj email adrese ljudi koji će testirani (do 100 je free)
   - Oni će dobiti link za download preko Google Play Store

7. Klikni **Save** → **Review release** → **Start rollout to Internal testing**

**Trajanje:** Internal testing app dostupan u roku 1-2 sata.

---

### Korak 6: Closed Testing / Open Testing (Opciono)

Nakon što internal testing prođe dobro:

1. **Closed Testing (Alpha/Beta):**
   - Testiranje s većom grupom (1000+ ljudi)
   - Invitation required ili public link

2. **Open Testing:**
   - Javno dostupno svima na Play Store
   - Označeno kao "Beta"

3. Isti proces kao Internal: Upload AAB → Release notes → Rollout

---

### Korak 7: Production Release

Kada je sve testirano:

1. Idi na **Production** tab
2. Klikni **Create new release**
3. Upload **ISTI AAB** kao u testing (Google provjerava signature)
4. Release notes (na hrvatskom):
   ```
   Dobrodošli u APPEL - sustav za upravljanje servisiranjem dizala!

   Funkcionalnosti:
   🔧 Evidencija servisa s checklistama
   🔨 Praćenje popravaka i troškova
   📍 Google Maps integracija
   💬 Chat komunikacija
   📱 Offline podrška

   Kontakt za podršku: [tvoj email]
   ```

5. **Countries/regions:** Odaberi gdje će biti dostupna (Hrvatska, regija, world)
6. Klikni **Save** → **Review release** → **Start rollout to Production**

**Google Review Process:**
- Trajanje: **2-3 dana** (može biti i brže, do 7 dana u rijetkim slučajevima)
- Google će testirati app na malware, policy violations, itd.
- Dobiš email kad je objavljeno

---

## 🎉 APP JE LIVE!

Nakon što Google odobri:

- **Play Store URL:** `https://play.google.com/store/apps/details?id=com.appel.elevators`
- Korisnici mogu pretraživati: "APPEL Elevator Service"
- Automatski updates ako objave novu verziju

---

## 🔄 KAKO RADITI UPDATE (Nova verzija)

### Korak 1: Promijeni verziju u `app.config.js`

```javascript
android: {
  versionCode: 6,  // Povećaj za 1 (mora biti veći od prethodnog!)
  // ...
},
version: "1.2.2",  // Semantic versioning
ios: {
  buildNumber: "6",
}
```

### Korak 2: Build novi AAB

```powershell
Set-Location C:\Users\vidac\appel\mobile\android
.\gradlew.bat clean
.\gradlew.bat bundleRelease
```

### Korak 3: Upload na Google Play Console

1. Idi u **Production** (ili Testing)
2. **Create new release**
3. Upload **novi AAB**
4. Dodaj **Release notes** (što je novo/fiksirano)
5. **Rollout**

**Google automatski:**
- ✅ Detektira da je nova verzija (versionCode 6 > 5)
- ✅ Notificira korisnike da je update dostupan
- ✅ Auto-update ako imaju omogućeno

**Trajanje reviewa:** 1-2 dana (brže za updates nego za prvi upload)

---

## 📊 GOOGLE PLAY CONSOLE - Korisne Sekcije

### Dashboard
- **Install statistics:** Broj instalacija, aktivnih korisnika
- **Ratings & reviews:** Ocjene korisnika
- **Crashes & ANRs:** Error monitoring (ako app crashira)

### Release Management
- **Production, Testing, Internal testing:** Upravljanje verzijama
- **Release dashboard:** Rollout percentage control

### User Feedback
- **Ratings and reviews:** Odgovori na komentare korisnika
- **Pre-launch reports:** Google automatski testira app na raznim deviceima

### Statistics
- **User acquisition:** Odakle dolaze instalacije
- **Retention:** Koliko korisnika ostaje
- **Financial:** (ako imaš in-app purchases)

---

## ⚠️ NAJČEŠĆE GREŠKE I RJEŠENJA

### ❌ "Upload failed: You already uploaded a version with this version code"

**Rješenje:**
```javascript
// U app.config.js - povećaj versionCode
android: { versionCode: 6 }  // Bilo 5, sada 6
```

### ❌ "App signing key mismatch"

**Uzrok:** Koristio si drugi keystore file.

**Rješenje:** Koristi **ISTI** `appel-release.keystore` za sve updateove! (zato backup!)

### ❌ "Missing privacy policy"

**Rješenje:** Dodaj Privacy Policy URL u Store Listing tab.

### ❌ "Feature graphic required"

**Rješenje:** Upload 1024x500px sliku (može biti jednostavnija, samo logo+tekst).

### ❌ "Minimum 2 screenshots required"

**Rješenje:** Screenshot-aj barem 2 ekrana i upload.

---

## 💡 TIPS & BEST PRACTICES

### 1. **Google Play App Signing** (PREPORUČENO)

Google nudi da oni čuvaju keystore umjesto tebe:
- Aktiviraj u Play Console: **Release > Setup > App signing**
- Upload svoj keystore prvi put
- Google generira novi "Play App Signing Key"
- Ti držiš "Upload Key" (manje kritično ako ga izgubiš)

**Benefit:** Ako izgubiš keystore, Google može pomoći.

### 2. **Staged Rollouts**

Kada uploadas novi release, možeš rollout postupno:
```
Day 1: 10% korisnika
Day 3: 50%
Day 5: 100%
```
Ako ima crasheva, zaustaviš rollout i fixaš.

### 3. **Pre-launch Report**

Google automatski testira app na 20+ devisa i pokazuje:
- Screenshots na raznim ekranima
- Crashes (ako ima)
- Performance issues

Provjeri prije finalnog releasea!

### 4. **Respond to Reviews**

Korisnici cijene kad developer odgovori na review:
- Pozitivan review: "Hvala na podršci!"
- Negativan review: "Žao nam je, možete li opisati problem?"

Povećava rating i trust.

### 5. **Release Schedule**

Optimalno vrijeme za release:
- **Utorak-Četvrtak:** Najbržи Google review
- **Ponedjeljak/Petak:** Može biti sporije
- **Vikend:** Najsporije

---

## 🔐 SECURITY CHECKLIST

- [ ] `appel-release.keystore` backup na sigurno mjesto (Google Drive + USB)
- [ ] Password zapisat na sigurno (password manager)
- [ ] `gradle.properties` s passwordima dodano u `.gitignore` (ako je public repo)
- [ ] Privacy Policy objavljen i URL dodano u Play Console
- [ ] Test app na bar 2-3 različita uređaja prije production releasea
- [ ] ProGuard/R8 obfuscation enabled za release (već je u buildu)

---

## 📞 SUPPORT & RESOURCES

**Google Play Console:**
- https://play.google.com/console

**Official Android Documentation:**
- https://developer.android.com/studio/publish

**React Native Signed APK Guide:**
- https://reactnative.dev/docs/signed-apk-android

**Expo + Google Play:**
- https://docs.expo.dev/submit/android/

**Problem s reviewom?**
- Play Console Support: https://support.google.com/googleplay/android-developer

---

## ✅ SUMMARY - Quick Action List

1. ✅ Generiraj production keystore (`keytool`)
2. ✅ Konfigurirај `build.gradle` i `gradle.properties`
3. ✅ Build signed AAB (`.\gradlew.bat bundleRelease`)
4. ✅ Kreiraj Google Play Developer Account ($25)
5. ✅ Popuni Store Listing (name, description, screenshots)
6. ✅ Kreiraj Privacy Policy i upload URL
7. ✅ Upload AAB u Internal Testing
8. ✅ Testiraj s par ljudi (1-2 dana)
9. ✅ Rollout u Production
10. ✅ Čekaj Google review (2-3 dana)
11. 🎉 **APP LIVE na Google Play Store!**

---

**Pitanja? Javi se!** 🚀
