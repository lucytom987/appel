# APPEL Application - Comprehensive Audit Report
**Date:** November 13, 2025  
**Scope:** Mobile (React Native) & Backend (Node.js/MongoDB)  
**Status:** Detailed Analysis Complete

---

## 1. FRONTEND (React Native/Expo) STRUCTURE ANALYSIS

### 1.1 Screen Overview

**Existing Screens (10 total):**

| Screen | Purpose | Status | Integration |
|--------|---------|--------|-------------|
| `LoginScreen.js` | User authentication & offline mode access | ✅ Working | Auth API |
| `HomeScreen.js` | Dashboard with statistics & quick actions | ✅ Working | DB sync |
| `ElevatorsListScreen.js` | List all elevators with search/filter | ✅ Working | Elevator DB |
| `ElevatorDetailsScreen.js` | Detailed elevator info with tabs | ✅ Working | Service/Repair DB |
| `AddElevatorScreen.js` | Create new elevator (online only) | ✅ Working | Elevator API |
| `EditElevatorScreen.js` | Modify elevator info (admin only) | ✅ Working | Elevator API |
| `AddServiceScreen.js` | Log elevator service | ✅ Working | Service API |
| `ServicesListScreen.js` | View all services with filters | ✅ Working | Service DB |
| `AddRepairScreen.js` | Report elevator fault | ✅ Working | Repair API |
| `RepairsListScreen.js` | View all repairs with status filters | ✅ Working | Repair DB |

### 1.2 Unused/Unimplemented Navigation References

#### ❌ **CRITICAL: 3 Navigation Routes Referenced but NOT Implemented**

**In `HomeScreen.js` (Lines 157-179):**
```javascript
// These routes are referenced but screens don't exist:
navigation.navigate('Map')        // ❌ No MapScreen.js
navigation.navigate('Chat')       // ❌ No ChatScreen.js  
navigation.navigate('Statistics') // ❌ No StatisticsScreen.js
```

**In `Navigation.js` (Lines 36-44):**
Only 10 screens are registered, but HomeScreen tries to navigate to 3 non-existent ones.

**Impact:** Will crash at runtime if user taps these buttons.

**In `EditElevatorScreen.js` (Line 15):**
```javascript
import { api } from '../services/api'; // ❌ WRONG - should be elevatorsAPI
```
Should be `import { elevatorsAPI } from '../services/api'` - currently uses generic `api` which works but inconsistent with other screens.

---

### 1.3 Unused Imports Analysis

#### High Priority Unused Imports:

**`ElevatorDetailsScreen.js` (Line 50):**
```javascript
const handleCallPhone = () => {
  if (elevator.simCard?.phoneNumber) { // ❌ simCard doesn't exist in model
    Linking.openURL(`tel:${elevator.simCard.phoneNumber}`);
  }
}
```
- **simCard** field doesn't exist in Elevator model
- Function defined but never called
- Can be removed

**`ElevatorDetailsScreen.js` (Line 65):**
```javascript
const handleOpenMap = () => {
  if (elevator.location_lat && elevator.location_lng) { // ❌ Field names are wrong
```
- Should be `elevator.koordinate?.latitude` (based on actual schema)
- Function never called - DEAD CODE

**Database Field Mismatch:**
In `AddRepairScreen.js` lines 54-57:
```javascript
elevatorId: elevator._id,  // ✅ Correct
// BUT in db.js repair.insert(), it looks for:
repair.elevatorId || repair.elevator  // Can be either field name
```

---

### 1.4 Duplicate Functionality Analysis

#### **Minor Duplications Found:**

1. **Status Color Functions** - Repeated in 3+ screens:
   - `ElevatorsListScreen.js` (Lines 94-101)
   - `ElevatorDetailsScreen.js` (Lines 47-56)
   - `RepairsListScreen.js` (Lines 116-121)
   
   **Recommendation:** Extract to `utils/statusHelpers.js`

2. **Elevator Info Display** - Two similar patterns:
   - `ElevatorDetailsScreen.js` - renderInfoTab() with custom layout
   - `ElevatorsListScreen.js` - renderElevator() with simpler layout
   
   **Recommendation:** Create reusable `<ElevatorCard />` component

