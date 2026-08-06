begin;

-- balance_amount is a generated column and necessarily changes whenever an
-- internal item/payment trigger changes total_amount or paid_amount. Keep all
-- user-editable fields locked while allowing that generated value to follow.
do $$
declare
  function_definition text;
  old_fragment text := E'      ''total_amount'',\n      ''paid_amount'',';
  new_fragment text := E'      ''total_amount'',\n      ''balance_amount'',\n      ''paid_amount'',';
begin
  function_definition := pg_get_functiondef(
    'private.guard_invoice_update()'::regprocedure
  );

  if function_definition like '%' || old_fragment || '%' then
    execute replace(function_definition, old_fragment, new_fragment);
  elsif function_definition like '%' || new_fragment || '%' then
    null;
  else
    raise exception 'Struktur guard invois tidak sepadan dengan migration hardening.';
  end if;
end;
$$;

revoke execute on function private.guard_invoice_update()
  from public, anon, authenticated, service_role;

commit;
