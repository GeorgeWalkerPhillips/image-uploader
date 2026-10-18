import { useAuth } from '../context/AuthContext';

interface AuthShape {
  user: { id: string } | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

// AuthContext is untyped JS; this is the only place its shape is asserted.
export function useAuthUser(): AuthShape {
  return useAuth() as unknown as AuthShape;
}
