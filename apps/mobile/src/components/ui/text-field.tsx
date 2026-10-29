import type { ComponentProps } from "react";
import { cn } from "../../lib/utils";
import { Input } from "./input";

/** Standalone bordered input, for fields that aren't inside a form row. */
export function TextField({ className, ...props }: ComponentProps<typeof Input>) {
  return <Input className={cn("h-12 rounded-lg border border-input bg-background px-4", className)} {...props} />;
}
