import admin from "firebase-admin";

function initFirebaseAdmin() {
  if (admin.apps.length) return;

  const svcJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (svcJson) {
    const serviceAccount = JSON.parse(svcJson);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    return;
  }

  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

initFirebaseAdmin();

import type { DecodedIdToken } from "firebase-admin/auth";

// ...

export async function verifyIdToken(token: string): Promise<DecodedIdToken> {
  return admin.auth().verifyIdToken(token);
}

