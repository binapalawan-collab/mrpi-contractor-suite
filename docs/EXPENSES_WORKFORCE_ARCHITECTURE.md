# Expenses and Workforce architecture

## Source of truth

All three applications use Supabase project `jhfvxsblckejvfnkjsrk`.

| Concern | Source of truth | Consumers |
|---|---|---|
| Authentication | Supabase Auth | Contractor Suite, Project Expenses, Workforce |
| Company | `public.companies` | All applications |
| Projects and current contract value | `public.projects` | All applications |
| Customer receipts | `public.invoice_payments` | Contractor Suite, Project Expenses overview |
| Project costs | `public.project_expenses` | Project Expenses and Workforce integration |
| Attendance and wages | Workforce tables | Workforce; paid cash is bridged to Expenses |

No application copies company or project records.

## Expense accounting rule

`project_expenses.total_amount` represents a committed project cost. Individual payments are stored in `project_expense_payments`, allowing unpaid, partial and paid states.

Worker advances are cash expenses immediately. At wage settlement, selected advances reduce the net cash payment. Therefore:

```text
advance expense + remaining wage expense = gross worker wage
```

Unique source indexes and transactional RPC functions prevent a worker advance or wage payment from being posted twice.

## Security model

- Every tenant row carries `company_id` and `owner_user_id`.
- Composite foreign keys prevent cross-company project links.
- Row-level security compares `owner_user_id` with `auth.uid()`.
- Workers have no auth users and cannot access either application.
- Expense receipts use the private `expense-receipts` bucket, with the owner UUID as the first path segment.
- Transaction RPC functions reject anonymous callers and revalidate worker/project/company ownership before writing.

## Applications

- Contractor Suite remains at the repository root.
- `apps/mrpi-project-expenses` is an independently built and installed PWA.
- `apps/mrpi-workforce` is an independently built and installed PWA.

They may be deployed as separate Cloudflare Pages projects from their respective root directories.
