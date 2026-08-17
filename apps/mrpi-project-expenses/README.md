# MRPI Project Expenses

Standalone mobile-first PWA for project costs, suppliers, partial payments and private receipts.

## Shared identity and data

- Uses the same Supabase Auth account as MRPI Contractor Suite.
- Reads `companies`, `projects` and customer receipts from the shared backend.
- Writes only to the expense tables introduced by the shared platform migration.
- Worker wage and advance expenses are created transactionally by MRPI Workforce.

## Local setup

Copy `.env.example` to `.env.local`, set the shared Supabase URL and publishable key, then run:

```bash
npm ci
npm run dev
```

Never place a service-role key in a `VITE_` environment variable.

## Validation

```bash
npm run lint
npm test
npm run build
```
