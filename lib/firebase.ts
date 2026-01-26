// lib/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  initializeAuth,
  getReactNativePersistence,
  Auth,
} from "firebase/auth";

function mustGetEnv(name: string): string {
  const v = process.env[name];
  if (!v || typeof v !== "string") {
    throw new Error(
      `Missing env var: ${name}. Check your app config / .env and restart Expo (-c).`
    );
  }
  return v;
}

// ✅ Firebase Web config (must be real strings)
const firebaseConfig = {
  apiKey: mustGetEnv("EXPO_PUBLIC_FIREBASE_API_KEY"),
  authDomain: mustGetEnv("EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN"),
  projectId: mustGetEnv("EXPO_PUBLIC_FIREBASE_PROJECT_ID"),
  storageBucket: mustGetEnv("EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: mustGetEnv("EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
  appId: mustGetEnv("EXPO_PUBLIC_FIREBASE_APP_ID"),
};

export const firebaseApp =
  getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// ✅ React Native persistence (prevents logout on app close)
let auth: Auth;
try {
  auth = initializeAuth(firebaseApp, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch (e: any) {
  // If initializeAuth was already called (Fast Refresh / dev reload), fall back
  // to the existing instance attached to the app.
  auth = (firebaseApp as any)._auth;
}

export { auth };
