require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Configuration, PlaidApi, PlaidEnvironments } = require("plaid");

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

const plaid = new PlaidApi(
  new Configuration({
    basePath: PlaidEnvironments[requireEnv("PLAID_ENV")],
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": requireEnv("PLAID_CLIENT_ID"),
        "PLAID-SECRET": requireEnv("PLAID_SECRET"),
      },
    },
  })
);

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "ghost-savings", ts: new Date().toISOString() });
});

app.post("/plaid/link-token", async (_req, res) => {
  try {
    const uid = "dev-user"; // later: use Firebase auth
    const resp = await plaid.linkTokenCreate({
      user: { client_user_id: uid },
      client_name: process.env.PLAID_CLIENT_NAME || "Ghost Savings",
      products: ["auth", "transactions"],
      country_codes: ["US"],
      language: "en",
    });

    res.json({ link_token: resp.data.link_token });
  } catch (e) {
    console.error(e?.response?.data || e);
    res.status(500).send(e?.response?.data?.error_message || e?.message || "link-token failed");
  }
});

app.post("/plaid/exchange-token", async (req, res) => {
  try {
    const publicToken = req.body?.public_token;
    if (!publicToken) return res.status(400).send("Missing body.public_token");

    const exchange = await plaid.itemPublicTokenExchange({ public_token: publicToken });

    // Don’t send access_token to client in production
    res.json({ ok: true, item_id: exchange.data.item_id });
  } catch (e) {
    console.error(e?.response?.data || e);
    res.status(500).send(e?.response?.data?.error_message || e?.message || "exchange-token failed");
  }
});

const port = Number(process.env.PORT || 3333);
app.listen(port, "0.0.0.0", () => {
  console.log(`API running on http://0.0.0.0:${port}`);
});
