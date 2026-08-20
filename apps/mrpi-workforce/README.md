# MRPI Workforce

Simple admin-only PWA for worker names, daily attendance, overtime, advances and wage payments.

Daily attendance is grouped by project. The admin can assign or move several workers at once,
copy the previous day's project allocation, mark an entire project crew present, and keep
unassigned workers separate from workers who are explicitly absent.

## Deliberately small scope

- Workers do not have login accounts.
- No identity card, passport, address, GPS or selfie data is collected.
- A worker stores only a name, pay type, optional daily rate, notes and active status.
- The company owner uses the same Supabase Auth account as MRPI Contractor Suite.

Confirmed wage payments and advances post to MRPI Project Expenses exactly once through database transactions.

Unpaid attendance can be edited or deleted from history. If attendance has already been paid,
reverse the wage payment first; this removes its generated expense and reopens the attendance
and applied advances for correction.

## Local setup and validation

Copy `.env.example` to `.env.local`, use the shared Supabase URL and publishable key, then run:

```bash
npm ci
npm run lint
npm test
npm run build
```
