import { createFileRoute, Link, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/finances")({
  component: FinancesWorkspace,
});

function FinancesWorkspace() {
  return (
    <div className="@container mx-auto flex max-w-6xl flex-col px-4 py-4 sm:px-6 sm:py-6">
      <header className="border-b">
        <div>
          <h1 className="font-semibold text-xl">Finances</h1>
          <p className="text-muted-foreground text-sm">See the whole picture, then inspect every movement.</p>
        </div>

        <nav aria-label="Finances sections" className="mt-4 flex gap-5">
          <Link
            to="/finances"
            activeOptions={{ exact: true }}
            className="-mb-px border-transparent border-b-2 px-0.5 pb-2.5 font-medium text-muted-foreground text-sm transition-colors hover:text-foreground data-[status=active]:border-foreground data-[status=active]:text-foreground"
          >
            Overview
          </Link>
          <Link
            to="/finances/transactions"
            className="-mb-px border-transparent border-b-2 px-0.5 pb-2.5 font-medium text-muted-foreground text-sm transition-colors hover:text-foreground data-[status=active]:border-foreground data-[status=active]:text-foreground"
          >
            Transactions
          </Link>
        </nav>
      </header>

      <div className="pt-6">
        <Outlet />
      </div>
    </div>
  );
}
