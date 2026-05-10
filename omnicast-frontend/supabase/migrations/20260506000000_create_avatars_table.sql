-- Avatar storage for OmniCast

create table if not exists public.avatars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  video_url text,
  reference_audio_url text,
  created_at timestamptz not null default now()
);

alter table public.avatars
  add column if not exists video_service_path text,
  add column if not exists output_video_url text,
  add column if not exists voice_metadata jsonb;

create index if not exists avatars_user_id_idx on public.avatars(user_id);
