begin;

create or replace view public.worker_wage_outstanding_by_worker
with (security_invoker = true)
as
with attendance as (
  select
    item.project_id,
    item.company_id,
    item.owner_user_id,
    item.worker_id,
    max(item.attendance_date) as latest_attendance_date,
    round(sum(greatest(item.wage_amount - item.paid_wage_amount, 0)), 2)::numeric(14, 2) as gross_outstanding
  from public.worker_attendance as item
  where item.status in ('present', 'half_day')
  group by item.project_id, item.company_id, item.owner_user_id, item.worker_id
), unused_advance as (
  select
    advance.project_id,
    advance.company_id,
    advance.owner_user_id,
    advance.worker_id,
    round(sum(advance.amount), 2)::numeric(14, 2) as unused_advance
  from public.worker_advances as advance
  where advance.applied_wage_payment_id is null
  group by advance.project_id, advance.company_id, advance.owner_user_id, advance.worker_id
)
select
  attendance.project_id,
  attendance.company_id,
  attendance.owner_user_id,
  attendance.worker_id,
  worker.name as worker_name,
  attendance.latest_attendance_date,
  attendance.gross_outstanding,
  least(attendance.gross_outstanding, coalesce(unused_advance.unused_advance, 0))::numeric(14, 2) as advance_offset,
  greatest(attendance.gross_outstanding - coalesce(unused_advance.unused_advance, 0), 0)::numeric(14, 2) as net_outstanding
from attendance
join public.workers as worker
  on worker.id = attendance.worker_id
 and worker.company_id = attendance.company_id
 and worker.owner_user_id = attendance.owner_user_id
left join unused_advance
  on unused_advance.project_id = attendance.project_id
 and unused_advance.company_id = attendance.company_id
 and unused_advance.owner_user_id = attendance.owner_user_id
 and unused_advance.worker_id = attendance.worker_id
where greatest(attendance.gross_outstanding - coalesce(unused_advance.unused_advance, 0), 0) > 0;

revoke all on table public.worker_wage_outstanding_by_worker from anon;
grant select on table public.worker_wage_outstanding_by_worker to authenticated;

create or replace view public.project_expense_feed
with (security_invoker = true)
as
select
  'expense:' || expense.id::text as record_key,
  'expense'::text as record_type,
  expense.id as expense_id,
  null::bigint as worker_id,
  expense.project_id,
  expense.company_id,
  expense.owner_user_id,
  expense.supplier_id,
  expense.expense_date,
  expense.category,
  expense.description,
  expense.total_amount,
  expense.paid_amount,
  expense.balance_amount,
  expense.status,
  expense.source_type,
  0::numeric(14, 2) as advance_offset,
  expense.notes
from public.project_expenses as expense

union all

select
  'worker-debt:' || debt.project_id::text || ':' || debt.worker_id::text as record_key,
  'worker_wage_debt'::text as record_type,
  null::bigint as expense_id,
  debt.worker_id,
  debt.project_id,
  debt.company_id,
  debt.owner_user_id,
  null::bigint as supplier_id,
  debt.latest_attendance_date as expense_date,
  'labour'::text as category,
  'Hutang upah · ' || debt.worker_name as description,
  debt.net_outstanding as total_amount,
  0::numeric(14, 2) as paid_amount,
  debt.net_outstanding as balance_amount,
  'unpaid'::text as status,
  'worker_wage_debt'::text as source_type,
  debt.advance_offset,
  case
    when debt.advance_offset > 0 then
      'Upah daripada attendance Workforce. Pendahuluan RM ' || to_char(debt.advance_offset, 'FM999999999990.00') || ' telah ditolak daripada hutang kasar.'
    else
      'Upah daripada attendance Workforce yang belum dibayar.'
  end as notes
from public.worker_wage_outstanding_by_worker as debt;

revoke all on table public.project_expense_feed from anon;
grant select on table public.project_expense_feed to authenticated;

create or replace view public.project_cost_overview
with (security_invoker = true)
as
select
  project.id as project_id,
  project.company_id,
  project.owner_user_id,
  project.project_no,
  project.project_name,
  project.client_name,
  project.status as project_status,
  project.current_contract_amount,
  round(coalesce(expense.committed_expenses, 0) + coalesce(wage.unpaid_wages, 0), 2)::numeric(14, 2) as committed_expenses,
  coalesce(expense.paid_expenses, 0)::numeric(14, 2) as paid_expenses,
  round(coalesce(expense.outstanding_expenses, 0) + coalesce(wage.unpaid_wages, 0), 2)::numeric(14, 2) as outstanding_expenses,
  coalesce(receipt.customer_received, 0)::numeric(14, 2) as customer_received,
  round(project.current_contract_amount - coalesce(expense.committed_expenses, 0) - coalesce(wage.unpaid_wages, 0), 2) as estimated_gross_profit,
  round(coalesce(receipt.customer_received, 0) - coalesce(expense.paid_expenses, 0), 2) as cash_position,
  project.contract_amount,
  project.approved_variation_amount,
  coalesce(variation.pending_variation_amount, 0)::numeric(14, 2) as pending_variation_amount,
  coalesce(variation.pending_variation_count, 0::bigint) as pending_variation_count,
  round(project.current_contract_amount + coalesce(variation.pending_variation_amount, 0), 2)::numeric(14, 2) as projected_contract_amount,
  round(project.current_contract_amount + coalesce(variation.pending_variation_amount, 0) - coalesce(expense.committed_expenses, 0) - coalesce(wage.unpaid_wages, 0), 2)::numeric(14, 2) as projected_gross_profit,
  coalesce(wage.unpaid_wages, 0)::numeric(14, 2) as unpaid_wages
from public.projects as project
left join lateral (
  select
    sum(item.total_amount) as committed_expenses,
    sum(item.paid_amount) as paid_expenses,
    sum(item.balance_amount) as outstanding_expenses
  from public.project_expenses as item
  where item.project_id = project.id
) as expense on true
left join lateral (
  select sum(item.net_outstanding) as unpaid_wages
  from public.worker_wage_outstanding_by_worker as item
  where item.project_id = project.id
) as wage on true
left join lateral (
  select sum(payment.amount) as customer_received
  from public.invoice_payments as payment
  where payment.project_id = project.id
) as receipt on true
left join lateral (
  select
    sum(variation_order.net_amount) filter (where variation_order.status in ('draft', 'sent')) as pending_variation_amount,
    count(*) filter (where variation_order.status in ('draft', 'sent')) as pending_variation_count
  from public.variation_orders as variation_order
  where variation_order.project_id = project.id
) as variation on true;

revoke all on table public.project_cost_overview from anon;
grant select on table public.project_cost_overview to authenticated;

commit;
