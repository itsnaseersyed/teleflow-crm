import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  signInAnonymously,
  signOut as firebaseSignOut,
  User as FirebaseUser 
} from "firebase/auth";
import { doc, getDoc, collection, query, where, getDocs, updateDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./firestore/client";
import { User } from "./firestore/types";

export const authService = {
  /**
   * Listen to auth state changes
   */
  onAuthStateChanged(callback: (user: FirebaseUser | null) => void) {
    return onAuthStateChanged(auth, callback);
  },

  /**
   * Get user profile from Firestore
   */
  async getUserProfile(uid: string, email?: string): Promise<User | null> {
    // 1. Try by UID first
    let snap = await getDoc(doc(db, "users", uid));
    if (snap.exists()) {
      return { id: snap.id, ...snap.data() } as any;
    }

    // 2. Search by authUid field (for Anonymous linked accounts)
    const q1 = query(collection(db, "users"), where("authUid", "==", uid));
    const snap1 = await getDocs(q1);
    if (!snap1.empty) {
      const d = snap1.docs[0];
      return { id: d.id, ...d.data() } as any;
    }

    // 3. Fallback: Search by email if provided
    if (email) {
      const lowerEmail = email.toLowerCase();
      const q2 = query(collection(db, "users"), where("email", "==", lowerEmail));
      const snap2 = await getDocs(q2);
      if (!snap2.empty) {
        const d = snap2.docs[0];
        return { id: d.id, ...d.data() } as any;
      }
      
      // Also try original case just in case some records are not normalized
      const q3 = query(collection(db, "users"), where("email", "==", email));
      const snap3 = await getDocs(q3);
      if (!snap3.empty) {
        const d = snap3.docs[0];
        return { id: d.id, ...d.data() } as any;
      }
    }

    return null;
  },

  /**
   * Sign in (Hybrid Logic)
   */
  async signIn(email: string, password: string) {
    if (!email || !password) {
      throw new Error("Email and password are required");
    }

    const lowerEmail = email.toLowerCase().trim();

    try {
      // 1. Try standard Firebase Auth first
      // Note: Firebase Auth handles email case-insensitivity automatically
      const cred = await signInWithEmailAndPassword(auth, lowerEmail, password);
      return cred.user;
    } catch (fbError: any) {
      console.warn("[Auth] Standard login failed, trying fallback:", fbError.code || fbError.message);
      
      // 2. Database-Only Fallback (for Telecallers created via Admin UI)
      // Try both lowercased and original email for maximum compatibility
      let q = query(
        collection(db, "users"), 
        where("email", "==", lowerEmail), 
        where("password", "==", password)
      );
      let snapshot = await getDocs(q);

      if (snapshot.empty && lowerEmail !== email) {
        q = query(
          collection(db, "users"), 
          where("email", "==", email), 
          where("password", "==", password)
        );
        snapshot = await getDocs(q);
      }
      
      if (!snapshot.empty) {
        const userDoc = snapshot.docs[0];
        const userData = userDoc.data();

        if (userData.isActive === false) {
          throw new Error("This account has been deactivated. Please contact your administrator.");
        }
        
        try {
          // Sign in Anonymously to get a session if not already signed in
          let currentUser = auth.currentUser;
          if (!currentUser || !currentUser.isAnonymous) {
            const anonCred = await signInAnonymously(auth);
            currentUser = anonCred.user;
          }
          
          // Link the session
          // Note: This requires Firestore rules to allow the update
          await updateDoc(userDoc.ref, { 
            authUid: currentUser.uid,
            lastLogin: serverTimestamp() 
          });
          
          return currentUser;
        } catch (anonError: any) {
          console.error("[Auth] Anonymous fallback failed:", anonError);
          
          if (anonError.code === 'auth/operation-not-allowed' || anonError.code === 'auth/admin-restricted-operation') {
            throw new Error("Login failed: Anonymous authentication is disabled or sign-ups are restricted in your Firebase Console. Please enable 'Anonymous' in Auth -> Sign-in method and ensure 'Client-side sign-up' is NOT restricted in Settings -> User actions.");
          }
          
          if (anonError.code === 'permission-denied') {
            throw new Error("Login failed: Security policy prevented session linking. This usually happens if you're trying to log in to the same account from a different device. Please contact your admin to reset your session.");
          }
          throw new Error(`Fallback login failed: ${anonError.message}`);
        }
      }
      
      // If we got a 400 from Firebase but no user in DB, it's a real failure
      if (fbError.code === 'auth/invalid-credential' || fbError.code === 'auth/user-not-found' || fbError.code === 'auth/wrong-password') {
        throw new Error("Invalid email or password");
      }
      
      throw fbError;
    }
  },

  /**
   * Sign out
   */
  async signOut() {
    await firebaseSignOut(auth);
  }
};
