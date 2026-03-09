import { initializeApp, getApps, getApp } from "firebase/app";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  initializeAuth,
  getAuth,
  getReactNativePersistence,
  Auth,
} from "firebase/auth";

function mustGetEnv(name: string): string {
  const value = process.env[name];

  if (!value || typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing env var: ${name}`);
  }

  return value;
}

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

let auth: Auth;

try {
  auth = initializeAuth(firebaseApp, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  auth = getAuth(firebaseApp);
}

export { auth };