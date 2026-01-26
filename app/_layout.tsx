import React from "react";
import { Stack } from "expo-router";
import { AuthProvider } from "../src/auth/AuthProvider";

// TEMP DEBUG: capture fatal JS errors (works in TestFlight too)
const originalHandler =
  // @ts-ignore
  global?.ErrorUtils?.getGlobalHandler?.() ||
  // @ts-ignore
  global?.ErrorUtils?._globalHandler;

try {
  // @ts-ignore
  global?.ErrorUtils?.setGlobalHandler?.((error: any, isFatal: boolean) => {
    console.log("🔥 GLOBAL JS ERROR:", error?.message || error);
    console.log("🔥 isFatal:", isFatal);
    console.log("🔥 stack:", error?.stack);

    // keep default behavior (still crashes if fatal)
    originalHandler?.(error, isFatal);
  });
} catch (e) {
  console.log("Failed to set global handler", e);
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: any }
> {
  state = { hasError: false, error: undefined };

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, info: any) {
    console.log("🔥 ErrorBoundary caught:", error);
    console.log("🔥 Component stack:", info?.componentStack);
  }

  render() {
    if (this.state.hasError) {
      // Minimal fallback so app doesn't hard-crash due to render tree error
      return null;
    }
    return this.props.children;
  }
}

export default function RootLayout() {
  console.log("✅ RootLayout render start");

  return (
    <ErrorBoundary>
      <AuthProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="modal" options={{ presentation: "modal" }} />
        </Stack>
      </AuthProvider>
    </ErrorBoundary>
  );
}
