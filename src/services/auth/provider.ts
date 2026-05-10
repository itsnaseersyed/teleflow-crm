import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
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
