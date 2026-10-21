import { isDefinedError, safe } from "@orpc/client";
import type { SessionUser } from "@productivity/core/api/contract";
import * as SecureStore from "expo-secure-store";
import { createContext, type ReactNode, use, useCallback, useEffect, useMemo, useState } from "react";
import { api, setApiSessionToken } from "./api";

const TOKEN_KEY = "session-token";
const USER_KEY = "session-user";

type SessionState = { status: "loading" } | { status: "signed-out" } | { status: "signed-in"; user: SessionUser };

type SessionContextValue = {
  state: SessionState;
  signIn: (token: string, user: SessionUser) => Promise<void>;
  signOut: () => Promise<void>;
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
      const [token, storedUser] = await Promise.all([
        SecureStore.getItemAsync(TOKEN_KEY),
        SecureStore.getItemAsync(USER_KEY),
      ]);
      const user = parseStoredUser(storedUser);
      if (cancelled) return;
      if (!token || !user) {
        setState({ status: "signed-out" });
        return;
      }

      setApiSessionToken(token);
      setState({ status: "signed-in", user });

      // Starting offline keeps the stored session; only the server rejecting the token signs out.
      const { error, data } = await safe(api.auth.mobile.getSession());
      if (cancelled) return;
      if (isDefinedError(error) && error.code === "UNAUTHORIZED") {
        await clearSession();
      } else if (data) {
        await SecureStore.setItemAsync(USER_KEY, JSON.stringify(data));
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
      SecureStore.setItemAsync(TOKEN_KEY, token),
      SecureStore.setItemAsync(USER_KEY, JSON.stringify(user)),
    ]);
    setState({ status: "signed-in", user });
  }, []);

  const signOut = useCallback(async () => {
    await safe(api.auth.mobile.signOut());
    await clearSession();
  }, [clearSession]);

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
