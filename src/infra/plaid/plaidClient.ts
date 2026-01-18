import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

// IMPORTANT: Secrets/env vars may contain trailing \n or \r (especially from Secret Manager uploads).
// Header values cannot contain those characters, so always trim.
const PLAID_CLIENT_ID = (process.env.PLAID_CLIENT_ID ?? "").trim();
const PLAID_SECRET = (process.env.PLAID_SECRET ?? "").trim();
const PLAID_ENV = (process.env.PLAID_ENV ?? "sandbox").trim() as keyof typeof PlaidEnvironments;

/**
 * Create a Plaid client only when we actually need it.
 * This lets the server boot (and /health pass) in environments that don't have Plaid secrets (e.g., CI).
 */
export function getPlaidClient(): PlaidApi {
  if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
    throw new Error(
      "Missing PLAID_CLIENT_ID or PLAID_SECRET (after trim). Set env vars before calling Plaid routes."
    );
  }

  const configuration = new Configuration({
    basePath: PlaidEnvironments[PLAID_ENV] ?? PlaidEnvironments.sandbox,
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": PLAID_CLIENT_ID,
        "PLAID-SECRET": PLAID_SECRET,
      },
    },
  });

  return new PlaidApi(configuration);
}
