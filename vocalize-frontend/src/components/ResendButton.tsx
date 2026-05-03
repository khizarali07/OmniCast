'use client'

import { useState } from 'react';
import { resendOTP } from '@/app/actions';
import { toast } from 'sonner';

export default function ResendButton({ email }: { email: string }) {
  const [loading, setLoading] = useState(false);

  const handleResend = async () => {
    if (!email) {
      toast.error('Email is missing');
      return;
    }
    
    setLoading(true);
    try {
      const result = await resendOTP(email);
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.error || 'Failed to resend code');
      }
    } catch (error) {
      toast.error('Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button 
      onClick={handleResend}
      disabled={loading}
      className="text-primary hover:text-primary-fixed font-medium transition-colors ml-1 disabled:opacity-50"
    >
      {loading ? 'Sending...' : 'Resend Code'}
    </button>
  );
}
