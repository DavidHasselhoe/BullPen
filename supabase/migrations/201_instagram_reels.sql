-- Instagram Reels: a post is either the usual carousel or a Reel (an MP4 in the
-- public instagram-reels bucket). A Reel is first handed to David in Discord to
-- post by hand with a trending sound; handoff_at is when, so the fallback publish
-- can tell whether he already posted it (lib/instagram/publish.ts).
alter table instagram_posts
  add column if not exists media_format text not null default 'carousel'
    check (media_format in ('carousel', 'reel')),
  add column if not exists video_url text,
  add column if not exists handoff_at timestamptz;

-- Public: Meta fetches video_url with a plain GET.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('instagram-reels', 'instagram-reels', true, 104857600, array['video/mp4'])
on conflict (id) do nothing;
