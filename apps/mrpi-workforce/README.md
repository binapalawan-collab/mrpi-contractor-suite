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

Daily wages can be paid in full or partially for a selected date range without selecting a
project. The payment screen combines all outstanding projects into one total and shows a
per-project breakdown for reference. The admin enters one cash amount; the system allocates it
to the oldest outstanding project balances first while keeping each wage payment, attendance
allocation and Project Expenses entry attached to the correct project. Individual advances
remain project-scoped and can be selected as part of the combined settlement.

Unpaid attendance can be edited or deleted from history. Attendance with any full or partial
wage allocation is locked. Reverse the related wage transaction first; this removes only that
transaction's generated expense and allocation while preserving other partial payments.

## Local setup and validation

Copy `.env.example` to `.env.local`, use the shared Supabase URL and publishable key, then run:

```bash
npm ci
npm run lint
npm test
npm run build
```
