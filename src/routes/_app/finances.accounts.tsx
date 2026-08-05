import { createFileRoute, redirect } from "@tanstack/react-router";

/** The accounts list became a card on the overview; kept so old links keep working. */
export const Route = createFileRoute("/_app/finances/accounts")({
  beforeLoad: () => {
    throw redirect({ to: "/finances", replace: true });
  },
});
