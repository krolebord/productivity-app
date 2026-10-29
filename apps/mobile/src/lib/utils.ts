import { type ClassNameValue, twMerge } from "tailwind-merge";

/** Joins classNames, letting later classes override conflicting earlier ones (Uniwind applies both otherwise). */
export function cn(...classes: ClassNameValue[]) {
  return twMerge(classes);
}
