# APPEL Backend - Deployment Guide

## One-Command Release (Automatski)

Za full release flow (version bump + app/about/update endpoint vrijednosti + testovi + commit + push + Android build) koristi:

```powershell
cd C:\Users\vidac\appel
.\release.cmd -Bump patch -Message "release: opis promjena"
```

Napomene:
- `-Bump patch|minor|major` kontrolira semantic verziju.
- Android `versionCode` i iOS `buildNumber` se automatski povecavaju za `+1`.
- Render deploy krece automatski nakon `git push` (ako je auto-deploy ukljucen).
- Ako zelis preskociti build: dodaj `-SkipBuild`.
- Ako zelis samo provjeru bez izmjena: dodaj `-DryRun`.

## 🚀 Deploy na Render (BESPLATNO)

### Korak 1: Pripremi GitHub repository

1. Kreiraj novi GitHub repo: https://github.com/new
   - Ime: `appel`
   - Public ili Private (oboje radi)

2. Push kod na GitHub:
```powershell
cd C:\Users\vidac\appel
git init
git add .
git commit -m "Initial commit - APPEL backend ready for deployment"
git branch -M main
git remote add origin https://github.com/TVOJ-USERNAME/appel.git
git push -u origin main
```

### Korak 2: Kreiraj Render account

1. Idi na: https://render.com/
2. Klikni **Get Started** → Sign up with GitHub
3. Autoriziraj Render da pristupa tvojim GitHub repozitorijima

### Korak 3: Deploy backend

1. U Render dashboardu, klikni **New +** → **Web Service**
2. Odaberi svoj `appel` repozitorij
3. Podešavanja:
   - **Name:** `appel-backend`
   - **Region:** Frankfurt (EU)
   - **Branch:** `main`
   - **Root Directory:** `backend`
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free

4. Environment Variables (klikni "Advanced"):
   - `NODE_ENV` = `production`
   - `MONGODB_URI` = `mongodb+srv://vidacmarin:dD1D2mPD4KQKrvPJ@cluster0.mongodb.net/appel-db?retryWrites=true&w=majority` (kopiraj iz .env)
   - `JWT_SECRET` = `appel-super-secret-key-2025` (generiraj random)
   - `CORS_ORIGIN` = `*`
   - `PORT` = `10000` (Render default)

5. Klikni **Create Web Service**

### Korak 4: Čekaj deployment (2-3 minute)

Render će:
- ✅ Klonirati tvoj repo
- ✅ Instalirati dependencies (`npm install`)
- ✅ Pokrenuti server (`npm start`)
- ✅ Dati ti URL: `https://appel-backend.onrender.com`

### Korak 5: Testiraj live backend

```powershell
# Testiraj da li server radi
curl https://appel-backend.onrender.com/

# Trebao bi dobiti:
# { "message": "APPEL Backend - Elevator Service API v2.0" }
```

---

## 🌐 Tvoj LIVE Backend URL

Nakon deploymenta, tvoj backend će biti dostupan na:
```
https://appel-backend.onrender.com
```

Svi API endpoints:
- `POST https://appel-backend.onrender.com/api/auth/login`
- `GET https://appel-backend.onrender.com/api/elevators`
- `POST https://appel-backend.onrender.com/api/services`
- itd.

---

## ⚠️ Render Free Tier Ograničenja

- ✅ Besplatno zauvijek
- ⚠️ **Spava nakon 15 min neaktivnosti** (prvi request traje 30-60s da se probudi)
- ✅ 750 sati mjesečno (dovoljno za development)
- ✅ Automatski HTTPS/SSL
- ✅ Automatski redeploy kada pushaš na GitHub

### Kako spriječiti sleep?

Dodaj besplatni "ping" servis kao **UptimeRobot** ili **Cron-job.org**:
- Pingi `https://appel-backend.onrender.com/` svakih 14 minuta
- Backend nikad ne zaspi

---

## 🔄 Kako ažurirati backend?

Jednostavno pushaj novi kod na GitHub:
```powershell
git add .
git commit -m "Update API"
git push
```

Render će **automatski** redeployati u 2-3 minute!

---

## 📱 Kako koristiti s mobilnom aplikacijom?

U mobilnoj aplikaciji promijeni API URL:
```javascript
// Umjesto localhost:
const API_URL = 'https://appel-backend.onrender.com/api';

// Sada radi sa BILO KOJEG uređaja!
```

