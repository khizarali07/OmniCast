-- Add avatar_url for profile pictures
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;
