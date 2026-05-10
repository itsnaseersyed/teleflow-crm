# Complete Migration Plan: Lovable Cloud + Supabase → Firebase + Firestore

## Executive Summary
Migrate from Lovable Cloud's managed Supabase to self-hosted Firebase (Firestore DB, Firebase Auth, Firebase Storage). This removes Lovable dependency, Supabase lock-in, and gives you full control over infrastructure via Google Cloud/Firebase console.

**Timeline:** ~2-3 weeks for full migration (schema mapping + code replacement + testing)  
**Effort:** High (data model translation required, auth redesign, storage adapter)  
**Benefits:** Firebase scaling, no vendor lock-in to Lovable, use free tier or pay-as-you-go Google Cloud pricing

---

## Part 1: Understanding Current State vs. Target

### Current State (Lovable + Supabase)
| Component | Current | Problem |
|-----------|---------|---------|
| **Database** | Supabase (PostgreSQL) | Relational schema with RLS policies; managed by Lovable |
| **Auth** | Supabase Auth (JWT) | Email/password signup/signin; user_roles table for RBAC |
| **Storage** | Supabase Storage | S3-compatible object storage for files/images |
| **Build** | `@lovable.dev/vite-tanstack-config` | Bundled Vite plugins, dev helpers, error logging |
| **Secrets** | Lovable Cloud secrets manager | Lovable-managed env vars |
| **Deployment** | Cloudflare Workers via Lovable | Loving handles worker deployment |

### Target State (Firebase + TanStack Start)
| Component | Target | Benefit |
|-----------|--------|---------|
| **Database** | Firestore (NoSQL, real-time) | Schemaless, auto-scaling, real-time listeners |
| **Auth** | Firebase Auth (JWT/sessions) | Email, phone, social login; native role support via custom claims |
| **Storage** | Firebase Storage (Cloud Storage) | GCS-backed, same auth model, granular security rules |
| **Build** | Explicit Vite plugins (no Lovable) | Full control, transparent toolchain |
| **Secrets** | Environment variables (dev) + Google Secret Manager or Cloudflare Secrets (prod) | Self-managed, secure |
| **Deployment** | Cloudflare Workers (manual or CI/CD) | No Lovable intermediary |

---

## Part 2: Schema Mapping - Supabase PostgreSQL → Firestore NoSQL

### Current Supabase Tables

```
profiles (1:1 with auth.users)
├── id (UUID, FK to auth.users)
├── full_name (string)
├── email (string)
├── phone (string)
├── profile_image (string, URL)
├── is_active (boolean)
├── created_at (timestamp)

user_roles (M:1 with auth.users)
├── id (UUID)
├── user_id (UUID, FK auth.users)
├── role (enum: admin | telecaller)
├── created_at (timestamp)

leads (M:1 with auth.users x 2)
├── id (UUID)
├── customer_name (string)
├── mobile_number (string)
├── lead_status (string)
├── assigned_to (UUID, FK auth.users, nullable)
├── created_by (UUID, FK auth.users)
├── created_at (timestamp)

calls (M:1 with leads, M:1 with auth.users)
├── id (UUID)
├── lead_id (UUID, FK leads)
├── telecaller_id (UUID, FK auth.users)
├── customer_name (string)
├── call_status (string)
├── created_at (timestamp)

followups (M:1 with leads, M:1 with auth.users)
├── id (UUID)
├── lead_id (UUID, FK leads)
├── telecaller_id (UUID, FK auth.users)
├── followup_date (date)
├── status (string)
├── created_at (timestamp)

notifications (M:1 with auth.users)
├── id (UUID)
├── user_id (UUID, FK auth.users)
├── title (string)
├── message (string)
├── read_status (boolean)
├── created_at (timestamp)
```

### Firestore Equivalent Schema

Firestore is schemaless; collections store documents. No foreign keys; use document IDs as references.

