create function public.form_response_stats(target_form uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'total', (select count(*) from public.form_responses where form_id=target_form),
    'questions', coalesce((select jsonb_object_agg(question_id, stats) from (
      select question_id, jsonb_build_object('answered',sum(n),'values',jsonb_object_agg(answer,n)) stats from (
        select entry.key question_id, entry.value answer, count(*) n
        from public.form_responses r cross join lateral jsonb_each_text(r.answers) entry
        where r.form_id=target_form and entry.value<>''
          and exists(select 1 from public.research_forms f cross join lateral jsonb_array_elements(coalesce(f.published_sections,f.sections)) s cross join lateral jsonb_array_elements(s->'questions') q
            where f.id=target_form and q->>'id'=entry.key and q->>'type' in ('single','scale'))
        group by entry.key,entry.value
      ) counts group by question_id
    ) grouped),'{}'::jsonb)
  );
$$;
revoke all on function public.form_response_stats(uuid) from public,anon,authenticated;
grant execute on function public.form_response_stats(uuid) to service_role;
