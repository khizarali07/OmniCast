-- Initial migration to create the custom users table
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  is_verified BOOLEAN DEFAULT FALSE,
  otp_code TEXT, -- 6-digit OTP code for verification
  reset_token TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Allow our Server Actions (using service_role) to manage users
CREATE POLICY "Service role can do everything" ON public.users
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
