begin;

alter table public.quotation_items
  add column length_value numeric(14, 3),
  add column width_value numeric(14, 3),
  add constraint quotation_items_length_positive
    check (length_value is null or length_value > 0),
  add constraint quotation_items_width_positive
    check (width_value is null or width_value > 0),
  add constraint quotation_items_dimension_method_valid
    check (
      (calculation_method = 'area'
        and (
          (length_value is null and width_value is null)
          or
          (length_value is not null and width_value is not null
            and quantity = round(length_value * width_value, 3))
        ))
      or
      (calculation_method = 'length'
        and width_value is null
        and (length_value is null or quantity = length_value))
      or
      (calculation_method in ('qty', 'lsum')
        and length_value is null
        and width_value is null)
    );

comment on column public.quotation_items.length_value is
  'Explicit length used for area or length calculations. Null is retained for legacy manually-entered rows.';
comment on column public.quotation_items.width_value is
  'Explicit width used for area calculations. Null is retained for legacy manually-entered rows.';

create or replace function public.save_quotation_draft(
  p_quotation_id bigint,
  p_draft jsonb
)
returns public.quotations
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  company_row public.companies;
  client_row public.clients;
  quotation_row public.quotations;
  section_row public.quotation_sections;
  section_data jsonb;
  item_data jsonb;
  item_method text;
  item_quantity numeric(14, 3);
  item_length numeric(14, 3);
  item_width numeric(14, 3);
  normalized_phone text;
  client_id_input bigint;
