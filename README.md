# 📞 TeleFlow CRM - Smart Lead Distribution System

**Status:** ✅ **PRODUCTION READY** | Build: `npm run build` → 0 errors  
**Last Updated:** May 2026

A production-ready Customer Relationship Management platform purpose-built for high-volume telecalling operations. TeleFlow CRM automates lead distribution, call tracking, and team management for 10-100+ person teams.

## 📚 Documentation

👉 **[Read the Complete Architecture & Workflows Guide](./ARCHITECTURE_AND_WORKFLOWS.md)** - Everything your team needs to understand and operate the system.

## ✨ Key Features

*   **Automated CSV Lead Import:** Drag-drop bulk lead uploads with validation, preview, and batch tracking
*   **Smart Lead Distribution:** Assign leads to telecallers using single-click, smart distribution, or bulk selection
*   **Real-time Telecaller Queue:** Assigned leads auto-advance after each call (zero manual navigation)
*   **Integrated Call Management:** Log call status, notes, and follow-up dates with one-click save
*   **Role-Based Access Control:** Admin dashboard vs focused Telecaller interface (no data overload)
*   **Admin Analytics:** Real-time metrics on leads, conversions, team performance, and pipeline
*   **Enterprise Security:** Firebase authentication + Firestore rules enforce role-based access at database level

## 🛠️ Technology Stack

*   **Frontend:** React 18 + TanStack Router + TanStack Query + Tailwind CSS
*   **Backend:** Firebase Authentication + Cloud Firestore
*   **Build:** Vite + TypeScript
*   **Components:** shadcn/ui + Lucide Icons
*   **Database Security:** Firestore Security Rules with role-based access control

## 🚀 Quick Start

### 1. Installation & Setup
```bash
# Clone and install dependencies
git clone <repo-url>
cd teleflow-crm
npm install

# Create .env.local with Firebase credentials
# See ARCHITECTURE_AND_WORKFLOWS.md → Deployment Guide
```

### 2. Start Development Server
```bash
npm run dev
# App opens at http://localhost:5173
```

### 3. First-Time Admin Setup
```
1. Login with master admin account (created in Firebase Console)
2. Go to Dashboard → Users → Create Telecaller Accounts
3. Share login credentials with team
4. Go to Import Leads → Upload CSV with 50-100 leads
5. Go to Lead Assignment → Distribute to team using Smart Distribution
6. Telecallers see leads instantly in "My Leads" queue!
```

## 📋 CSV Import Format

```csv
customer_name,mobile_number,city,interested_service,priority,remarks
Rajesh Kumar,9876543210,Mumbai,Web Development,High,Ready to join
Priya Singh,9765432109,Delhi,Mobile App,Medium,Call after 3 PM
```

**Required Columns:** `customer_name`, `mobile_number` (10-13 digits)  
**Optional Columns:** `city`, `interested_service`, `priority` (High/Medium/Low), `remarks`

## 🔒 Security Architecture

- **No Public Signup:** Only admins can create accounts (prevents unauthorized access)
- **Master Admin Only:** Single master admin provisions all team member accounts
- **Firestore Rules:** Database-level security prevents users from accessing other users' data
- **Real-time Locks:** Prevents simultaneous edits on same lead
- **Session-based Auth:** Firebase session tokens manage user sessions

## 📖 Team Documentation

### For Admins
Read: [ARCHITECTURE_AND_WORKFLOWS.md](./ARCHITECTURE_AND_WORKFLOWS.md#workflow-1-daily-lead-distribution)
- Daily lead import workflow
- Lead assignment strategies
- Team performance monitoring
- Deployment instructions

### For Telecallers
Read: [ARCHITECTURE_AND_WORKFLOWS.md](./ARCHITECTURE_AND_WORKFLOWS.md#3️⃣-telecaller-lead-queue)
- How to log into "My Leads"
- Call screen navigation
- Saving call status and feedback
- Queue auto-advance feature

## 📊 What's Included

| Component | Purpose | Status |
|-----------|---------|--------|
| CSV Lead Import | Bulk upload leads with validation | ✅ Complete |
| Lead Assignment | Distribute to team (single/bulk/smart) | ✅ Complete |
| My Leads Queue | Real-time assigned leads with auto-advance | ✅ Complete |
| Call Screen | Log calls, status, notes, follow-ups | ✅ Complete |
| Dashboard | Admin metrics & analytics | ✅ Complete |
| Daily Batch Mgmt | Date-grouped batches with safe deletion | ✅ Complete |
| Firestore Security | Role-based database access | ✅ Deployed |

## 🏗️ Project Structure

```
/src
├── routes/             # Page components (10 routes)
│   ├── _app.import-leads.tsx
│   ├── _app.lead-assignment.tsx
│   ├── _app.my-leads.tsx
│   ├── _app.lead.$leadId.call.tsx
│   └── ... (other admin routes)
├── components/         # Reusable UI components
│   ├── csv-upload.tsx  (import UI)
│   ├── app-sidebar.tsx (navigation)
│   └── ui/             (shadcn components)
├── lib/                # Utilities & services
│   ├── auth.tsx        (Firebase auth)
│   ├── csv-utils.ts    (CSV parsing)
│   ├── lead-utils.ts   (constants)
│   └── realtime-listeners.ts (Firestore subscriptions)
└── services/firestore/ # Firebase client config

firestore.rules        # Database security rules
.env.local            # Firebase credentials
```

## 🚢 Build & Deploy

```bash
# Production build (optimized, no errors)
npm run build

# Deploy to Firebase Hosting
firebase deploy --only hosting

# OR deploy to Vercel
vercel deploy
```

Verifies to 0 TypeScript errors and 2673 optimized modules.

## 🆘 Troubleshooting

**Leads not showing in Lead Assignment?**  
→ Check Firestore: Leads must have `leadStatus: "Unassigned"`

**Telecaller can't see assigned leads?**  
→ Verify `assignedTo` field matches telecaller UID in Firestore

**Import failing with duplicates?**  
→ Duplicate phone numbers are stored separately, not rejected

**Batch delete showing warning?**  
→ Reassign leads first or mark existing calls as archived

---

**For complete documentation, workflows, and deployment instructions, see [ARCHITECTURE_AND_WORKFLOWS.md](./ARCHITECTURE_AND_WORKFLOWS.md)**

**Version:** 1.0 Complete | **Build Status:** ✅ Production Ready | **Team Ready:** Go Live Immediately 
