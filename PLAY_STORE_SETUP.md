# 🚀 Google Play Store - Quick Start

## 📋 Koraci koje trebaš napraviti ODMAH:

### 1️⃣ Generiraj Production Keystore (5 minuta)

```powershell
# Navigiraj u app folder
Set-Location C:\Users\vidac\appel\mobile\android\app

# Generiraj keystore
keytool -genkeypair -v -storetype PKCS12 -keystore appel-release.keystore -alias appel-key-alias -keyalg RSA -keysize 2048 -validity 10000
```

**Što će pitati (primjer za pojedinca):**
```
Enter keystore password: [ZAPAMTI - npr: AppelSecure2026!]
Re-enter new password: [PONOVI ISTI]
What is your first and last name? Vida Cmarin
Organization unit? Individual  
Organization? Personal
City? [tvoj grad]
State? [županija]
Country code? HR
Correct? yes
Enter key password: [ISTI kao keystore password!]
```

**KRITIČNO:** 
- Zapiši password negdje SIGURNO (Google Drive, password manager)
- Backup `appel-release.keystore` file - BEZ njega ne možeš updateat app!

---

### 2️⃣ Konfiguriraj Gradle Properties

Otvori: `mobile\android\gradle.properties`

Na kraju filea, **zakomentirano** imaš:
```properties
#APPEL_RELEASE_STORE_FILE=appel-release.keystore
#APPEL_RELEASE_KEY_ALIAS=appel-key-alias
#APPEL_RELEASE_STORE_PASSWORD=YourSecurePassword
#APPEL_RELEASE_KEY_PASSWORD=YourSecurePassword
```

**Promijeni u:**
```properties
APPEL_RELEASE_STORE_FILE=appel-release.keystore
APPEL_RELEASE_KEY_ALIAS=appel-key-alias
APPEL_RELEASE_STORE_PASSWORD=AppelSecure2026!
APPEL_RELEASE_KEY_PASSWORD=AppelSecure2026!
```
(koristi svoj password koji si stavio u korak 1)

**⚠️ VAŽNO:** Ako je GitHub repo PUBLIC - NE stavljaj passworde ovdje! Koristi environment varijable ili drugu metodu.

---

### 3️⃣ Build Signed Release (15 minuta)

```powershell
# Navigiraj u android folder
Set-Location C:\Users\vidac\appel\mobile\android

# Clean build
.\gradlew.bat clean

# Build AAB (za Google Play Store)
.\gradlew.bat bundleRelease

# Ili APK (za testiranje)
.\gradlew.bat assembleRelease
```

**Output:**
```
✅ AAB: mobile/android/app/build/outputs/bundle/release/app-release.aab
✅ APK: mobile/android/app/build/outputs/apk/release/app-release.apk
```

**Provjeri da je signed:**
```powershell
jarsigner -verify -verbose -certs app/build/outputs/apk/release/app-release.apk

# Očekujem: "jar verified."
```

---

### 4️⃣ Kreiraj Google Play Developer Account

1. **Idi na:** https://play.google.com/console/signup
2. **Sign in** s Google accountom
3. **Odaberi Personal account (pojedinac)**
4. **Plati $25 USD** jednokratno
5. **Popuni profil** (ime, email, phone, adresa; website opciono)
6. **Dovrši verifikaciju identiteta** ako Google zatraži
7. **Čekaj approval** (par sati do 48h)

> Ne trebaš imati firmu/organizaciju za objavu appa na Google Playu.

---

### 5️⃣ Screenshoti i Assets (10 minuta)

**Što trebaš pripremiti:**

1. **App Icon** - već imaš u `mobile/assets/icon.png` ✅

2. **Feature Graphic** (1024 x 500 px):
   - Canva.com (besplatno)
   - Dodaj logo + tekst "APPEL - Elevator Service Management"
   
3. **Screenshoti** (minimalno 2):
   - Instaliraj app na telefon/emulator
   - Screenshot:
     - Login screen
     - Home (lista dizala)
     - Service checklist
     - Elevator details
   - Dimenzije: 1080 x 1920 px (portrait)

