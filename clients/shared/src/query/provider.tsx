import { createContext, useContext, useMemo, type ReactNode } from "react";
import { createApi, type Api } from "../utils/http";

type ApiContext = { baseUrl: string; api: Api };

const Ctx = createContext<ApiContext | null>(null);

/** Sets the backend once for a whole app; hooks read it from here. */
export function ApiProvider({ baseUrl, children }: { baseUrl: string; children: ReactNode }) {
  const value = useMemo(() => ({ baseUrl, api: createApi(() => baseUrl) }), [baseUrl]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApi(): ApiContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApi must be used inside <ApiProvider>");
  return ctx;
}