```firestore
Collection: users
└── Document: {uid} (Firebase Auth UID)
    ├── email (string)
    ├── fullName (string)
    ├── phone (string)
    ├── profileImage (string, URL)
    ├── isActive (boolean)
    ├── role (string: admin | telecaller) // replaces user_roles table
    ├── createdAt (timestamp)

Collection: leads
└── Document: {leadId}
    ├── customerName (string)
    ├── mobileNumber (string)
    ├── leadStatus (string)
    ├── assignedTo (string: uid or null) // denormalized reference
    ├── createdBy (string: uid)
    ├── createdAt (timestamp)
    └── SubCollection: calls (optional, for relational integrity)
    └── SubCollection: followups (optional, for relational integrity)

Collection: calls
└── Document: {callId}
    ├── leadId (string: ref to leads/{leadId})
    ├── telecallerId (string: ref to users/{uid})
    ├── customerName (string)
    ├── callStatus (string)
    ├── createdAt (timestamp)

Collection: followups
└── Document: {followupId}
    ├── leadId (string: ref to leads/{leadId})
    ├── telecallerId (string: ref to users/{uid})
    ├── followupDate (timestamp or date string)
    ├── status (string)
    ├── createdAt (timestamp)

Collection: notifications
└── Document: {notificationId}
    ├── userId (string: ref to users/{uid})
    ├── title (string)
    ├── message (string)
    ├── readStatus (boolean)
    ├── createdAt (timestamp)
```

### Key Translation Differences
| Aspect | Supabase | Firestore | Migration Notes |
|--------|----------|-----------|-----------------|
| **Primary Key** | UUID field | Document ID (auto or custom) | Use Firebase `doc().id` or `setDoc(docRef, {...})` with custom ID |
| **Foreign Keys** | Explicit FK + joins | Store ID as string field | App handles joins; use `getDoc()` or `collection().where()` |
| **Indexes** | Auto on PK; manual on others | All fields indexed; custom for queries | Create composite indexes for multi-field queries |
| **RLS Policies** | SQL RLS rules | Firestore Security Rules (JSON) | Rewrite SQL into rule conditions |
| **Transactions** | SQL transactions | Firestore batch writes + transactions | Use `writeBatch()` for multi-doc writes |
| **Timestamps** | `created_at timestamp` | `serverTimestamp()` | Use `firestore.Timestamp` or server time to ensure consistency |
| **Enums** | `CREATE TYPE app_role AS ENUM` | String field with validation | Validate in code or Firestore Rules |
| **Aggregations** | `COUNT()` in SQL | No native aggregation; use Firestore Extension (paid) or client-side | Count stored as document field; increment on create/delete |

---

## Part 3: Remove & Replace Detailed Map

### 1. **Remove: Lovable Build Plugin**
- **File:** [package.json](package.json) Line 72
- **Remove:** `"@lovable.dev/vite-tanstack-config": "^1.5.1"`
- **Replace with:**
  ```json
  "@vitejs/plugin-react": "^5.0.4",
  "vite-tsconfig-paths": "^6.0.2",
  "@cloudflare/vite-plugin": "^1.25.5"
  ```
- **Installation:**
  ```bash
  npm remove @lovable.dev/vite-tanstack-config
  npm install -D @vitejs/plugin-react vite-tsconfig-paths @cloudflare/vite-plugin
  ```

### 2. **Replace: vite.config.ts**
- **File:** [vite.config.ts](vite.config.ts)
- **Current:** Uses `@lovable.dev/vite-tanstack-config`
- **Replace with:**
  ```typescript
  import { defineConfig } from "vite";
  import react from "@vitejs/plugin-react";
  import tsconfigPaths from "vite-tsconfig-paths";
  import cloudflare from "@cloudflare/vite-plugin";

  export default defineConfig({
    plugins: [
      react(),
      tsconfigPaths(),
      cloudflare(),
    ],
    resolve: {
      alias: {
        "@": new URL("./src", import.meta.url).pathname,
      },
    },
  });
  ```

### 3. **Remove: Supabase Client Files**
- **Files to remove/replace:**
  - `src/integrations/supabase/client.ts` → `src/services/firestore/client.ts`
  - `src/integrations/supabase/client.server.ts` → `src/services/firestore/client.server.ts`
  - `src/integrations/supabase/auth-middleware.ts` → `src/services/auth/middleware.ts`
  - `src/integrations/supabase/types.ts` → `src/services/firestore/types.ts` (auto-generated from Firestore)

