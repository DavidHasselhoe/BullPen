create table if not exists translation_cache (
  id uuid primary key default gen_random_uuid(),
  text_hash text not null,
  target_lang text not null,
  translated_text text not null,
  created_at timestamptz not null default now(),
  constraint translation_cache_hash_lang_unique unique (text_hash, target_lang)
);

-- Service role only — no public access
alter table translation_cache enable row level security;
