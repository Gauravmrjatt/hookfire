import { useEffect, useState } from "react";

import { getApiConfig, onApiConfigChange } from "@/lib/api";

/** Session state: presence of a bearer token. Storage is the single source. */
export function useSession() {
  const [token, setToken] = useState(() => getApiConfig().token);

  useEffect(() => {
    setToken(getApiConfig().token);
    return onApiConfigChange((cfg) => setToken(cfg.token));
  }, []);

  return { token, connected: token.length > 0 };
}
