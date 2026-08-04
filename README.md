# MRPI Contractor Suite

Mobile-first contractor operations PWA for company profiles, site visits, quotations, projects and finance.

## Current checkpoint

- React + TypeScript + Vite foundation
- Tailwind CSS mobile-first shell
- Installable PWA configuration
- Supabase email/password authentication UI
- One-user/one-company profile form
- Agreed V1 navigation and milestone placeholders

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Add the approved Supabase project URL and publishable key.
3. Run `npm install`.
4. Run `npm run dev`.

Never use a secret key or service-role key in a `VITE_` environment variable.

## Validation

```bash
npm run lint
npm run test
npm run build
```

See `docs/PROJECT_IDENTITY.md` before connecting any external resource.
