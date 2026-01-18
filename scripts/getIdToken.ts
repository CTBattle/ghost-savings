import "dotenv/config";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY!,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.FIREBASE_PROJECT_ID!,
  appId: process.env.FIREBASE_APP_ID!,
};

async function main() {
  const email = process.env.TEST_EMAIL;
  const password = process.env.TEST_PASSWORD;

  if (!email || !password) {
    throw new Error("Missing TEST_EMAIL or TEST_PASSWORD in .env");
  }

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);

  const cred = await signInWithEmailAndPassword(auth, email, password);
  const token = await cred.user.getIdToken(true);

  // stdout: token only
  process.stdout.write(token + "\n");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("getIdToken error:", e);
    process.exit(1);
  });