---

## 💰 Upgrade na plaćeni plan (7$/mjesec)

Ako želiš da backend **nikad ne zaspi**:
- Render Starter plan: $7/mjesec
- 0s cold start
- Uvijek online

Ali za development, **free tier je sasvim OK**! ✅

---

## 📱 MOBILE BUILD & DEPLOY - Kompletna Procedura

### Kada kažeš "BUILD I DEPLOJ" - slijedi ove korake:

#### 1️⃣ Provjeri Backend

```powershell
# Navigiraj u backend direktorij
Set-Location C:\Users\vidac\appel\backend

# Instaliraj dependencies (ako ima novih)
npm install

# Testiraj da li server radi lokalno
npm start
# Očekujem: Server running on port 5000, MongoDB connected
# Ctrl+C za zaustaviti
```

#### 2️⃣ Pripremi Mobile Build

```powershell
# Navigiraj u mobile direktorij
Set-Location C:\Users\vidac\appel\mobile

# Instaliraj dependencies
npm install
```

#### 3️⃣ Build Android APK

```powershell
# Navigiraj u android direktorij
Set-Location C:\Users\vidac\appel\mobile\android

# CLEAN BUILD (ako je potrebno - ako build faila ili ima problema)
.\gradlew.bat --stop
Remove-Item -Recurse -Force .\.cxx -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force .\app\.cxx -ErrorAction SilentlyContinue

# BUILD RELEASE APK
.\gradlew.bat assembleRelease
```

**Očekivani output:**
```
BUILD SUCCESSFUL in 12-15m
605 actionable tasks: 478 executed, 127 up-to-date
```

**APK lokacija:**
```
mobile/android/app/build/outputs/apk/release/app-release.apk
```

#### 4️⃣ Verificiraj Build

```powershell
# Vrati se u root direktorij
Set-Location C:\Users\vidac\appel

# Provjeri git status
git status --short

# Provjeri da li APK postoji
Test-Path mobile/android/app/build/outputs/apk/release/app-release.apk
# Očekujem: True
```

#### 5️⃣ Deploy (Git Push)

```powershell
# Stage sve promjene
git add .

# Commit s opisnom porukom
git commit -m "Feature: [opis promjena]"

# Push na GitHub (triggerira Render auto-deploy)
git push origin main
```

**Što se događa nakon pusha:**
- ✅ GitHub prima promjene
- ✅ Render detektira push na `main` branch
- ✅ Render automatski redeploya backend (2-3 minute)
- ✅ Backend dostupan na: `https://appel-backend.onrender.com`

---

### 🔧 Troubleshooting - Najčešći Problemi

#### Problem: Gradle build failed s CMake greškama

**Rješenje:**
```powershell
# Zaustavi sve Gradle daemone
.\gradlew.bat --stop

# Obriši native cache
Remove-Item -Recurse -Force .\.cxx -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force .\app\.cxx -ErrorAction SilentlyContinue

# Buildaj bez clean stepa
.\gradlew.bat assembleRelease
```

#### Problem: Metro bundler timeout

**Rješenje:**
```powershell
# Povećaj Node memoriju
$env:NODE_OPTIONS="--max-old-space-size=4096"
.\gradlew.bat assembleRelease
```

#### Problem: Git push odbijen (rejected)

**Rješenje:**
```powershell
# Pull latest prvo
git pull origin main --rebase

# Pa onda push
git push origin main
```

---

### 📋 Brzi Checklist - "BUILD I DEPLOJ"

- [ ] Backend: `npm install` + `npm start` test
- [ ] Mobile: `npm install`
- [ ] Android: Clean `.cxx` ako treba
- [ ] Build: `.\gradlew.bat assembleRelease` (12-15min)
- [ ] Verify: APK postoji u `build/outputs/apk/release/`
- [ ] Git: `add` → `commit` → `push origin main`
- [ ] Check: Render dashboard za deployment status

**Trajanje:** ~15-20 minuta (većinu vremena build APK)

---

### 🎯 Skraćena verzija (Ako je sve već instalirano)

```powershell
# Build APK
Set-Location C:\Users\vidac\appel\mobile\android
.\gradlew.bat assembleRelease

# Deploy
Set-Location C:\Users\vidac\appel
git add .
git commit -m "Feature: [opis]"
git push origin main
```
