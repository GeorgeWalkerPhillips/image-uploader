import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { notify } from './notify';
import { clearAll as clearPersisted } from './lib/persist';
import { clearStashedToken } from './lib/joinToken';
import { useAuthUser } from './useAuthUser';

// Signs out and wipes everything personal HQ keeps on this device.
export function useSignOut(): () => Promise<void> {
  const { signOut } = useAuthUser();
  const navigate = useNavigate();
  const qc = useQueryClient();
  return async () => {
    try {
      // The offline copy is personal data: wipe it before the session goes.
      clearPersisted();
      clearStashedToken();
      await signOut();
      clearPersisted(); // again: a debounced save may have landed during sign-out
      qc.clear();
      navigate('/', { replace: true });
    } catch {
      notify.error('Could not sign out. Please try again.');
    }
  };
}
