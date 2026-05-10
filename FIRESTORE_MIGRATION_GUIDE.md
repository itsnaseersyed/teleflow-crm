# Firestore Migration Pattern Guide

This guide shows the exact patterns to apply to remaining route files. Each pattern is copy-paste ready.

## Key Mappings

### Auth Changes
- `user.id` → `user.uid`
- `session` → `user`
- `supabase.from()` → Firestore `collection()` queries

### Field Name Mappings (Supabase → Firestore)
- `customer_name` → `customerName`
- `mobile_number` → `mobileNumber`
- `lead_status` → `leadStatus`
- `telecaller_id` → `telecallerId`
- `created_by` → `createdBy`
- `assigned_to` → `assignedTo`
- `follow_up_date` → `followUpDate`
- `feedback_notes` → `feedbackNotes`
- `interested_course` → `interestedCourse`
- `full_name` → `fullName`
- `profile_image` → `profileImage`
- `is_active` → `isActive`
- `read_status` → `readStatus`
- `created_at` → `createdAt`

---

## Pattern 1: Simple SELECT Query

### Before (Supabase)
```typescript
const { data, error } = await supabase.from("leads").select("*").order("created_at", { ascending: false });
```

### After (Firestore)
```typescript
import { collection, query, orderBy, getDocs } from "firebase/firestore";
import { db } from "@/services/firestore/client";

const q = query(collection(db, "leads"), orderBy("createdAt", "desc"));
const snapshot = await getDocs(q);
const leads = snapshot.docs.map((doc) => ({
  id: doc.id,
  ...doc.data(),
  createdAt: doc.data().createdAt?.toDate?.() || new Date(),
}));
```

---

## Pattern 2: WHERE Clause Query

### Before (Supabase)
```typescript
const { data } = await supabase.from("calls").select("*").eq("telecaller_id", user.id);
```

### After (Firestore)
```typescript
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/services/firestore/client";

const q = query(collection(db, "calls"), where("telecallerId", "==", user.uid));
const snapshot = await getDocs(q);
const calls = snapshot.docs.map((doc) => ({
  id: doc.id,
  ...doc.data(),
  createdAt: doc.data().createdAt?.toDate?.() || new Date(),
}));
```

---

## Pattern 3: INSERT

### Before (Supabase)
```typescript
const { error } = await supabase.from("calls").insert({
  telecaller_id: user.id,
  lead_id: leadId,
  customer_name: name,
  call_status: "completed",
});
```

### After (Firestore)
```typescript
import { collection, addDoc, setDoc, doc } from "firebase/firestore";
import { db } from "@/services/firestore/client";

// Option A: Auto-generated ID
const callRef = await addDoc(collection(db, "calls"), {
  telecallerId: user.uid,
  leadId,
  customerName: name,
  callStatus: "completed",
  createdAt: new Date(),
});

// Option B: Custom ID
const customId = "call_" + Date.now();
const callRef = doc(db, "calls", customId);
await setDoc(callRef, {
  telecallerId: user.uid,
  leadId,
  customerName: name,
  callStatus: "completed",
  createdAt: new Date(),
});
```

---

## Pattern 4: UPDATE

### Before (Supabase)
```typescript
const { error } = await supabase.from("leads").update({ lead_status: "Contacted" }).eq("id", leadId);
```

### After (Firestore)
```typescript
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/services/firestore/client";

await updateDoc(doc(db, "leads", leadId), {
  leadStatus: "Contacted",
  updatedAt: new Date(),
});
```

---

## Pattern 5: DELETE

### Before (Supabase)
```typescript
const { error } = await supabase.from("leads").delete().eq("id", id);
```

### After (Firestore)
```typescript
import { doc, deleteDoc } from "firebase/firestore";
import { db } from "@/services/firestore/client";

await deleteDoc(doc(db, "leads", id));
```

---

## Pattern 6: COUNT Query

### Before (Supabase)
```typescript
const { count } = await supabase.from("calls").select("id", { count: "exact", head: true }).eq("telecaller_id", user.id);
return count || 0;
```

### After (Firestore)
```typescript
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/services/firestore/client";

const q = query(collection(db, "calls"), where("telecallerId", "==", user.uid));
const snapshot = await getDocs(q);
return snapshot.size;
```

---

## Pattern 7: JOIN (Multiple Collections)

### Before (Supabase)
```typescript
const { data } = await supabase
  .from("user_roles")
  .select("user_id, profiles:profiles!inner(id, full_name, email)")
  .eq("role", "telecaller");
```

