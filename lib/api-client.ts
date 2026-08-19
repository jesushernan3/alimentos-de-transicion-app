/**
 * Cliente de API imperativo.
 *
 * El motor de sincronización y el flujo de acceso necesitan llamar al servidor
 * fuera del ciclo de render de React, por lo que no pueden usar los hooks de
 * tRPC. Este cliente comparte la misma URL base y el mismo formato que el
 * cliente de React, pero se invoca como una función común.
 */

import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";

import { getApiBaseUrl } from "@/constants/oauth";
import type { AppRouter } from "@/server/routers";

export const api = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${getApiBaseUrl()}/api/trpc`,
      transformer: superjson,
      fetch(url, options) {
        return fetch(url, { ...options, credentials: "include" });
      },
    }),
  ],
});
