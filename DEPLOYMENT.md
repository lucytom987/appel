# APPEL Backend - Deployment Guide

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