### After (Firestore)
```typescript
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/services/firestore/client";

// In Firestore, roles are stored in the users document
const q = query(collection(db, "users"), where("role", "==", "telecaller"));
const snapshot = await getDocs(q);
const telecallers = snapshot.docs.map((d) => ({
  id: d.id,
  name: d.data().fullName,
  email: d.data().email,
}));
```

---

## Pattern 8: MULTIPLE WHERE (AND condition)

### Before (Supabase)
```typescript
const { data } = await supabase.from("calls").select("*").eq("lead_id", leadId).eq("status", "completed");
```

### After (Firestore)
```typescript
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/services/firestore/client";

const q = query(
  collection(db, "calls"),
  where("leadId", "==", leadId),
  where("callStatus", "==", "completed")
);
const snapshot = await getDocs(q);
```

---

## Pattern 9: ORDER BY + LIMIT

### Before (Supabase)
```typescript
const { data } = await supabase
  .from("calls")
  .select("*")
  .eq("telecaller_id", user.id)
  .order("created_at", { ascending: false })
  .limit(10);
```

### After (Firestore)
```typescript
import { collection, query, where, orderBy, limit, getDocs } from "firebase/firestore";
import { db } from "@/services/firestore/client";

const q = query(
  collection(db, "calls"),
  where("telecallerId", "==", user.uid),
  orderBy("createdAt", "desc"),
  limit(10)
);
const snapshot = await getDocs(q);
```

---

## Pattern 10: Converting Timestamps

### Firestore Timestamp → JavaScript Date
```typescript
const createdAt = doc.data().createdAt;
const jsDate = createdAt.toDate?.() || new Date(createdAt);
console.log(jsDate); // JavaScript Date object
```

### JavaScript Date → Firestore (in setDoc/addDoc/updateDoc)
```typescript
await setDoc(doc(db, "leads", leadId), {
  createdAt: new Date(),  // Firestore will auto-convert
  // OR
  createdAt: serverTimestamp(), // Use server timestamp for consistency
});
```

### Using serverTimestamp (recommended)
```typescript
import { serverTimestamp } from "firebase/firestore";

await setDoc(doc(db, "leads", leadId), {
  name: "New Lead",
  createdAt: serverTimestamp(),  // Server automatically sets current time
});
```

---

## Import Statement Template

Add this to any file using Firestore:

```typescript
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/services/firestore/client";
import { useAuth } from "@/lib/auth";
```

---

## Files to Migrate

1. **src/routes/_app.calls.new.tsx** - Create calls + leads
2. **src/routes/_app.dashboard.tsx** - Dashboard stats
3. **src/routes/_app.followups.tsx** - Update followups
4. **src/routes/_app.profile.tsx** - User stats
5. **src/routes/_app.reports.tsx** - Reports with grouping
6. **src/routes/_app.settings.tsx** - Update user profile
7. **src/routes/_app.users.tsx** - List all users

## useQuery Hook Pattern

All route files use React Query. The pattern remains the same:

```typescript
const { data: items = [], isLoading } = useQuery({
  queryKey: ["items"],
  queryFn: async () => {
    const q = query(collection(db, "items"), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.() || new Date(),
    }));
  },
});
```

## useMutation Hook Pattern

```typescript
const createItem = useMutation({
  mutationFn: async (form: any) => {
    await addDoc(collection(db, "items"), {
      ...form,
      createdBy: user.uid,
      createdAt: serverTimestamp(),
    });
  },
  onSuccess: () => {
    toast.success("Item created!");
    queryClient.invalidateQueries({ queryKey: ["items"] });
  },
  onError: (e: any) => toast.error(e.message),
});
```

---

## Common Issues & Solutions

### Issue: "user is null but trying to access user.uid"
**Solution:** Check `if (!user) return;` before using user properties

### Issue: "TypeScript error: Property 'id' does not exist on type 'User'"
**Solution:** Change `user.id` to `user.uid` (Firebase Auth uses `uid`, not `id`)

### Issue: "Firestore queries not returning data"
**Solution:** Check Firestore Security Rules - make sure they allow the query. Temporarily set to:
```firestore
match /{document=**} {
  allow read, write: if request.auth != null;
}
```

### Issue: "Cannot read property 'toDate' of undefined"
**Solution:** Always check if timestamp exists: `doc.data().createdAt?.toDate?.() || new Date()`

---

## Next Steps

1. **Backup current files** before making changes
2. **Apply one pattern at a time**, testing after each change
3. **Run `np tsc --noEmit`** after each file to check types
4. **Test in browser** - login, create a lead, verify in Firestore console
5. **Set proper Firestore Security Rules** after testing

