-- Run this in your Supabase project SQL Editor to set up the schema.

create table if not exists decks (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid references auth.users(id) on delete cascade not null,
    name        text not null,
    tracks      jsonb not null default '[]',
    share_token text unique default encode(gen_random_bytes(8), 'hex'),
    is_public   boolean not null default false,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create table if not exists deck_pdfs (
    id           uuid primary key default gen_random_uuid(),
    deck_id      uuid references decks(id) on delete cascade not null,
    storage_path text not null,
    track_count  int,
    created_at   timestamptz not null default now()
);

-- Row Level Security
alter table decks    enable row level security;
alter table deck_pdfs enable row level security;

create policy "decks: owner full access"
    on decks for all
    using (auth.uid() = user_id);

create policy "decks: public read by share token"
    on decks for select
    using (is_public = true);

create policy "deck_pdfs: owner full access"
    on deck_pdfs for all
    using (deck_id in (select id from decks where user_id = auth.uid()));

create policy "deck_pdfs: public read through public deck"
    on deck_pdfs for select
    using (deck_id in (select id from decks where is_public = true));

-- Storage bucket: create manually in Supabase dashboard (Storage → New bucket → "pdfs", private)
-- Then add this storage policy:

-- insert policy for authenticated users uploading their own files:
-- create policy "pdfs: owner upload"
--     on storage.objects for insert
--     with check (bucket_id = 'pdfs' and (storage.foldername(name))[1] = auth.uid()::text);
--
-- create policy "pdfs: owner read"
--     on storage.objects for select
--     using (bucket_id = 'pdfs' and (storage.foldername(name))[1] = auth.uid()::text);
--
-- create policy "pdfs: owner delete"
--     on storage.objects for delete
--     using (bucket_id = 'pdfs' and (storage.foldername(name))[1] = auth.uid()::text);
