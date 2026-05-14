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
      const q2 = query(collection(db, "users"), where("email", "==", email));
      const snap2 = await getDocs(q2);
      if (!snap2.empty) {
        const d = snap2.docs[0];
        return { id: d.id, ...d.data() } as any;
      }
    }

    return null;
  },

  /**
   * Sign in (Hybrid Logic)
   */
  async signIn(email: string, password: string) {
    try {
      // 1. Try standard Firebase Auth first
      const cred = await signInWithEmailAndPassword(auth, email, password);
      return cred.user;
    } catch (fbError: any) {
      // 2. Database-Only Fallback
      const q = query(
        collection(db, "users"), 
        where("email", "==", email), 
        where("password", "==", password)
      );
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        const userDoc = snapshot.docs[0];
        // Sign in Anonymously to get a session
        const anonCred = await signInAnonymously(auth);
        
        // Link the session
        await updateDoc(userDoc.ref, { 
          authUid: anonCred.user.uid,
          lastLogin: serverTimestamp() 
        });
        
        return anonCred.user;
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
