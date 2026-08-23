begin;

-- Project cost must include liabilities that have already been earned/incurred,
-- not only cash entries that have reached Project Expenses. Daily-worker
-- attendance accrues a wage liability before a wage payment is recorded.
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
  round(
    coalesce(expense.committed_expenses, 0) + coalesce(wage.unpaid_wages, 0),
    2
  )::numeric(14, 2) as committed_expenses,
  coalesce(expense.paid_expenses, 0)::numeric(14, 2) as paid_expenses,
  round(
    coalesce(expense.outstanding_expenses, 0) + coalesce(wage.unpaid_wages, 0),
    2
  )::numeric(14, 2) as outstanding_expenses,
  coalesce(receipt.customer_received, 0)::numeric(14, 2) as customer_received,
  round(
    project.current_contract_amount
      - coalesce(expense.committed_expenses, 0)
      - coalesce(wage.unpaid_wages, 0),
    2
  ) as estimated_gross_profit,
  round(
    coalesce(receipt.customer_received, 0) - coalesce(expense.paid_expenses, 0),
    2
  ) as cash_position,
  project.contract_amount,
  project.approved_variation_amount,
  coalesce(variation.pending_variation_amount, 0)::numeric(14, 2) as pending_variation_amount,
  coalesce(variation.pending_variation_count, 0::bigint) as pending_variation_count,
  round(
    project.current_contract_amount + coalesce(variation.pending_variation_amount, 0),
    2
  )::numeric(14, 2) as projected_contract_amount,
  round(
    project.current_contract_amount
      + coalesce(variation.pending_variation_amount, 0)
      - coalesce(expense.committed_expenses, 0)
      - coalesce(wage.unpaid_wages, 0),
    2
  )::numeric(14, 2) as projected_gross_profit,
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
  select
    sum(greatest(attendance.wage_amount - attendance.paid_wage_amount, 0)) as unpaid_wages
  from public.worker_attendance as attendance
  where attendance.project_id = project.id
    and attendance.status in ('present', 'half_day')
) as wage on true
left join lateral (
  select sum(payment.amount) as customer_received
  from public.invoice_payments as payment
  where payment.project_id = project.id
) as receipt on true
left join lateral (
  select
    sum(variation_order.net_amount) filter (
      where variation_order.status in ('draft', 'sent')
    ) as pending_variation_amount,
    count(*) filter (
      where variation_order.status in ('draft', 'sent')
    ) as pending_variation_count
  from public.variation_orders as variation_order
  where variation_order.project_id = project.id
) as variation on true;

grant select on public.project_cost_overview to authenticated;

comment on view public.project_cost_overview is
  'Project financial overview. Committed and outstanding costs include unpaid daily-worker wages accrued from Workforce attendance.';

commit;