begin
  if current_user_id is null then
    raise exception 'Sesi pengguna tidak sah.';
  end if;

  if p_draft is null or jsonb_typeof(p_draft) <> 'object' then
    raise exception 'Data draf sebutharga tidak sah.';
  end if;

  if jsonb_typeof(coalesce(p_draft->'sections', '[]'::jsonb)) <> 'array' then
    raise exception 'Senarai ruangan sebutharga tidak sah.';
  end if;

  select company.*
  into company_row
  from public.companies as company
  where company.owner_user_id = current_user_id;

  if not found then
    raise exception 'Profil syarikat tidak ditemui.';
  end if;

  normalized_phone := btrim(coalesce(p_draft#>>'{header,client_phone_normalized}', ''));
  if normalized_phone !~ '^[0-9]{7,15}$' then
    raise exception 'No. telefon pelanggan tidak sah.';
  end if;

  client_id_input := nullif(p_draft#>>'{header,client_id}', '')::bigint;

  select client.*
  into client_row
  from public.clients as client
  where client.company_id = company_row.id
    and client.owner_user_id = current_user_id
    and (
      client.phone_normalized = normalized_phone
      or (client_id_input is not null and client.id = client_id_input)
    )
  order by (client.phone_normalized = normalized_phone) desc
  limit 1
  for update;

  if found then
    update public.clients
    set
      name = btrim(p_draft#>>'{header,client_name}'),
      phone = btrim(p_draft#>>'{header,client_phone}'),
      phone_normalized = normalized_phone,
      email = nullif(btrim(coalesce(p_draft#>>'{header,client_email}', '')), '')
    where id = client_row.id
      and company_id = company_row.id
      and owner_user_id = current_user_id
    returning * into client_row;
  else
    insert into public.clients (
      company_id,
      owner_user_id,
      name,
      phone,
      phone_normalized,
      email
    ) values (
      company_row.id,
      current_user_id,
      btrim(p_draft#>>'{header,client_name}'),
      btrim(p_draft#>>'{header,client_phone}'),
      normalized_phone,
      nullif(btrim(coalesce(p_draft#>>'{header,client_email}', '')), '')
    )
    returning * into client_row;
  end if;

  if p_quotation_id is not null then
    select quotation.*
    into quotation_row
    from public.quotations as quotation
    where quotation.id = p_quotation_id
      and quotation.company_id = company_row.id
      and quotation.owner_user_id = current_user_id
    for update;

    if not found then
      raise exception 'Sebutharga tidak ditemui.';
    end if;

    if quotation_row.status <> 'draft' then
      raise exception 'Hanya draf sebutharga boleh disimpan.';
    end if;

    update public.quotations
    set
      client_id = client_row.id,
      site_visit_id = nullif(p_draft->>'source_site_visit_id', '')::bigint,
      draft_key = (p_draft->>'draft_key')::uuid,
      quotation_no = btrim(p_draft#>>'{header,quotation_no}'),
      quotation_date = (p_draft#>>'{header,quotation_date}')::date,
      language = p_draft#>>'{header,language}',
      client_name = btrim(p_draft#>>'{header,client_name}'),
      client_phone = btrim(p_draft#>>'{header,client_phone}'),
      client_email = nullif(btrim(coalesce(p_draft#>>'{header,client_email}', '')), ''),
      project_title = btrim(p_draft#>>'{header,project_title}'),
      address_line_1 = btrim(p_draft#>>'{header,address_line_1}'),
      address_line_2 = nullif(btrim(coalesce(p_draft#>>'{header,address_line_2}', '')), ''),
      postcode = nullif(btrim(coalesce(p_draft#>>'{header,postcode}', '')), ''),
      city = btrim(p_draft#>>'{header,city}'),
      state = btrim(p_draft#>>'{header,state}'),
      country_code = 'MY',
      validity_days = (p_draft#>>'{header,validity_days}')::integer,
      notes = nullif(btrim(coalesce(p_draft#>>'{header,notes}', '')), '')
    where id = quotation_row.id
      and company_id = company_row.id
      and owner_user_id = current_user_id
    returning * into quotation_row;
  else
    insert into public.quotations (
      company_id,
      owner_user_id,
      client_id,
      site_visit_id,
      draft_key,
      quotation_no,
      quotation_date,
      language,
      client_name,
      client_phone,
      client_email,
      project_title,
      address_line_1,
      address_line_2,
      postcode,
      city,
      state,
      country_code,
      validity_days,
      notes
    ) values (
      company_row.id,
      current_user_id,
      client_row.id,
      nullif(p_draft->>'source_site_visit_id', '')::bigint,
      (p_draft->>'draft_key')::uuid,
      coalesce(btrim(p_draft#>>'{header,quotation_no}'), ''),
      (p_draft#>>'{header,quotation_date}')::date,
      p_draft#>>'{header,language}',
      btrim(p_draft#>>'{header,client_name}'),
      btrim(p_draft#>>'{header,client_phone}'),
      nullif(btrim(coalesce(p_draft#>>'{header,client_email}', '')), ''),
      btrim(p_draft#>>'{header,project_title}'),
      btrim(p_draft#>>'{header,address_line_1}'),
      nullif(btrim(coalesce(p_draft#>>'{header,address_line_2}', '')), ''),
      nullif(btrim(coalesce(p_draft#>>'{header,postcode}', '')), ''),
      btrim(p_draft#>>'{header,city}'),
      btrim(p_draft#>>'{header,state}'),
      'MY',
      (p_draft#>>'{header,validity_days}')::integer,
      nullif(btrim(coalesce(p_draft#>>'{header,notes}', '')), '')
    )
    returning * into quotation_row;
  end if;

  delete from public.quotation_items
  where quotation_id = quotation_row.id
    and company_id = company_row.id
    and owner_user_id = current_user_id;

  delete from public.quotation_sections
  where quotation_id = quotation_row.id
    and company_id = company_row.id
    and owner_user_id = current_user_id;

  for section_data in
    select value
    from jsonb_array_elements(coalesce(p_draft->'sections', '[]'::jsonb))
    with ordinality as section_element(value, position)
    order by position
  loop
    if jsonb_typeof(coalesce(section_data->'items', '[]'::jsonb)) <> 'array' then
      raise exception 'Senarai item sebutharga tidak sah.';
    end if;

    insert into public.quotation_sections (
      quotation_id,
      company_id,
      owner_user_id,
      source_site_visit_id,
      source_site_visit_area_id,
      name,
      sort_order
    ) values (
      quotation_row.id,
      company_row.id,
      current_user_id,
      nullif(section_data->>'source_site_visit_id', '')::bigint,
      nullif(section_data->>'source_site_visit_area_id', '')::bigint,
      btrim(section_data->>'name'),
      ((section_data->>'sort_order')::integer)
    )
    returning * into section_row;

    for item_data in
      select value
      from jsonb_array_elements(coalesce(section_data->'items', '[]'::jsonb))
      with ordinality as item_element(value, position)
      order by position
    loop
      item_method := item_data->>'calculation_method';
      item_quantity := (item_data->>'quantity')::numeric(14, 3);
      item_length := nullif(item_data->>'length_value', '')::numeric(14, 3);
      item_width := nullif(item_data->>'width_value', '')::numeric(14, 3);

      if item_method = 'area' and item_length is not null and item_width is not null then
        item_quantity := round(item_length * item_width, 3);
      elsif item_method = 'length' and item_length is not null then
        item_quantity := item_length;
        item_width := null;
      elsif item_method = 'lsum' then
        item_quantity := 1;
        item_length := null;
        item_width := null;
      elsif item_method = 'qty' then
        item_length := null;
        item_width := null;
      end if;

      insert into public.quotation_items (
        quotation_id,
        section_id,
        company_id,
        owner_user_id,
        catalog_item_id,
        source_site_visit_id,
        source_site_visit_area_id,
        source_site_visit_entry_id,
        item_name,
        description,
        measurement_text,
        calculation_method,
        unit,
        length_value,
        width_value,
        quantity,
        rate,
        sort_order
      ) values (
        quotation_row.id,
        section_row.id,
        company_row.id,
        current_user_id,
        nullif(item_data->>'catalog_item_id', '')::bigint,
        nullif(item_data->>'source_site_visit_id', '')::bigint,
        nullif(item_data->>'source_site_visit_area_id', '')::bigint,
        nullif(item_data->>'source_site_visit_entry_id', '')::bigint,
        btrim(item_data->>'item_name'),
        btrim(item_data->>'description'),
        nullif(btrim(coalesce(item_data->>'measurement_text', '')), ''),
        item_method,
        btrim(item_data->>'unit'),
        item_length,
        item_width,
        item_quantity,
        (item_data->>'rate')::numeric(14, 2),
        (item_data->>'sort_order')::integer
      );
    end loop;
  end loop;

  if quotation_row.site_visit_id is not null then
    update public.site_visits
    set status = 'converted'
    where id = quotation_row.site_visit_id
      and company_id = company_row.id
      and owner_user_id = current_user_id;
  end if;

  select quotation.*
  into quotation_row
  from public.quotations as quotation
  where quotation.id = quotation_row.id
    and quotation.company_id = company_row.id
    and quotation.owner_user_id = current_user_id;

  return quotation_row;
end;
$$;

revoke execute on function public.save_quotation_draft(bigint, jsonb) from public, anon;
grant execute on function public.save_quotation_draft(bigint, jsonb) to authenticated;

commit;
