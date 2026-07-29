import { createFileRoute, redirect } from "@tanstack/react-router";
import { defaultHomePath } from "@/lib/default-home-store";

export const Route = createFileRoute("/_app/")({
  beforeLoad: () => {
    throw redirect({ to: defaultHomePath() });
  },
});
