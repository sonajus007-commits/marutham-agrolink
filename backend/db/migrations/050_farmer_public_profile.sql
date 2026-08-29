-- 050 — Farmer opt-in public profile (consent to appear publicly).
--
-- By default a grower is ANONYMISED on public pages: an anonymous visitor is only
-- ever shown a district, never a name or village (backend/utils/publicShape.js —
-- this exists because names+villages were once published to Google with no
-- consent). These columns let a farmer CHOOSE to appear on the public /farmers
-- pages, with an optional short bio/story and a photo.
--
--   public_profile   — the consent flag. Nothing about the farmer is shown on a
--                      public page unless this is true. Default false, so the
--                      migration opts NOBODY in.
--   public_bio       — the farmer's own short story, shown on their public card.
--   public_photo_url — an optional photo the farmer consented to show.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS. A partial index keeps the public listing
-- (WHERE public_profile) cheap without bloating the index with the opted-out rows.

alter table users add column if not exists public_profile   boolean not null default false;
alter table users add column if not exists public_bio        text;
alter table users add column if not exists public_photo_url  text;

create index if not exists users_public_profile_idx on users (public_profile) where public_profile;
