# MRPI Contractor Suite

Mobile-first contractor operations PWA for company profiles, site visits, quotations, projects and finance.

The repository also contains two independently built PWAs that share the same Supabase identity, company and project records:

- `apps/mrpi-project-expenses`
- `apps/mrpi-workforce`

See `docs/EXPENSES_WORKFORCE_ARCHITECTURE.md` for data ownership and integration rules.

## Current checkpoint

- React + TypeScript + Vite foundation
- Tailwind CSS mobile-first shell
- Installable PWA configuration
- Supabase email/password authentication UI
- One-user/one-company profile form
- Tenant-isolated editable catalog with default renovation items and prices
- Mobile-first site visits with reusable clients, work areas and free-text notes
- Optional measurements, private photos and 12 on-demand renovation guides
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
