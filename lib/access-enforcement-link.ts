import type { TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import type { AppRouter } from "@/server/routers";
import { reportAccessRejection } from "./device-revocation";

/** Se limita a operaciones con token explícito; OTP y APIs públicas conservan comportamiento. */
export const accessEnforcementLink: TRPCLink<AppRouter> =
  () =>
  ({ op, next }) => {
    const input = op.input as { token?: string } | undefined;
    return observable((observer) =>
      next(op).subscribe({
        next(value) {
          if (input?.token && op.path !== "access.signOut")
            reportAccessRejection(input.token, value.result.data);
          observer.next(value);
        },
        error(error) {
          if (input?.token && op.path !== "access.signOut")
            reportAccessRejection(input.token, error);
          observer.error(error);
        },
        complete() {
          observer.complete();
        },
      }),
    );
  };
