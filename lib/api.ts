// lib/api.ts
import { auth } from "./firebase";

const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL?.trim() || "http://127.0.0.1:3333";

/**
 * Get a Firebase ID token for the current user.
 * Uses cached token when valid (fast), refreshes automatically when needed.
 */
async function getIdTokenOrThrow() {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in (no Firebase user).");
  return await user.getIdToken(); // <-- don't force refresh every time
}

async function request(
  path: string,
  options: RequestInit = {},
  config: { auth?: boolean } = { auth: true }
) {
  const headers = new Headers(options.headers || {});

  // Attach Authorization header unless explicitly disabled
  if (config.auth !== false) {
    const token = await getIdTokenOrThrow();
    headers.set("Authorization", `Bearer ${token}`);
  }

  // Only set JSON content-type when we are sending a JSON body
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const text = await res.text();
  let json: any = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // non-JSON response; leave json null
  }

  if (!res.ok) {
    const msg = json ? JSON.stringify(json) : text;
    throw new Error(`${res.status} ${res.statusText}: ${msg}`);
  }

  return json;
}

// --------- Exported API functions ---------

/** Public endpoint (no auth) */
export async function health() {
  return request("/health", { method: "GET" }, { auth: false });
}

export async function ping() {
  return request("/ping", { method: "GET" });
}

export async function getDashboard() {
  return request("/dashboard", { method: "GET" });
}

export async function startChallenge(body: { startAmountCents: number }) {
  return request("/challenge/start", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
