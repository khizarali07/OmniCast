'use client';

import { useEffect, Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { toast } from 'sonner';

function ToastLogic() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const error = searchParams.get('error');
    const message = searchParams.get('message');

    if (error) {
      toast.error(error);
    }
    
    if (message) {
      toast.success(message);
    }

    if (error || message) {
      const newSearchParams = new URLSearchParams(searchParams.toString());
      newSearchParams.delete('error');
      newSearchParams.delete('message');
      
      const newUrl = pathname + (newSearchParams.toString() ? `?${newSearchParams.toString()}` : '');
      router.replace(newUrl, { scroll: false });
    }
  }, [searchParams, pathname, router]);

  return null;
}

export function AuthToast() {
  return (
    <Suspense fallback={null}>
      <ToastLogic />
    </Suspense>
  );
}