4. **Privacy Policy:**
   - Kopiraj template iz [GOOGLE_PLAY_STORE.md](GOOGLE_PLAY_STORE.md#korak-4-privacy-policy)
   - Upload na:
     - GitHub Pages (besplatno)
     - Google Sites (besplatno)
     - Render static site
   - Trebaš samo URL

---

### 6️⃣ Upload na Google Play Console

1. **Create App** u Play Console
   - Ime: "APPEL - Elevator Service"
   - Jezik: Hrvatski
   - Free app

2. **Popuni Store Listing:**
   - Short description (80 chars max)
   - Full description (iz [GOOGLE_PLAY_STORE.md](GOOGLE_PLAY_STORE.md#korak-3-store-listing-main-tab))
   - Upload screenshots
   - Upload feature graphic
   - Privacy Policy URL

3. **Internal Testing:**
   - Create new release
   - Upload `app-release.aab`
   - Release notes
   - Add testers (tvoj email + par ljudi)
   - Rollout

4. **Testiraj 1-2 dana**

5. **Production Release:**
   - Promote from Internal Testing
   - Ili kreiraj novi release
   - Upload AAB
   - Countries: Croatia (ili worldwide)
   - Rollout

6. **Čekaj Google Review:** 2-3 dana

7. 🎉 **LIVE!**

---

## 🗓️ 1-Page Plan (Pojedinac + Hrvatska)

### Dan 1 (danas) - Tehnička priprema

- [ ] Generiraj keystore (`keytool`)
- [ ] Backup `appel-release.keystore` na 2 mjesta (npr. Drive + USB)
- [ ] U `gradle.properties` upiši release signing podatke
- [ ] Buildaj AAB: `./gradlew.bat bundleRelease`
- [ ] Provjeri da postoji: `mobile/android/app/build/outputs/bundle/release/app-release.aab`

### Dan 2 - Play Console (personal account)

- [ ] Registriraj Google Play Developer account kao **Personal account**
- [ ] Plati $25 jednokratno
- [ ] Dovrši identity verification (ako traži)
- [ ] Kreiraj app: `APPEL - Elevator Service`

### Dan 3 - Store materijali

- [ ] Napravi 2-4 screenshota (1080x1920)
- [ ] Napravi feature graphic (1024x500)
- [ ] Objavi privacy policy i uzmi javni URL
- [ ] Zalijepi short + full description u Store Listing

### Dan 4 - Internal testing rollout

- [ ] Upload `app-release.aab` u Internal testing
- [ ] Dodaj release notes
- [ ] Dodaj testere (tvoj email + 2-5 ljudi)
- [ ] Start rollout

### Dan 5-6 - Provjera na stvarnim uređajima

- [ ] Login, sync, offline/online, chat, servis/popravak flow
- [ ] Provjeri crasheve i edge slučajeve
- [ ] Ako treba fix, povećaj `versionCode` i ponovi upload

### Dan 7 - Production

- [ ] Promote u Production
- [ ] Odaberi državu: Hrvatska (ili više)
- [ ] Start production rollout
- [ ] Pričekaj review 2-3 dana

### Minimalni "Definition of Ready" prije slanja na review

- [ ] AAB je signed production keystoreom
- [ ] Privacy policy URL radi javno (bez logina)
- [ ] 2+ screenshots i feature graphic uploadani
- [ ] `versionCode` je veći od prethodnog releasea
- [ ] Release notes su dodane

---

## ⚡ Brzi Troubleshooting

**Q: Build failed - "Could not find APPEL_RELEASE_STORE_FILE"**  
A: Uncommentaj linije u `gradle.properties` (makni `#`)

**Q: "Keystore file not found"**  
A: Provjeri da je `appel-release.keystore` u `mobile/android/app/` folderu

**Q: "Wrong password"**  
A: Provjeri password u `gradle.properties` - mora biti ISTI kao pri generaciji

**Q: "You uploaded APK that is not zipaligned"**  
A: Koristi AAB umjesto APK: `.\gradlew.bat bundleRelease`

**Q: Play Console traži 2 screenshots a uploadao sam**  
A: Moguće wrong dimensions - mora biti minimalno 320px najkraća strana

---

## 📚 Detaljne upute

Za sve detalje, troubleshooting i best practices, vidi:
👉 **[GOOGLE_PLAY_STORE.md](GOOGLE_PLAY_STORE.md)**

---

## ✅ Checklist - Prije Uploada

- [ ] Production keystore generiran i backupan
- [ ] `gradle.properties` konfiguriran s passwordima
- [ ] AAB buildan i signed (`jarsigner -verify` potvrđuje)
- [ ] Google Play Developer account kreiran i plaćen
- [ ] 2+ screenshota spremna (1080x1920px)
- [ ] Feature graphic (1024x500px)
- [ ] Privacy Policy objavljena na URL-u
- [ ] Store listing popunjen (short + full description)
- [ ] Release notes napisane

**Go time!** 🚀
