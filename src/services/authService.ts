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

    const trimmedEmail = email.trim();
    const lowerEmail = trimmedEmail.toLowerCase();

    try {
      // 1. Fetch user record from Firestore to determine login method
      let q = query(collection(db, "users"), where("email", "==", lowerEmail));
      let snapshot = await getDocs(q);

      if (snapshot.empty && lowerEmail !== trimmedEmail) {
        q = query(collection(db, "users"), where("email", "==", trimmedEmail));
        snapshot = await getDocs(q);
      }

      if (!snapshot.empty) {
        const userDoc = snapshot.docs[0];
        const userData = userDoc.data();

        // CASE A: Telecaller (Database-managed password)
        if (userData.password) {
          if (userData.password !== password) {
            throw new Error("Invalid email or password");
          }

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
            await updateDoc(userDoc.ref, { 
              authUid: currentUser.uid,
              lastLogin: serverTimestamp() 
            });
            
            return currentUser;
          } catch (anonError: any) {
            console.error("[Auth] Anonymous fallback failed:", anonError);
            if (anonError.code === 'auth/operation-not-allowed' || anonError.code === 'auth/admin-restricted-operation') {
              throw new Error("Login failed: Anonymous authentication is disabled. Please enable it in Firebase Console.");
            }
            throw new Error(`Fallback login failed: ${anonError.message}`);
          }
        }
      }

      // CASE B: Admin or unknown (Standard Firebase Auth)
      // We use the original trimmed email here for maximum compatibility with Auth records
      const cred = await signInWithEmailAndPassword(auth, trimmedEmail, password);
      return cred.user;

    } catch (fbError: any) {
      // If we already threw a specific error above, re-throw it
      if (fbError instanceof Error && !fbError.hasOwnProperty('code')) {
        throw fbError;
      }

      // Translate common Firebase errors
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
