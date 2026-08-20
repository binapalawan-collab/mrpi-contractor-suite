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

Wages can be paid in full or partially for a selected date range. Each payment is allocated to
the oldest unpaid attendance first, the remaining balance stays payable, and only cash actually
paid posts to MRPI Project Expenses. Advances continue to post when issued and can be selected
as part of a later wage settlement.

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
