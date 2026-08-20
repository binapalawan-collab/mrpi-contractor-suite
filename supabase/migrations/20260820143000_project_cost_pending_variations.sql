begin;

-- Keep the legally effective contract value tied to approved Variation Orders,
-- while exposing draft/sent VO impact separately for operational forecasting.
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
  coalesce(expense.committed_expenses, 0)::numeric(14, 2) as committed_expenses,
  coalesce(expense.paid_expenses, 0)::numeric(14, 2) as paid_expenses,
  coalesce(expense.outstanding_expenses, 0)::numeric(14, 2) as outstanding_expenses,
  coalesce(receipt.customer_received, 0)::numeric(14, 2) as customer_received,
  round(project.current_contract_amount - coalesce(expense.committed_expenses, 0), 2)
    as estimated_gross_profit,
  round(coalesce(receipt.customer_received, 0) - coalesce(expense.paid_expenses, 0), 2)
    as cash_position,
  project.contract_amount,
  project.approved_variation_amount,
  coalesce(variation.pending_variation_amount, 0)::numeric(14, 2)
    as pending_variation_amount,
  coalesce(variation.pending_variation_count, 0)::bigint
    as pending_variation_count,
  round(
    project.current_contract_amount
      + coalesce(variation.pending_variation_amount, 0),
    2
  )::numeric(14, 2) as projected_contract_amount,
  round(
    project.current_contract_amount
      + coalesce(variation.pending_variation_amount, 0)
      - coalesce(expense.committed_expenses, 0),
    2
  )::numeric(14, 2) as projected_gross_profit
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
  select sum(payment.amount) as customer_received
  from public.invoice_payments as payment
  where payment.project_id = project.id
) as receipt on true
left join lateral (
  select
    sum(variation_order.net_amount)
      filter (where variation_order.status in ('draft', 'sent'))
        as pending_variation_amount,
    count(*)
      filter (where variation_order.status in ('draft', 'sent'))
        as pending_variation_count
  from public.variation_orders as variation_order
  where variation_order.project_id = project.id
) as variation on true;

comment on column public.project_cost_overview.current_contract_amount is
  'Legally effective contract: original amount plus approved Variation Orders.';
comment on column public.project_cost_overview.pending_variation_amount is
  'Net impact of draft and sent Variation Orders that are not yet approved.';
comment on column public.project_cost_overview.projected_contract_amount is
  'Operational forecast if every draft and sent Variation Order is approved.';

commit;
