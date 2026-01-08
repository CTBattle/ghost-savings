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
