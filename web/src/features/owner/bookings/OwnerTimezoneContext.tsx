import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getConfiguration } from "./api";

/**
 * Fallback timezone used when `/api/config` fails or before its first
 * response lands. The web/ workspace doesn't see raw backend env vars;
 * `VITE_OWNER_TIMEZONE` is the Vite-exposed variant (build-time) of
 * `OWNER_TIMEZONE` and defaults to `"Europe/Moscow"` if unset.
 */
const FALLBACK_TZ = import.meta.env.VITE_OWNER_TIMEZONE ?? "Europe/Moscow";

interface OwnerTimezoneState {
  timezone: string;
  loading: boolean;
  error: string | null;
}

const OwnerTimezoneContext = createContext<OwnerTimezoneState>({
  timezone: FALLBACK_TZ,
  loading: true,
  error: null,
});

export function OwnerTimezoneProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OwnerTimezoneState>({
    timezone: FALLBACK_TZ,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    getConfiguration()
      .then((config) => {
        if (cancelled) {
          return;
        }
        setState({ timezone: config.owner.timezone, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }
        setState({
          timezone: FALLBACK_TZ,
          loading: false,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return <OwnerTimezoneContext.Provider value={state}>{children}</OwnerTimezoneContext.Provider>;
}

export function useOwnerTimezone(): OwnerTimezoneState {
  return useContext(OwnerTimezoneContext);
}
