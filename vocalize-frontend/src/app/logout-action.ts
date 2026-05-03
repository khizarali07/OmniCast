'use server'

import { redirect } from 'next/navigation'
import { clearSession } from '@/utils/session'

export async function logout() {
  await clearSession()
  redirect('/login')
}