### 4. **Replace: Authentication System**
- **File:** `src/lib/auth.tsx`
- **Remove:** All `supabase.auth.*` calls
- **Replace with:** Firebase Auth SDK calls:
  ```typescript
  import { 
    auth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
  } from "firebase/auth";
  import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
  import { db } from "@/services/firestore/client";
  
  // Fetch user role from Firestore
  const loadProfile = async (uid: string) => {
    const userDoc = await getDoc(doc(db, "users", uid));
    if (userDoc.exists()) {
      const data = userDoc.data();
      setRole(data.role as AppRole);
      setFullName(data.fullName);
    }
  };
  ```
- **Context shape:** Keep identical to minimize UI changes
  - session → user (Firebase User object)
  - user → user object
  - role → role (admin | telecaller)
  - fullName → fullName
  - loading, signOut, refreshRole → same implementations

### 5. **Replace: Database Queries**
- **Pattern:** All route files use `supabase.from(...).select(...)`
- **Replace with:** Firestore queries using `collection()`, `query()`, `where()`, `getDocs()`, `setDoc()`, `addDoc()`, `updateDoc()`
- **Example route migration (login.tsx):**
  ```typescript
  // OLD (Supabase)
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  
  // NEW (Firebase)
  import { signInWithEmailAndPassword } from "firebase/auth";
  import { auth } from "@/services/firestore/client";
  
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  ```

### 6. **Replace: Storage**
- **File:** Anywhere using `supabase.storage`
- **Remove:** Supabase Storage operations
- **Replace with:** Firebase Storage SDK:
  ```typescript
  import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
  import { storage } from "@/services/firestore/client";
  
  const storageRef = ref(storage, `profile-images/${uid}`);
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);
  ```

### 7. **Update: Environment Variables**
- **Remove:**
  ```
  VITE_SUPABASE_URL
  VITE_SUPABASE_PUBLISHABLE_KEY
  SUPABASE_SERVICE_ROLE_KEY
  SUPABASE_URL
  SUPABASE_PUBLISHABLE_KEY
  ```
- **Add (for Firebase):**
  ```
  VITE_FIREBASE_API_KEY
  VITE_FIREBASE_AUTH_DOMAIN
  VITE_FIREBASE_PROJECT_ID
  VITE_FIREBASE_STORAGE_BUCKET
  VITE_FIREBASE_MESSAGING_SENDER_ID
  VITE_FIREBASE_APP_ID
  ```
- **For server-side admin operations (optional):**
  ```
  FIREBASE_SERVICE_ACCOUNT_KEY (JSON string)
  FIREBASE_PROJECT_ID
  ```

### 8. **Update: Branding & Comments**
- **Files:** [src/routes/__root.tsx](src/routes/__root.tsx), error messages
- **Remove:** "Lovable" from meta tags, author, error messages
- **Replace with:** Your app name/team

### 9. **Update: Deployment & Secrets**
- **File:** [wrangler.jsonc](wrangler.jsonc) (keep; Cloudflare Workers remains same)
- **New:** Add Firebase config to secrets via `wrangler secret put` or Cloudflare dashboard:
  ```bash
  wrangler secret put VITE_FIREBASE_API_KEY
  wrangler secret put VITE_FIREBASE_AUTH_DOMAIN
  wrangler secret put FIREBASE_SERVICE_ACCOUNT_KEY
  ```

### 10. **Remove: Supabase Config**
- **File:** `supabase/config.toml` (can delete or archive)
- **File:** `supabase/migrations/*.sql` (convert to Firestore setup script or archive for reference)

---

## Part 4: Step-by-Step Implementation

### Phase 1: Setup Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create new project:
   - Name: "callwise-crm" (or your choice)
   - Enable Google Analytics (optional)
3. In Firebase Console, enable:
   - **Cloud Firestore** (Start in production mode; set rules later)
   - **Authentication** (Enable email/password provider)
   - **Storage** (Create default bucket)
4. Copy credentials:
   - Go to **Project Settings** → **Your Apps** → **Web**
   - Copy Firebase config object (contains API key, auth domain, project ID, etc.)

