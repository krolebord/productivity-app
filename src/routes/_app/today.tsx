import { createFileRoute } from "@tanstack/react-router";
import { TodayView } from "@/components/today/today-view";

export const Route = createFileRoute("/_app/today")({
  component: TodayPage,
});

function TodayPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-4 sm:px-6 sm:py-6">
      <TodayView />
    </div>
  );
}
