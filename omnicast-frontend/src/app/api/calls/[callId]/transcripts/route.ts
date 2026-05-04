import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getSession } from '@/utils/session';

interface RouteParams {
  params: {
    callId: string;
  };
}

export async function GET(_request: Request, { params }: RouteParams) {
  const session = await getSession();
  if (!session?.user_id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const callCheck = await supabase
    .from('calls')
    .select('id')
    .eq('id', params.callId)
    .eq('user_id', session.user_id)
    .single();

  if (callCheck.error || !callCheck.data) {
    return NextResponse.json({ error: 'Call not found' }, { status: 404 });
  }

  const { data, error } = await supabase
    .from('transcripts')
    .select('id, role, message, created_at')
    .eq('call_id', params.callId)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to load transcripts' },
      { status: 500 }
    );
  }

  return NextResponse.json(data ?? []);
}
