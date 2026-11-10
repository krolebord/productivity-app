import { isDefinedError, safe } from "@orpc/client";
import type { SessionUser } from "@productivity/core/api/contract";
import * as SecureStore from "expo-secure-store";
import { createContext, type ReactNode, use, useCallback, useEffect, useMemo, useState } from "react";
import { api, setApiSessionToken } from "./api";

const TOKEN_KEY = "session-token";
const USER_KEY = "session-user";
// iOS only: the default (when unlocked) makes the keychain unreadable in a background launch on a locked phone.
const STORE_OPTIONS = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

type SessionState = { status: "loading" } | { status: "signed-out" } | { status: "signed-in"; user: SessionUser };

type SessionContextValue = {
  state: SessionState;
  signIn: (token: string, user: SessionUser) => Promise<void>;
  /**
   * Ends the session on the server, then forgets it here. Resolves false, keeping the session,
   * when the server couldn't be reached; `{ localOnly: true }` then signs out of this device only.
   */
  signOut: (options?: { localOnly?: boolean }) => Promise<boolean>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

function parseStoredUser(value: string | null): SessionUser | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as SessionUser;
  } catch {
    return null;
  }
}

/** The session saved on this device, for code that runs without the UI (the background widget refresh). */
export async function readStoredSession(): Promise<{ token: string; user: SessionUser } | null> {
  const [token, storedUser] = await Promise.all([
    SecureStore.getItemAsync(TOKEN_KEY),
    SecureStore.getItemAsync(USER_KEY),
  ]);
  const user = parseStoredUser(storedUser);
  return token && user ? { token, user } : null;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: "loading" });

  const clearSession = useCallback(async () => {
    setApiSessionToken(null);
    await Promise.all([SecureStore.deleteItemAsync(TOKEN_KEY), SecureStore.deleteItemAsync(USER_KEY)]);
    setState({ status: "signed-out" });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function restore() {
      const stored = await readStoredSession();
      if (cancelled) return;
      if (!stored) {
        setState({ status: "signed-out" });
        return;
      }
      const { token, user } = stored;

      setApiSessionToken(token);
      setState({ status: "signed-in", user });
      // Moves a session stored before STORE_OPTIONS existed to the new accessibility.
      void Promise.all([
        SecureStore.setItemAsync(TOKEN_KEY, token, STORE_OPTIONS),
        SecureStore.setItemAsync(USER_KEY, JSON.stringify(user), STORE_OPTIONS),
      ]).catch(() => {});

      // Starting offline keeps the stored session; only the server rejecting the token signs out.
      const { error, data } = await safe(api.auth.mobile.getSession());
      if (cancelled) return;
      if (isDefinedError(error) && error.code === "UNAUTHORIZED") {
        await clearSession();
      } else if (data) {
        await SecureStore.setItemAsync(USER_KEY, JSON.stringify(data), STORE_OPTIONS);
        setState({ status: "signed-in", user: data });
      }
    }

    restore();
    return () => {
      cancelled = true;
    };
  }, [clearSession]);

  const signIn = useCallback(async (token: string, user: SessionUser) => {
    setApiSessionToken(token);
    await Promise.all([
      SecureStore.setItemAsync(TOKEN_KEY, token, STORE_OPTIONS),
      SecureStore.setItemAsync(USER_KEY, JSON.stringify(user), STORE_OPTIONS),
    ]);
    setState({ status: "signed-in", user });
  }, []);

  const signOut = useCallback(
    async ({ localOnly = false } = {}) => {
      if (!localOnly) {
        const { error } = await safe(api.auth.mobile.signOut());
        // UNAUTHORIZED means the server already dropped the session, so there's nothing left to end there.
        if (error && !(isDefinedError(error) && error.code === "UNAUTHORIZED")) return false;
      }
      await clearSession();
      return true;
    },
    [clearSession],
  );

  const value = useMemo(() => ({ state, signIn, signOut }), [state, signIn, signOut]);

  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useSession() {
  const context = use(SessionContext);
  if (!context) {
    throw new Error("useSession must be used inside SessionProvider");
  }
  return context;
}