### Phase 2: Create Firebase Integration Files

**File: `src/services/firestore/client.ts`**
```typescript
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
```

**File: `src/services/firestore/client.server.ts`**
```typescript
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

const serviceAccount = JSON.parse(
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY || "{}"
);

let adminApp = getApps()[0];
if (!adminApp) {
  adminApp = initializeApp({
    credential: cert(serviceAccount),
    projectId: process.env.FIREBASE_PROJECT_ID,
  });
}

export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);
export const adminStorage = getStorage(adminApp);
```

**File: `src/services/firestore/types.ts`**
```typescript
// Auto-generated type definitions for Firestore collections

export interface User {
  uid: string;
  email: string;
  fullName: string;
  phone?: string;
  profileImage?: string;
  isActive: boolean;
  role: "admin" | "telecaller";
  createdAt: Date;
}

export interface Lead {
  id: string;
  customerName: string;
  mobileNumber: string;
  leadStatus: string;
  assignedTo?: string; // uid
  createdBy: string; // uid
  createdAt: Date;
}

export interface Call {
  id: string;
  leadId: string;
  telecallerId: string;
  customerName: string;
  callStatus: string;
  createdAt: Date;
}

export interface Followup {
  id: string;
  leadId: string;
  telecallerId: string;
  followupDate: Date | string;
  status: string;
  createdAt: Date;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  readStatus: boolean;
  createdAt: Date;
}
```

**File: `src/services/auth/provider.ts`**
```typescript
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "@/services/firestore/client";
import type { User as FirebaseUser } from "firebase/auth";

export async function signUp(email: string, password: string, fullName: string) {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const { uid } = userCredential.user;

  // Create user profile in Firestore
  await setDoc(doc(db, "users", uid), {
    email,
    fullName,
    isActive: true,
    role: "telecaller", // default role
    createdAt: new Date(),
  });

  return userCredential.user;
}

export async function signIn(email: string, password: string) {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  return userCredential.user;
}

export async function signOut() {
  await firebaseSignOut(auth);
}

export async function updateUserProfile(user: FirebaseUser, fullName: string) {
  await updateProfile(user, { displayName: fullName });
  const userRef = doc(db, "users", user.uid);
  await updateProfile(user, { displayName: fullName });
}
```

### Phase 3: Migrate `src/lib/auth.tsx`

Replace entire file with Firebase Auth implementation:

```typescript
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/services/firestore/client";
import { signOut as firebaseSignOut } from "@/services/auth/provider";
import type { User as FirebaseUser } from "firebase/auth";

export type AppRole = "admin" | "telecaller";

interface AuthContextValue {
  user: FirebaseUser | null;
  role: AppRole | null;
  fullName: string | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshRole: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (uid: string) => {
    try {
      const userDoc = await getDoc(doc(db, "users", uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        setRole((data.role as AppRole) || "telecaller");
        setFullName(data.fullName || null);
      }
    } catch (error) {
      console.error("Failed to load profile:", error);
      setRole("telecaller");
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        await loadProfile(currentUser.uid);
      } else {
        setRole(null);
        setFullName(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const value: AuthContextValue = {
    user,
    role,
    fullName,
    loading,
    signOut: firebaseSignOut,
    refreshRole: async () => {
      if (user) await loadProfile(user.uid);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
```

### Phase 4: Set Firestore Security Rules

**In Firebase Console → Firestore → Rules**, replace default with:

```firestore
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow authenticated users to read/write their own user doc
    match /users/{uid} {
      allow read: if request.auth.uid == uid || get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
      allow write: if request.auth.uid == uid && request.resource.data.role == resource.data.role;
    }

    // Leads: admin can read all, users can read assigned/created
    match /leads/{leadId} {
      allow read: if request.auth.uid != null && (
        resource.data.createdBy == request.auth.uid ||
        resource.data.assignedTo == request.auth.uid ||
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin'
      );
      allow create: if request.auth.uid != null;
      allow update: if request.auth.uid != null && (
        resource.data.createdBy == request.auth.uid ||
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin'
      );
      allow delete: if request.auth.uid != null && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }

    // Calls: telecaller/admin only
    match /calls/{callId} {
      allow read, write: if request.auth.uid != null;
    }

    // Followups: similar to calls
    match /followups/{followupId} {
      allow read, write: if request.auth.uid != null;
    }

    // Notifications: users can read their own
    match /notifications/{notificationId} {
      allow read: if resource.data.userId == request.auth.uid;
      allow write: if request.auth.uid != null;
    }
  }
}
```

