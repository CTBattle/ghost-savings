import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

const env = ((process.env.PLAID_ENV ?? "sandbox").trim()) as keyof typeof PlaidEnvironments;

// IMPORTANT: Secrets/env vars may contain trailing \n or \r (especially from Secret Manager uploads).
// Header values cannot contain those characters, so always trim.
const PLAID_CLIENT_ID = (process.env.PLAID_CLIENT_ID ?? "").trim();
const PLAID_SECRET = (process.env.PLAID_SECRET ?? "").trim();

if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
  throw new Error("Missing PLAID_CLIENT_ID or PLAID_SECRET (after trim). Check Secret Manager + Cloud Run env.");
}

const configuration = new Configuration({
  basePath: PlaidEnvironments[env],
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": PLAID_CLIENT_ID,
      "PLAID-SECRET": PLAID_SECRET,
    },
  },
});

export const plaid = new PlaidApi(configuration);
