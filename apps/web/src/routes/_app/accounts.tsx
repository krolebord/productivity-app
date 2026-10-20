import { createFileRoute, redirect } from "@tanstack/react-router";

/** The accounts list lives on the finances overview; kept so old links keep working. */
export const Route = createFileRoute("/_app/accounts")({
  beforeLoad: () => {
    throw redirect({ to: "/finances", replace: true });
  },
});
