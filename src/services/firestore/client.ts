import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyA7tRUWFCTcO1RC0qNMZ3gRTvcLX_K3iAk",
  authDomain: "telecall-crm.firebaseapp.com",
  projectId: "telecall-crm",
  storageBucket: "telecall-crm.firebasestorage.app",
  messagingSenderId: "404364888166",
  appId: "1:404364888166:web:36abec136b6528c5f645a7",
};

if (!firebaseConfig.apiKey || !firebaseConfig.authDomain || !firebaseConfig.projectId) {
  const missing = [
    ...(!firebaseConfig.apiKey ? ["VITE_FIREBASE_API_KEY"] : []),
    ...(!firebaseConfig.authDomain ? ["VITE_FIREBASE_AUTH_DOMAIN"] : []),
    ...(!firebaseConfig.projectId ? ["VITE_FIREBASE_PROJECT_ID"] : []),
  ];
  console.error(
    `[Firebase] Missing environment variable(s): ${missing.join(", ")}. Please check .env.local or Cloudflare secrets.`,
  );
}

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
