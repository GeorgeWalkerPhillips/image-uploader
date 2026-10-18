import { createContext, useContext } from 'react';
import type { Member, Wedding } from './types';

export interface WeddingContextValue {
  member: Member;
  wedding: Wedding;
}

export const WeddingContext = createContext<WeddingContextValue | null>(null);

export function useWedding(): WeddingContextValue {
  const ctx = useContext(WeddingContext);
  if (!ctx) throw new Error('useWedding must be used inside the Wedding HQ gate');
  return ctx;
}
