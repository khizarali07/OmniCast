import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getSession } from '@/utils/session';

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.user_id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let payload: { voice_id?: string } | null = null;
  try {
    payload = await request.json();
  } catch {
    payload = null;
  }

  const voiceId = payload?.voice_id ?? null;
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('calls')
    .insert([{ user_id: session.user_id, voice_id: voiceId }])
    .select('id, created_at, voice_id')
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? 'Failed to create call' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function GET() {
  const session = await getSession();
  if (!session?.user_id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('calls')
    .select('id, voice_id, created_at, ended_at')
    .eq('user_id', session.user_id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to load calls' },
      { status: 500 }
    );
  }

  return NextResponse.json(data ?? []);
}
