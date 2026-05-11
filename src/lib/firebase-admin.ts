import { cert, getApps, initializeApp, type ServiceAccount } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

type FirebaseAdminEnv = {
  FIREBASE_SERVICE_ACCOUNT_JSON?: string;
  FIREBASE_ADMIN_PROJECT_ID?: string;
  FIREBASE_ADMIN_CLIENT_EMAIL?: string;
  FIREBASE_ADMIN_PRIVATE_KEY?: string;
};

function normalizePrivateKey(privateKey: string) {
  return privateKey.replace(/\\n/g, "\n");
}

function resolveServiceAccount(env: FirebaseAdminEnv): ServiceAccount {
  if (env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON) as ServiceAccount;
  }

  if (!env.FIREBASE_ADMIN_PROJECT_ID || !env.FIREBASE_ADMIN_CLIENT_EMAIL || !env.FIREBASE_ADMIN_PRIVATE_KEY) {
    throw new Error(
      "Missing Firebase admin credentials. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY.",
    );
  }

  return {
    projectId: env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: normalizePrivateKey(env.FIREBASE_ADMIN_PRIVATE_KEY),
  } as ServiceAccount;
}

export function getFirebaseAdminServices(env: unknown) {
  const serviceAccount = resolveServiceAccount(env as FirebaseAdminEnv);
  const app =
    getApps().find((instance) => instance.name === "teleflow-admin") ??
    initializeApp(
      {
        credential: cert(serviceAccount),
        projectId: serviceAccount.projectId,
      },
      "teleflow-admin",
    );

  return {
    auth: getAuth(app),
    firestore: getFirestore(app),
  };
}
