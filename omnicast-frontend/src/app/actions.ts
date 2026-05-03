'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/utils/supabase/admin'
import { sendMail } from '@/utils/mailer'
import { setSession, clearSession } from '@/utils/session'
import { getVerificationEmailHtml } from '@/utils/emailTemplates'
import bcrypt from 'bcryptjs'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

export async function login(formData: FormData) {
  const supabase = createAdminClient()
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .single()

  if (error || !user) {
    return redirect('/login?error=Invalid email or password')
  }

  const isValidPassword = await bcrypt.compare(password, user.password_hash)
  if (!isValidPassword) {
    return redirect('/login?error=Invalid email or password')
  }

  await setSession(user.id, user.is_verified)
  
  revalidatePath('/', 'layout')
  redirect(user.is_verified ? '/dashboard' : '/verify-email')
}

export async function signup(formData: FormData) {
  const supabase = createAdminClient()
  const fullName = formData.get('fullName') as string
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .single()

  if (existingUser) {
    return redirect('/signup?error=User with this email already exists')
  }

  const password_hash = await bcrypt.hash(password, 10)
  const otp_code = Math.floor(100000 + Math.random() * 900000).toString() // 6-digit OTP

  const { data: newUser, error } = await supabase
    .from('users')
    .insert([{ email, full_name: fullName, password_hash, otp_code }])
    .select('id')
    .single()

  if (error || !newUser) {
    return redirect(`/signup?error=${encodeURIComponent(error?.message || 'Failed to create user')}`)
  }

  await setSession(newUser.id, false)

  const verifyUrl = `${SITE_URL}/verify-email?otp=${otp_code}&email=${email}`
  await sendMail(
    email,
    'Verify your OmniCast account',
    getVerificationEmailHtml(otp_code, verifyUrl)
  )

  redirect('/verify-email')
}

export async function forgotPassword(formData: FormData) {
  const supabase = createAdminClient()
  const email = formData.get('email') as string
  
  const reset_token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)

  const { error } = await supabase
    .from('users')
    .update({ reset_token })
    .eq('email', email)

  if (!error) {
    const resetUrl = `${SITE_URL}/reset-password?token=${reset_token}&email=${email}`
    await sendMail(
      email,
      'Reset your OmniCast password',
      `<p>You requested a password reset. Click the link below to reset your password:</p><br/><a href="${resetUrl}">Reset Password</a>`
    )
  }

  redirect('/forgot-password?message=If the email exists, reset instructions have been sent')
}

export async function resetPassword(formData: FormData) {
  const supabase = createAdminClient()
  const email = formData.get('email') as string
  const token = formData.get('token') as string
  const password = formData.get('password') as string
  const confirm_password = formData.get('confirm_password') as string

  if (password !== confirm_password) {
    return redirect(`/reset-password?error=Passwords do not match&token=${token}&email=${email}`)
  }

  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .eq('reset_token', token)
    .single()

  if (!user) {
    return redirect('/reset-password?error=Invalid or expired reset token')
  }

  const password_hash = await bcrypt.hash(password, 10)

  const { error } = await supabase
    .from('users')
    .update({ password_hash, reset_token: null })
    .eq('id', user.id)

  if (error) {
    return redirect(`/reset-password?error=${encodeURIComponent(error.message)}`)
  }

  redirect('/login?message=Password updated successfully')
}

export async function verifyOTP(formData: FormData) {
  const supabase = createAdminClient()
  const email = formData.get('email') as string
  const otp = formData.get('otp') as string

  const { data: user, error } = await supabase
    .from('users')
    .select('id, otp_code')
    .eq('email', email)
    .single()

  if (error || !user || user.otp_code !== otp) {
    return redirect(`/verify-email?error=Invalid or expired verification code&email=${email}&otp=${otp}`)
  }

  const { error: updateError } = await supabase
    .from('users')
    .update({ is_verified: true, otp_code: null })
    .eq('id', user.id)

  if (updateError) {
    return redirect(`/verify-email?error=Verification failed&email=${email}&otp=${otp}`)
  }

  await setSession(user.id, true)
  
  revalidatePath('/', 'layout')
  redirect('/dashboard?message=Account verified successfully!')
}

export async function resendOTP(email: string) {
  const supabase = createAdminClient()
  
  const otp_code = Math.floor(100000 + Math.random() * 900000).toString()

  const { error } = await supabase
    .from('users')
    .update({ otp_code })
    .eq('email', email)

  if (error) {
    return { error: 'Failed to generate new code' }
  }

  const verifyUrl = `${SITE_URL}/verify-email?otp=${otp_code}&email=${email}`
  const { success } = await sendMail(
    email,
    'Your new OmniCast verification code',
    getVerificationEmailHtml(otp_code, verifyUrl)
  )

  if (!success) {
    return { error: 'Failed to send email' }
  }

  return { success: true, message: 'New code sent successfully' }
}