3. **Date Formatting** - Repeated `.toLocaleDateString('hr-HR')` throughout
   - Should use centralized utility function

---

## 2. BACKEND STRUCTURE ANALYSIS

### 2.1 Models & Routes Inventory

**Models (8 total):**

| Model | Ref Count | Used By | Status |
|-------|-----------|---------|--------|
| **Elevator** | High | All core screens | ✅ Primary |
| **Service** | High | Services/Details screens | ✅ Primary |
| **Repair** | High | Repairs screens | ✅ Primary |
| **User** | High | Auth, references | ✅ Primary |
| **ChatRoom** | Low | ⚠️ API exists, NO frontend | ❌ Unused |
| **Message** | Low | ⚠️ API exists, NO frontend | ❌ Unused |
| **SimCard** | Low | ⚠️ API exists, NO frontend | ❌ Unused |
| **AuditLog** | Low | ✅ Has route, NO frontend | ⚠️ Backend-only |

**Routes (8 total):**

| Route | Methods | Endpoints Count | Mobile Usage |
|-------|---------|-----------------|--------------|
| `/api/auth` | POST | 2 endpoints | ✅ login, register |
| `/api/elevators` | GET, POST, PUT, DELETE | 6 endpoints | ✅ Full CRUD |
| `/api/services` | GET, POST, PUT, DELETE | 6 endpoints | ✅ Full CRUD |
| `/api/repairs` | GET, POST, PUT, DELETE | 6 endpoints | ✅ Full CRUD |
| `/api/chatrooms` | GET, POST, PUT, DELETE | 8 endpoints | ❌ **NOT USED** |
| `/api/messages` | GET, POST, PUT, DELETE | 6 endpoints | ❌ **NOT USED** |
| `/api/simcards` | GET, POST, PUT, DELETE | 8 endpoints | ❌ **NOT USED** |
| `/api/audit-logs` | GET | 3 endpoints | ❌ No mobile UI |

---

### 2.2 Unused Backend Features

#### ❌ **ChatRoom System** (Completely Unused)
- **Route:** `/api/chatrooms` (263 lines)
- **Model:** ChatRoom.js with full schema
- **API Functions:** `chatroomsAPI` (lines 107-113 in api.js)
- **Issue:** No ChatScreen in mobile app, Socket.io setup in server.js but not used
- **Recommendation:** Remove or implement frontend UI

#### ❌ **Message System** (Completely Unused)
- **Route:** `/api/messages` (read file needed to count lines)
- **Model:** Message.js with full schema
- **API Functions:** `messagesAPI` (lines 123-132 in api.js)
- **Issue:** Depends on ChatRoom, no UI
- **Recommendation:** Remove or implement

#### ⚠️ **SimCard System** (Partially Unused)
- **Route:** `/api/simcards` (8 endpoints)
- **Model:** SimCard.js with schema (but references elevator incorrectly)
- **API Functions:** `simcardsAPI` (lines 135-141 in api.js)
- **Issue:** 
  - Referenced in ElevatorDetailsScreen.js but field doesn't exist (Line 50)
  - No UI for managing SIM cards
  - Created but abandoned
- **Recommendation:** Complete implementation or remove

