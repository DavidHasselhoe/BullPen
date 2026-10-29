-- Publishing an Academy draft places it at its own order_index: every live
-- course at or after that slot moves down one, in the same statement as the
-- publish, so the path never shows two courses in one slot. Roadmap v2
-- outlines (lib/academy/academy-roadmap.ts) target a mid-catalog slot.
--
-- Returns the published row, or nothing if the course was not a draft (a
-- double click, or already live). FOR UPDATE makes a concurrent second call
-- wait, then see is_published = true and shift nothing.

create or replace function public.publish_academy_course(p_course_id uuid)
returns table (slug text, title text, requires_pro boolean)
language sql
security invoker
set search_path = public
as $$
  with draft as (
    select id, order_index from academy_courses
    where id = p_course_id and not is_published
    for update
  ), shifted as (
    update academy_courses c set order_index = c.order_index + 1
    from draft
    where c.is_published and c.order_index >= draft.order_index
    returning c.id
  )
  update academy_courses c set is_published = true
  from draft
  where c.id = draft.id
  returning c.slug, c.title, c.requires_pro;
$$;

revoke execute on function public.publish_academy_course(uuid) from public, anon, authenticated;
grant execute on function public.publish_academy_course(uuid) to service_role;