### Phase 5: Migrate Route Files (Incremental)

**Example: Migrate `src/routes/login.tsx`**

```typescript
// OLD (Supabase)
import { supabase } from "@/integrations/supabase/client";

async function handleSignIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

// NEW (Firebase)
import { signIn } from "@/services/auth/provider";

async function handleSignIn(email: string, password: string) {
  await signIn(email, password);
}
```

**Example: Migrate `src/routes/_app.leads.tsx`**

```typescript
// OLD (Supabase)
const { data: leads } = await supabase.from("leads").select("*").order("created_at", { ascending: false });

// NEW (Firebase)
import { collection, query, orderBy, getDocs } from "firebase/firestore";
import { db } from "@/services/firestore/client";

const q = query(collection(db, "leads"), orderBy("createdAt", "desc"));
const snapshot = await getDocs(q);
const leads = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
```

**Example: Migrate `src/routes/_app.calls.new.tsx`** (create call)

```typescript
// OLD (Supabase)
const { data } = await supabase.from("calls").insert([
  { lead_id: leadId, telecaller_id: userId, customer_name: name, call_status: "completed" }
]).select().single();

// NEW (Firebase)
import { addDoc, collection } from "firebase/firestore";
import { db } from "@/services/firestore/client";

const callRef = await addDoc(collection(db, "calls"), {
  leadId,
  telecallerId: userId,
  customerName: name,
  callStatus: "completed",
  createdAt: new Date(),
});
```

### Phase 6: Replace Vite Config & Install Dependencies

```bash
# Remove Lovable, add Vite plugins
npm remove @lovable.dev/vite-tanstack-config
npm install -D @vitejs/plugin-react vite-tsconfig-paths @cloudflare/vite-plugin

# Add Firebase
npm install firebase firebase-admin
```

### Phase 7: Update `.env` (Development) and Secrets (Production)

**.env.local** (development):
```
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

**For Cloudflare Workers (production):**
```bash
wrangler secret put VITE_FIREBASE_API_KEY
wrangler secret put VITE_FIREBASE_AUTH_DOMAIN
wrangler secret put VITE_FIREBASE_PROJECT_ID
wrangler secret put VITE_FIREBASE_STORAGE_BUCKET
wrangler secret put VITE_FIREBASE_MESSAGING_SENDER_ID
wrangler secret put VITE_FIREBASE_APP_ID
```

If using admin SDK on server:
```bash
wrangler secret put FIREBASE_SERVICE_ACCOUNT_KEY  # paste entire JSON
wrangler secret put FIREBASE_PROJECT_ID
```

### Phase 8: Test & Validate

```bash
# Install dependencies
npm install

# Type check
npx tsc --noEmit

# Run dev server
npm run dev
```

Test flows:
- Sign up → verify user doc created in Firestore
- Sign in → verify auth context updates
- Create lead → verify document in Firestore
- Create call → verify reference to lead works
- Load profile → verify role/name loads correctly

### Phase 9: Data Migration (if existing users/leads)

**Option A: Export from Lovable Supabase, import to Firestore** (manual; use Firebase CLI or Firestore console bulk upload)

**Option B: Write migration script** (JavaScript + Node.js):
```typescript
import { adminDb } from "@/services/firestore/client.server";
import pg from "pg"; // Connect to old Supabase

const client = new pg.Client({
  connectionString: process.env.OLD_SUPABASE_URL,
});

async function migrateUsers() {
  const result = await client.query("SELECT * FROM profiles");
  for (const row of result.rows) {
    await adminDb.collection("users").doc(row.id).set({
      email: row.email,
      fullName: row.full_name,
      phone: row.phone,
      profileImage: row.profile_image,
      isActive: row.is_active,
      createdAt: row.created_at,
      role: "telecaller", // fetch from user_roles table
    });
  }
}