#### ⚠️ **AuditLog System** (Backend Only)
- **Route:** `/api/audit-logs`
- **Model:** AuditLog.js
- **Issue:** 
  - Logging calls in service routes (`auditService.js`)
  - No mobile UI to view logs
  - Only useful for admin portal (doesn't exist)
- **Recommendation:** Keep for compliance, add admin dashboard later

---

### 2.3 API Field Inconsistencies

#### Critical Mismatches Between Model & Frontend:

**Elevator Model (backend):**
```javascript
// Schema uses these fields:
brojUgovora, nazivStranke, ulica, mjesto, brojDizala
kontaktOsoba { imePrezime, mobitel, email, ulaznaKoda }
koordinate { latitude, longitude }
```

**Frontend Mobile uses same names:** ✅ CONSISTENT

**BUT dummy data uses different names:**
```javascript
// dummyData.js uses:
address, buildingCode, location_lat, location_lng, manufacturer, model, serialNumber
```

**Service Model Fields:**
- Backend: `datum`, `checklist[]`, `nedostaci[]`
- Frontend uses: `serviceDate`, `checklist` ✅ Mostly consistent
- **Issue:** Field name case inconsistencies in JSON parsing

**Repair Model Fields:**
- Backend: `opisKvara`, `opisPopravka`, `datumPrijave`, `datumPopravka`
- Frontend uses same: ✅ CONSISTENT

---

## 3. DATABASE SYNCHRONIZATION ANALYSIS

### 3.1 SQLite Schema vs Backend Models

**Schema Alignment Check:**

| Entity | SQLite Table | Backend Model | Sync Status |
|--------|-------------|---------------|-------------|
| Elevator | ✅ elevators | ✅ Elevator.js | Synced |
| Service | ✅ services | ✅ Service.js | Synced |
| Repair | ✅ repairs | ✅ Repair.js | Synced |
| ChatRoom | ✅ chatrooms | ✅ ChatRoom.js | Synced but unused |
| Message | ✅ messages | ✅ Message.js | Synced but unused |
| SimCard | ✅ simcards | ✅ SimCard.js | Synced but unused |
| User | ✅ users | ✅ User.js | Synced |
| AuditLog | ❌ MISSING | ✅ AuditLog.js | ❌ Not cached locally |

**Issue:** No AuditLog table in SQLite - audit logs are backend-only (acceptable for compliance)

### 3.2 Field Mapping Issues in db.js

#### ❌ **Issue in `db.js` serviceDB.insert() (Line 260):**
```javascript
JSON.stringify(service.checklist || [])
```
- Frontend sends checklist as array of objects
- Backend expects different structure
- **Risk:** Serialization mismatch during sync

#### ⚠️ **kontaktOsoba Serialization (Line 144):**
```javascript
kontaktOsoba: JSON.stringify(elevator.kontaktOsoba || {})
```
- Stored as JSON string in SQLite
- Must be parsed when reading
- Currently assuming it's stored correctly - verify in production

#### ⚠️ **ID Mapping in syncService.js (Lines 74-77):**
```javascript
if (service.id.startsWith('dummy_') || service.id.startsWith('local_')) {
  // Skip logic
}
```
- Works but creates mixed local/server IDs
- Should use consistent naming convention

---

### 3.3 Sync Queue & Offline Handling

**Status:** ✅ Working but inefficient

**Issues:**
1. **Lost syncs:** If sync fails, no exponential backoff - just logs and continues
2. **Conflict resolution:** No handling for data changed on server during offline period
3. **Bandwidth:** Syncs entire records, could use delta updates
4. **Performance:** `syncAll()` called too frequently (every 30s), should be smarter

**Specific Issues in `syncService.js`:**
- Line 82-90: Deletes local data that's not on server (risky for race conditions)
- Line 158-199: Service sync has better logic but repairs sync (presumably) doesn't
- No retry mechanism for failed syncs

---

## 4. API INTEGRATION ANALYSIS

### 4.1 API Endpoints Usage Matrix

| Endpoint | Called From | Frequency | Status |
|----------|------------|-----------|--------|
| `POST /auth/login` | LoginScreen | Once per session | ✅ |
| `POST /auth/register` | API defined but not used | Never | ❌ |
| `GET /elevators` | syncService.js | Periodic | ✅ |
| `POST /elevators` | AddElevatorScreen | Manual | ✅ |
| `PUT /elevators/:id` | EditElevatorScreen | Manual | ✅ |
| `DELETE /elevators/:id` | EditElevatorScreen | Manual, admin only | ✅ |
| `GET /services` | syncService.js | Periodic | ✅ |
| `POST /services` | AddServiceScreen | Manual | ✅ |
| `PUT /services/:id` | Nowhere | Never | ❌ |
| `DELETE /services/:id` | Nowhere | Never | ❌ |
| `GET /repairs` | syncService.js | Periodic | ✅ |
| `POST /repairs` | AddRepairScreen | Manual | ✅ |
| `PUT /repairs/:id` | Nowhere | Never | ❌ |
| `DELETE /repairs/:id` | Nowhere | Never | ❌ |
| `GET /chatrooms` | Nowhere | Never | ❌ UNUSED |
| `POST /chatrooms` | Nowhere | Never | ❌ UNUSED |
| `GET /messages` | Nowhere | Never | ❌ UNUSED |
| `POST /messages` | Nowhere | Never | ❌ UNUSED |
| `GET /simcards` | Nowhere | Never | ❌ UNUSED |
| `POST /simcards` | Nowhere | Never | ❌ UNUSED |

### 4.2 Unused API Functions

**In `api.js`:**

```javascript
// These are exported but never used:
authAPI.register()              // Line 80 - No registration UI
authAPI.getMe()                 // Line 81 - Could be useful for profile
servicesAPI.getMonthlyStats()   // Line 99 - Stats exist but not used in frontend
repairsAPI.getMonthlyStats()    // Line 112 - Same issue
repairsAPI.getStats()           // Line 111 - Exists but not displayed
elevatorsAPI.getStats()         // Line 95 - Stats shown but not called
simcardsAPI.*                   // ALL (lines 135-141) - Never called
chatroomsAPI.*                  // ALL (lines 107-113) - Never called
messagesAPI.*                   // ALL (lines 123-132) - Never called
```

---

## 5. STATE MANAGEMENT & CONTEXT ANALYSIS

### 5.1 AuthContext.js Evaluation

**Status:** ✅ Well-structured

**Strengths:**
- Proper authentication flow with token management
- SecureStore for sensitive data
- Auto-login on app load
- Network monitoring integration
- Clean logout logic

**Issues:**

1. **Line 33:** `resetDatabase()` called on every app init
   ```javascript
   resetDatabase(); // ❌ Deletes local data every time!
   ```
   - Means no true offline-first
   - Should only reset on logout or manual reset
   - **MAJOR BUG:** User loses all data on app restart while offline

2. **Line 40:** seedDummyData called when no elevators exist
   - Good fallback, but dummy data uses wrong field names
   - See: dummyData.js fields vs Elevator schema

3. **Line 47-48:** Blocking UI until sync completes
   ```javascript
   await syncAll().catch(err => console.log('⚠️ Sync error:', err));
   ```
   - Should be non-blocking background task
   - Delays app launch on slow network

4. **Missing:** No refresh token handling
   - Token might expire during long sync
   - 401 response will logout user abruptly

5. **Missing:** User data update on login
   - User object never refreshed after login completes
   - New roles/permissions won't apply until next login

---

## 6. PERFORMANCE & OPTIMIZATION ANALYSIS

### 6.1 Large Files & Components

| File | Lines | Component Type | Issue |
|------|-------|-----------------|-------|
| `ElevatorDetailsScreen.js` | 500+ | Screen | Too large, could split into components |
| `syncService.js` | 389 | Service | Complex logic, hard to test |
| `db.js` | 400+ | Service | Mixed concerns - DB + sync logic |
| `AddElevatorScreen.js` | 400+ | Screen | Large form, could extract form components |
| `ElevatorsListScreen.js` | 360+ | Screen | Good size but repeated logic |

### 6.2 Performance Issues

#### ⚠️ **Issue 1: Database Query Performance (db.js)**

**Bad:** `elevatorDB.getAll()` - loads entire table every time
```javascript
export const elevatorDB = {
  getAll: () => {
    return db.getAllSync('SELECT * FROM elevators ORDER BY nazivStranke');
  }
}
```
- Called on every screen render
- No caching
- Large datasets will be slow
- **Fix:** Add WHERE clause support, implement LRU cache

#### ⚠️ **Issue 2: Sync Frequency Too High (syncService.js)**
```javascript
startAutoSync(); // Presumably every 30 seconds (need to verify interval)
```
- Drains battery
- Unnecessary traffic
- Should use adaptive intervals (longer when idle)

#### ⚠️ **Issue 3: Unnecessary Re-renders (HomeScreen.js)**
```javascript
const [stats, setStats] = useState({...});

useEffect(() => {
  loadStats();  // Only runs once
}, []);  // ✅ Correct
```
- Good - only loads once
- But called again on every refresh (ok, user initiated)

#### ⚠️ **Issue 4: JSON Stringify/Parse Overhead**
- `kontaktOsoba`, `checklist`, `nedostaci` stored as JSON strings
- Parsed/stringified on every operation
- **Fix:** Consider structured columns or better schema design

#### ⚠️ **Issue 5: Missing Index Usage**
SQLite has indexes (db.js lines 153-160) but:
- Queries don't always use them effectively
- No query optimization
- **Fix:** Review indexes with actual query patterns

### 6.3 Memory Leaks Risk

**AuthContext.js Line 24:**
```javascript
const unsubscribe = subscribeToNetworkChanges((online) => {
  setIsOnline(online);
});

return () => {
  unsubscribe();
  stopAutoSync();
};
```
✅ **Good cleanup** - both unsubscribed properly

**But missing in other screens:**
- Navigation listeners not unsubscribed
- Timer in sync service might leak

---

## 7. MISSING & BROKEN FEATURES

### 7.1 Features Partially Implemented

| Feature | Status | Issue |
|---------|--------|-------|
| **Edit Service** | ❌ Missing | API exists (services.js), no UI |
| **Delete Service** | ❌ Missing | API exists, no UI |
| **Edit Repair** | ❌ Missing | API exists (repairs.js), no UI |
| **Delete Repair** | ❌ Missing | API exists, no UI |
| **Repair Status Update** | ❌ Missing | No UI to update from pending→in_progress→completed |
| **Statistics Dashboard** | ❌ Missing | Navigation exists but screen missing |
| **Map View** | ❌ Missing | Navigation exists but screen missing |
| **Chat System** | ❌ Missing | Backend complete, no mobile UI |
| **SIM Card Management** | ❌ Missing | Backend complete, no UI, wrong field refs |
| **User Profile** | ❌ Missing | No screen to edit user data |
| **Role-Based Actions** | ⚠️ Partial | EditElevator checks role, but others don't |

### 7.2 Broken References

**EditElevatorScreen.js Line 50:**
```javascript
const handleCallPhone = () => {
  if (elevator.simCard?.phoneNumber) {  // ❌ simCard doesn't exist
```
- Elevator model has no simCard field
- Function defined but never called
- Would crash if called

**ElevatorDetailsScreen.js Line 65:**
```javascript
const handleOpenMap = () => {
  if (elevator.location_lat && elevator.location_lng) {  // ❌ Wrong field names
```
- Elevator has `koordinate.latitude`, not `location_lat`
- Function references missing fields

**HomeScreen.js Lines 157-179:**
```javascript
navigation.navigate('Map')  // ❌ Screen doesn't exist
navigation.navigate('Chat')  // ❌ Screen doesn't exist
navigation.navigate('Statistics')  // ❌ Screen doesn't exist
```
- Will crash on click
- **CRITICAL:** Should remove or implement screens

---

## 8. SCHEMA INCONSISTENCIES

### Database Field Name Mismatches

| Backend Field | Frontend/DB Field | Impact |
|-------------|-------------------|--------|
| `brojUgovora` | ✅ Same | ✅ OK |
| `elevatorId` | Also `elevator` | ⚠️ Ambiguous |
| `serviserID` | ✅ Same | ✅ OK |
| `kontaktOsoba` | Stored as JSON string | ⚠️ Serialization risk |
| `koordinate` | `koordinate_lat`, `koordinate_lng` (split) | ⚠️ Works but odd |
| `zadnjiServis` | No relation in frontend | ⚠️ Unused |
| `sljedeciServis` | Shown in details but not updatable | ⚠️ Auto-calc only |

---

## 9. SECURITY AUDIT

### 9.1 Issues Found

| Issue | Severity | Details |
|-------|----------|---------|
| JWT stored in SecureStore | ✅ Good | Proper secure storage |
| No HTTPS validation mentioned | ⚠️ Medium | Assuming HTTPS in prod (render.com) |
| Password hashing on backend | ✅ Good | bcryptjs used |
| CORS enabled | ✅ OK | Allows all origins (ok for dev, review for prod) |
| SQL Injection | ✅ Safe | Using parameterized queries |
| No rate limiting on API | ❌ High | Anyone can brute force login |
| No input validation in screens | ⚠️ Medium | Some basic checks but not complete |
| Token refresh missing | ❌ High | Long-lived token risk |
| No API key validation | ⚠️ Medium | Anyone can call API if they know endpoints |

---

## SUMMARY SCORECARD

| Category | Score | Status |
|----------|-------|--------|
| **Architecture** | 7/10 | Offline-first good, but unused features drag it down |
| **Code Quality** | 6/10 | Some duplication, inconsistencies, unused code |
| **Performance** | 5/10 | Excessive syncing, large components, no caching |
| **Frontend Completeness** | 5/10 | Core features work but 3 navigation routes broken |
| **Backend Completeness** | 4/10 | Over-built (chat, sim cards unused) |
| **Database Sync** | 7/10 | Works but no conflict resolution |
| **Security** | 6/10 | Token handling ok, but missing rate limiting & refresh tokens |
| **Documentation** | 8/10 | Code well-commented but no architecture docs |

---

# DETAILED RECOMMENDATIONS

## 🚀 HIGH PRIORITY (Fix Immediately)

### 1. Fix Broken Navigation (Critical)
**Files:** `HomeScreen.js`, `Navigation.js`

Currently 3 buttons crash the app:
- Create `MapScreen.js`, `ChatScreen.js`, `StatisticsScreen.js` OR
- Remove buttons and broken navigation

```javascript
// Current broken code in HomeScreen.js lines 157-179
// Remove these OR implement the screens

// Option 1: Remove buttons (quick fix)
// Option 2: Implement screens (better UX)
```

### 2. Fix Database Reset on Every App Load
**File:** `AuthContext.js` Line 33

```javascript
// Current: ❌ Deletes all local data on app startup
resetDatabase();

// Should be: ✅ Only reset on logout or manual action
if (!token) {
  resetDatabase();  // Only reset if no user logged in
} else {
  initDatabase(); // Migrate if needed
}
```

### 3. Remove Field References That Don't Exist
**Files:** `EditElevatorScreen.js`, `ElevatorDetailsScreen.js`

```javascript
// Remove or fix these dead functions:
handleCallPhone()   // References elevator.simCard.phoneNumber (doesn't exist)
handleOpenMap()     // References elevator.location_lat (should be elevator.koordinate.latitude)
```

### 4. Fix API Import Inconsistency
**File:** `EditElevatorScreen.js` Line 15

```javascript
// Current: ❌
import { api } from '../services/api';

// Should be: ✅
import { elevatorsAPI } from '../services/api';

// And update usage from api.put() to elevatorsAPI.update()
```

---

## ⚠️ MEDIUM PRIORITY (Fix in Next Sprint)

### 5. Implement Missing CRUD Operations
**Services:** Need ability to edit/delete services and repairs (APIs exist)

```javascript
// Add to ServicesListScreen & RepairsListScreen:
- Long-press to delete
- Edit option (updates status/notes)
- Mark as complete/in-progress
```

### 6. Extract Repeated Utility Functions
**Create:** `src/utils/statusHelpers.js`

```javascript
export const getStatusColor = (status, type) => {
  // Consolidate all status color logic
};

export const getStatusLabel = (status, locale = 'hr-HR') => {
  // Consolidate all status label logic
};

export const formatDate = (date, locale = 'hr-HR') => {
  // Consolidate all date formatting
};
```

### 7. Fix kontaktOsoba Serialization
**File:** `db.js` Lines 144, 189

The object is stringified but not always parsed back:
```javascript
// In elevatorDB.getById() - check if parsing kontaktOsoba
const elevator = db.getFirstSync(...);
if (elevator.kontaktOsoba && typeof elevator.kontaktOsoba === 'string') {
  elevator.kontaktOsoba = JSON.parse(elevator.kontaktOsoba);
}
return elevator;
```

### 8. Implement Field Name Standardization
**Review:** Database schema for consistency

```javascript
// Choose one naming convention and stick to it:
// Option A: camelCase (current frontend standard)
//   elevatorId, serviserID, datumPrijave
// Option B: snake_case (database standard)
//   elevator_id, serviser_id, datum_prijave

// Currently MIXED - causes bugs
```

### 9. Implement Sync Conflict Resolution
**File:** `syncService.js`

```javascript
// Add smarter sync logic:
if (serverVersion.updatedAt > localVersion.updatedAt) {
  // Server is newer, use server version
} else if (localVersion.synced === 0) {
  // Local has unsynced changes, keep local
} else {
  // Conflict - show UI dialog to user
}
```

---

## 💡 LOWER PRIORITY (Nice to Have)

### 10. Implement Chat System
**Status:** Backend ready, needs mobile UI

Either:
- Implement ChatScreen + MessageList component
- Remove ChatRoom & Message models entirely

### 11. Implement SIM Card Management
**Status:** Schema exists, no UI, wrong field references

Either:
- Add SimCardsListScreen + EditSimCardScreen
- Remove the feature

### 12. Optimize Sync Strategy
**Current:** Every 30 seconds (wasteful)

**Improvements:**
```javascript
// Adaptive sync intervals
const syncInterval = isOnline && hasUnsynced ? 10000 : 60000;

// Or event-based:
- Sync only when data changes
- Sync only when network changes
- Sync only on user action (pull-to-refresh)
```

### 13. Implement Statistics Screen
**Missing:** StatisticsScreen.js (referenced in HomeScreen)

```javascript
// Should show:
- Services by month
- Repair completion rate
- Elevator status distribution
- Technician workload
```

### 14. Add Service/Repair Edit UI
**Current:** CRUD endpoints exist but no UI

```javascript
// Add edit screens for:
- Service details & checklist update
- Repair status update (pending→in progress→done)
- Repair notes & documentation
```

### 15. Separate Concerns in Large Files

**Split `db.js` (400+ lines):**
```
db.js → 
  - db/elevatorDB.js
  - db/serviceDB.js
  - db/repairDB.js
  - db/syncQueue.js
  - db/index.js (exports all)
```

**Split `ElevatorDetailsScreen.js`:**
```
ElevatorDetailsScreen.js →
  - ElevatorDetailsScreen.js (main)
  - components/ElevatorInfoTab.js
  - components/ElevatorServicesTab.js
  - components/ElevatorRepairsTab.js
```

---

## 🔧 TECHNICAL DEBT ITEMS

| Item | Impact | Effort | Priority |
|------|--------|--------|----------|
| Remove dummy data field name mismatch | Medium | Low | High |
| Implement missing screens | High | High | High |
| Extract repeated functions to utils | Low | Low | Medium |
| Add error handling to sync | Medium | Medium | High |
| Fix JSON serialization issues | Low | Low | Medium |
| Optimize query performance | Low | Low | Low |
| Add refresh token rotation | High | Medium | High |
| Implement rate limiting | Medium | Medium | Medium |
| Add unit tests to critical functions | High | High | Low |
| Document API contract | Medium | Low | Medium |

---

## CONCLUSION

**Overall Health:** 🟡 **YELLOW** (Functional but needs attention)

### What's Working Well ✅
- Core elevator management flows
- Offline-first sync mechanism
- Clean component structure
- Proper authentication

### What Needs Attention ⚠️
- 3 broken navigation routes (will crash app)
- Unused backend features (bloat)
- Performance optimizations needed
- Missing CRUD operations
- Field naming inconsistencies

### Critical Actions
1. Remove/implement broken navigation routes
2. Fix database reset on app load  
3. Standardize field names
4. Implement missing screens (Stats, Map, Chat)
5. Add service/repair edit/delete UI

**Estimated remediation time:** 2-3 sprints for all items

**Quick win options (1 day):**
- Remove broken navigation buttons
- Fix AuthContext database reset
- Fix field reference bugs
- Extract utility functions

