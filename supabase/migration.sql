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

create policy "deck_pdfs: owner full access"
    on deck_pdfs for all
    using (deck_id in (select id from decks where user_id = auth.uid()));

-- Shared decks are NOT directly selectable by anon/authenticated users
-- (no "is_public = true" read policy). Instead, lookup by share token goes
-- through this function, so a deck is only reachable by someone who has
-- the exact link rather than being enumerable via `is_public = true`.
create or replace function get_deck_by_share_token(p_token text)
returns table (
    id uuid,
    name text,
    tracks jsonb,
    share_token text,
    is_public boolean,
    created_at timestamptz,
    updated_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
    select id, name, tracks, share_token, is_public, created_at, updated_at
    from decks
    where share_token = p_token and is_public = true;
$$;

grant execute on function get_deck_by_share_token(text) to anon, authenticated;

-- Card registry: maps the card ID printed in each QR code (first 12 hex chars
-- of the SHA-256 of the preview URL) to the track it represents. Lets the
-- player recover a fresh preview when the original URL has expired, so
-- printed decks keep working for years.
--
-- Rows are written by anyone generating a PDF (no account required) and are
-- immutable: inserts use ON CONFLICT DO NOTHING and there is no update/delete
-- policy, so existing cards can't be overwritten by other users.
create table if not exists cards (
    id         text primary key check (id ~ '^[0-9a-f]{12}$'),
    artist     text not null check (char_length(artist) between 1 and 300),
    title      text not null check (char_length(title)  between 1 and 300),
    year       text not null check (char_length(year) <= 10),
    created_at timestamptz not null default now()
);

alter table cards enable row level security;

create policy "cards: public read"
    on cards for select
    using (true);

create policy "cards: public insert"
    on cards for insert
    with check (true);

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
