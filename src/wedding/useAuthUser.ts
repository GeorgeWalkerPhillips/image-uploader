import { useAuth } from '../context/AuthContext';

interface AuthShape {
  user: { id: string } | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

interface RawAuth {
  user: { id: string; is_anonymous?: boolean } | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

// AuthContext is untyped JS; this is the only place its shape is asserted.
// An anonymous guest session (the camera flow) is not an account: it is
// reported as signed out, so HQ never treats a guest as a user.
export function useAuthUser(): AuthShape {
  const auth = useAuth() as unknown as RawAuth;
  return { ...auth, user: auth.user && !auth.user.is_anonymous ? auth.user : null };
}
