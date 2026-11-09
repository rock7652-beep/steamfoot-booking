import 'server-only';
import {redirect} from 'next/navigation';
import {getActiveStoreForRead} from '@/lib/store';
import {beautyManager} from './access';

/** Cookie changes can re-render the old store page before client navigation. */
export async function beautyPageManager(user: Parameters<typeof getActiveStoreForRead>[0]) {
  if (user.role === 'ADMIN' && !(await getActiveStoreForRead(user))) {
    redirect('/hq/dashboard');
  }
  // Retain authorization, store/module validation and active staff checks.
  return beautyManager('booking.read');
}
