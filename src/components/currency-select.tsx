import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { APP_CURRENCIES, type AppCurrencyCode } from "@/lib/currency/currencies";
import { cn } from "@/lib/utils";

const PRIORITY_CURRENCIES = ["CHF", "UAH", "USD", "EUR"] as const satisfies readonly AppCurrencyCode[];

type CurrencySelectProps = {
  value: string;
  onChange: (value: AppCurrencyCode) => void;
  currencies?: readonly AppCurrencyCode[];
  id?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  onBlur?: () => void;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  "aria-labelledby"?: string;
};

function getCurrencyName(currency: string): string {
  try {
    return new Intl.DisplayNames(undefined, { type: "currency" }).of(currency) ?? currency;
  } catch {
    return currency;
  }
}

function sortCurrencies(currencies: readonly AppCurrencyCode[]): AppCurrencyCode[] {
  const available = new Set(currencies);
  const priority = PRIORITY_CURRENCIES.filter((currency) => available.has(currency));
  const rest = currencies.filter((currency) => !PRIORITY_CURRENCIES.some((priority) => priority === currency));
  return [...priority, ...rest];
}

function useCurrencyOptions(currencies: readonly AppCurrencyCode[]) {
  return useMemo(
    () =>
      sortCurrencies(currencies).map((currency) => ({
        currency,
        name: getCurrencyName(currency),
      })),
    [currencies],
  );
}

export function CurrencySelect({
  value,
  onChange,
  currencies = APP_CURRENCIES,
  id,
  placeholder = "Select currency",
  className,
  disabled,
  onBlur,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  "aria-labelledby": ariaLabelledBy,
}: CurrencySelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const options = useCurrencyOptions(currencies);
  const selected = options.find((option) => option.currency === value);

  const filtered = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) {
      return options;
    }

    return options.filter(
      (option) =>
        option.currency.toLowerCase().includes(normalizedSearch) ||
        option.name.toLowerCase().includes(normalizedSearch),
    );
  }, [options, search]);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setSearch("");
      onBlur?.();
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid}
          aria-labelledby={ariaLabelledBy}
          className={cn("h-9 w-full justify-between px-3 font-normal", !selected && "text-muted-foreground", className)}
        >
          <span className="truncate">{selected?.currency ?? (value || placeholder)}</span>
          <ChevronsUpDownIcon className="size-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-0">
        <Command shouldFilter={false}>
          <CommandInput value={search} onValueChange={setSearch} placeholder="Search currency..." />
          <CommandList>
            <CommandEmpty>No currency found.</CommandEmpty>
            {filtered.map((option) => (
              <CommandItem
                key={option.currency}
                value={`${option.currency} ${option.name}`}
                onSelect={() => {
                  onChange(option.currency);
                  handleOpenChange(false);
                }}
              >
                <CheckIcon className={cn("size-4", value === option.currency ? "opacity-100" : "opacity-0")} />
                <span className="font-medium">{option.currency}</span>
                <span className="truncate text-muted-foreground text-xs">{option.name}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
