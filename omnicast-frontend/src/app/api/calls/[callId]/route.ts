import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getSession } from '@/utils/session';

interface RouteParams {
  params: {
    callId: string;
  };
}

export async function PATCH(_request: NextRequest, { params }: RouteParams) {
  const session = await getSession();
  if (!session?.user_id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('calls')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', params.callId)
    .eq('user_id', session.user_id);

  if (error) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to end call' },
      { status: 500 }
    );
  }

  return NextResponse.json({ status: 'success', call_id: params.callId });
}