migrateUsers().catch(console.error);
```

### Phase 10: Build & Deploy

```bash
npm run build
wrangler publish
```

Verify in Cloudflare Workers dashboard that secrets are set and app loads.

---

## Part 5: Setup Checklist

- [ ] Firebase project created
- [ ] Firestore, Auth, Storage enabled
- [ ] Firebase config copied to `.env.local`
- [ ] `src/services/firestore/client.ts` created
- [ ] `src/services/firestore/client.server.ts` created
- [ ] `src/services/firestore/types.ts` created
- [ ] `src/services/auth/provider.ts` created
- [ ] `src/lib/auth.tsx` rewritten for Firebase
- [ ] `vite.config.ts` updated to remove Lovable plugin
- [ ] `package.json` updated (remove Lovable, add Firebase)
- [ ] All route files migrated from `supabase.from()` to Firestore queries
- [ ] Firestore Security Rules deployed
- [ ] `.env.local` filled with Firebase config
- [ ] `npm install && npm run dev` succeeds with no errors
- [ ] Login/signup flow tested in browser
- [ ] Create lead/call tested; verified data in Firestore console
- [ ] `npm run build` succeeds
- [ ] Production secrets set in Cloudflare/wrangler
- [ ] `wrangler publish` deploys successfully
- [ ] Deployed app tested end-to-end

---

## Part 6: Common Issues & Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| **"Missing env var VITE_FIREBASE_API_KEY"** | `.env.local` not set | Add Firebase config to `.env.local` or Cloudflare secrets |
| **onAuthStateChanged never fires** | Firebase not initialized | Ensure `client.ts` initializes before auth context mounts |
| **Firestore queries return empty** | Security Rules deny access | Check Rules; allow authenticated users in dev |
| **"auth property is undefined"** | Circular imports or race condition | Use lazy imports or wait for auth initialization |
| **Build fails with "firebase not found"** | Firebase not installed | Run `npm install firebase firebase-admin` |
| **Data not persisting after signup** | Firestore write fails silently | Add try/catch and check Rules; enable logging |
| **SSR issues with Firebase** | Firebase SDK tries to access window | Use server config for admin ops; client config only in browser |

---

## Part 7: Post-Migration Cleanup

1. Delete Lovable temp files and references:
   ```bash
   rm -rf supabase/config.toml
   rm -rf src/integrations/supabase/ (after migration complete)
   ```

2. Update README:
   - Replace "Lovable + Supabase" with "Firebase + Firestore"
   - Add Firebase setup instructions

3. Update CI/CD (GitHub Actions):
   ```yaml
   - name: Set Firebase secrets
     run: |
       wrangler secret put VITE_FIREBASE_API_KEY "${{ secrets.FIREBASE_API_KEY }}"
       wrangler secret put FIREBASE_SERVICE_ACCOUNT_KEY "${{ secrets.FIREBASE_SERVICE_ACCOUNT_KEY }}"
   ```

4. Backup old Supabase data (optional):
   ```bash
   pg_dump postgresql://<user>:<pass>@<host>/<db> > supabase_backup.sql
   ```

---

## Summary

**Removed:**
- `@lovable.dev/vite-tanstack-config` (build plugin)
- Supabase clients (`client.ts`, `client.server.ts`)
- Supabase auth middleware & types
- Environment variables (VITE_SUPABASE_*, SUPABASE_*)

**Added:**
- Firebase SDK & clients (`src/services/firestore/*`)
- Firebase Auth provider (`src/services/auth/provider.ts`)
- Firestore types (`src/services/firestore/types.ts`)
- Explicit Vite config (React + tsconfig-paths + Cloudflare)
- Firestore Security Rules

**Changed:**
- All database queries: `supabase.from()` → Firestore `collection().query()`
- Auth context: Supabase Auth → Firebase Auth
- Storage calls: `supabase.storage` → Firebase Storage
- Environment variables: map to Firebase config

**Effort:** ~2-3 weeks, highest complexity in auth redesign and Security Rules.

