begin;

alter table public.site_visit_entries
  add column needs_confirmation boolean not null default false;

comment on column public.site_visit_entries.needs_confirmation is
  'Optional reminder that a note still needs confirmation; it never blocks quotation preparation.';

alter table public.site_visits
  drop constraint site_visits_status_valid;

alter table public.site_visits
  add constraint site_visits_status_valid check (
    status in ('draft', 'completed', 'ready_for_quote', 'converted', 'archived')
  );

comment on column public.site_visits.status is
  'Workflow: draft, completed site visit, ready for quote, converted or archived.';

commit;
