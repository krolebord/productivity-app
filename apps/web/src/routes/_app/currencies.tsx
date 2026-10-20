import { createFileRoute, redirect } from "@tanstack/react-router";

/** Currencies became the finances "Rates" tab; kept so old links keep working. */
export const Route = createFileRoute("/_app/currencies")({
  beforeLoad: () => {
    throw redirect({ to: "/finances/rates", replace: true });
  },
});
