import { Command as CommandPrimitive, useCommandState } from "cmdk";
import { CheckIcon } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

const inputClassName = cn(
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs outline-none transition-all selection:bg-primary/20 selection:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30",
  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
  "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
);

type ComboboxInputProps = {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  options: string[];
  placeholder?: string;
  id?: string;
  className?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  "aria-labelledby"?: string;
};

type ComboboxDropdownProps = {
  options: string[];
  value: string;
  onSelect: (selected: string) => void;
};

function ComboboxDropdown({ options, value, onSelect }: ComboboxDropdownProps) {
  const count = useCommandState((state) => state.filtered.count);

  return (
    <div
      className={cn(
        "absolute top-full left-0 z-50 mt-1 w-max min-w-full max-w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-md border bg-popover shadow-md",
        count === 0 && "hidden",
      )}
      aria-hidden={count === 0}
    >
      <CommandPrimitive.List className="max-h-72 scroll-py-1 overflow-y-auto p-1">
        {options.map((option) => (
          <CommandPrimitive.Item
            key={option}
            value={option}
            onSelect={onSelect}
            onMouseDown={(event) => event.preventDefault()}
            className="relative flex cursor-default select-none items-center gap-2 truncate rounded-sm px-2 py-1.5 text-sm outline-hidden data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
          >
            <CheckIcon className={cn("size-3.5 shrink-0", value === option ? "opacity-100" : "opacity-0")} />
            {option}
          </CommandPrimitive.Item>
        ))}
      </CommandPrimitive.List>
    </div>
  );
}

export function ComboboxInput({
  value,
  onChange,
  onBlur,
  options,
  placeholder,
  id,
  className,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  "aria-labelledby": ariaLabelledBy,
}: ComboboxInputProps) {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState(value);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Close on outside mousedown (works correctly inside Radix Dialog)
  React.useEffect(() => {
    if (!open) return;
    function handleMouseDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [open]);

  function handleValueChange(next: string) {
    setInputValue(next);
    onChange(next);
    setOpen(true);
  }

  function handleSelect(selected: string) {
    onChange(selected);
    setInputValue(selected);
    setOpen(false);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape" || e.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <CommandPrimitive loop>
        <CommandPrimitive.Input
          ref={inputRef}
          id={id}
          value={inputValue}
          onValueChange={handleValueChange}
          onFocus={() => setOpen(true)}
          onBlur={onBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={cn(inputClassName, className)}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid}
          aria-labelledby={ariaLabelledBy}
          autoComplete="off"
        />
        {open && <ComboboxDropdown options={options} value={value} onSelect={handleSelect} />}
      </CommandPrimitive>
    </div>
  );
}
