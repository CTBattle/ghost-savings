# Ghost Savings

Event-sourced domain engine for Savings, Challenges, and Ghost Debt Mode,
with a TypeScript Fastify API and Plaid integration.

---

## What’s inside

### Domain
- Event-sourced ledger: `src/domain/ledger`
- Commands: `src/domain/commands`
- Read models / selectors: `src/domain/readModels`
- Tests: `test/`

### API
- Fastify server: `src/api/server.ts`
- Health endpoints
- Plaid integration (sandbox):
  - Create Plaid Link token
  - Exchange public token → access token
  - Fetch accounts
  - Fetch transactions
- Plaid tokens persisted locally for development (`data/plaidTokens.json`)

---

## Tech Stack
- Node.js
- TypeScript
- Fastify
- Plaid (sandbox)
- Local file persistence (dev only)

---

## Setup

### 1) Install dependencies
```bash
npm install
```
---

## Local Dev vs CI vs Prod

This backend is designed to boot cleanly even when Plaid secrets are not present (for example, in CI).  
Plaid is **lazy-initialized**, meaning the Plaid client is created only when a Plaid route is called.

### Environment behavior

| Environment | Boots server | `/health` | Plaid routes (`/plaid/*`) |
|------------|--------------|-----------|----------------------------|
| CI (no Plaid secrets) | ✅ | ✅ | ❌ (expected) |
| Local (no Plaid secrets) | ✅ | ✅ | ❌ |
| Local (with Plaid secrets) | ✅ | ✅ | ✅ |
| Production | ✅ | ✅ | ✅ |

**Why:**  
CI should verify that the server can start and respond to `/health` without requiring third-party secrets.  
Plaid endpoints will throw a clear error if called without Plaid configuration.

```

### What this fixes (for your sanity)
- ✅ Code block is properly closed
- ✅ Markdown renders correctly
- ✅ Runtime behavior is clearly documented
- ✅ Reviewers instantly understand the lazy Plaid design
- ✅ No accidental formatting bugs

---

## Next (final step)
Once you paste this in and save, we move to **Task 3 (CI regression guard)** and then:

## ✅ ALL 3 FINISHED

Tell me when the README is updated and I’ll give you the **last CI edit + final commit command**.
