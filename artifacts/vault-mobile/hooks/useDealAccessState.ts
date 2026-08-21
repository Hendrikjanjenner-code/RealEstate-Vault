import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type AccessState = 'locked' | 'requested' | 'granted';

const keyFor = (dealId: number) => `dealAccessState:${dealId}`;

/**
 * Per-deal access state persisted on-device (AsyncStorage), so unlocked
 * deals stay unlocked across app restarts. Temporary until real per-user
 * NDA status exists on the server, then this should switch to
 * server-derived state.
 */
export function useDealAccessState(dealId: number) {
  const [accessState, setAccessStateRaw] = useState<AccessState>('locked');
  const [hydrated, setHydrated] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    setHydrated(false);
    setAccessStateRaw('locked');
    if (!dealId) {
      setHydrated(true);
      return;
    }
    AsyncStorage.getItem(keyFor(dealId))
      .then((value) => {
        if (!mounted.current) return;
        if (value === 'requested' || value === 'granted') {
          setAccessStateRaw(value);
        }
      })
      .catch(() => {
        // Ignore read errors; fall back to locked.
      })
      .finally(() => {
        if (mounted.current) setHydrated(true);
      });
    return () => {
      mounted.current = false;
    };
  }, [dealId]);

  const setAccessState = (next: AccessState) => {
    setAccessStateRaw(next);
    if (!dealId) return;
    AsyncStorage.setItem(keyFor(dealId), next).catch(() => {
      // Persistence failure shouldn't break the in-session flow.
    });
  };

  return { accessState, setAccessState, hydrated };
}
