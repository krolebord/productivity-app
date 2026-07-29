import { XIcon } from "lucide-react";
import * as React from "react";
import { normalizeTag } from "@/lib/tags";
import { cn } from "@/lib/utils";

type TagInputProps = {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions: string[];
  placeholder?: string;
  id?: string;
  className?: string;
};

const MAX_SUGGESTIONS = 8;

export function TagInput({ value, onChange, suggestions, placeholder, id, className }: TagInputProps) {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

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

  const normalizedInput = normalizeTag(inputValue);

  const filtered = React.useMemo(() => {
    const selected = new Set(value);
    const base = suggestions.filter((s) => !selected.has(s));
    const matches = normalizedInput ? base.filter((s) => s.includes(normalizedInput)) : base;
    return matches.slice(0, MAX_SUGGESTIONS);
  }, [suggestions, value, normalizedInput]);

  const canCreate =
    normalizedInput.length > 0 && !value.includes(normalizedInput) && !filtered.includes(normalizedInput);

  const options = React.useMemo<Array<{ kind: "tag" | "create"; value: string }>>(() => {
    const opts: Array<{ kind: "tag" | "create"; value: string }> = filtered.map((value) => ({ kind: "tag", value }));
    if (canCreate) opts.push({ kind: "create", value: normalizedInput });
    return opts;
  }, [filtered, canCreate, normalizedInput]);

  const showDropdown = open && options.length > 0;

  const [activeIndex, setActiveIndex] = React.useState(0);
  const activeOptionIndex = options.length === 0 ? 0 : Math.min(activeIndex, options.length - 1);

  function addTag(raw: string) {
    const tag = normalizeTag(raw);
    setInputValue("");
    if (!tag || value.includes(tag)) return;
    onChange([...value, tag]);
  }

  function removeTag(tag: string) {
    onChange(value.filter((t) => t !== tag));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" && options.length > 0) {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => (Math.min(i, options.length - 1) + 1) % options.length);
    } else if (e.key === "ArrowUp" && options.length > 0) {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => (Math.min(i, options.length - 1) - 1 + options.length) % options.length);
    } else if (e.key === "Enter") {
      const active = showDropdown ? options[activeOptionIndex] : undefined;
      if (active) {
        e.preventDefault();
        addTag(active.value);
      } else if (normalizedInput) {
        e.preventDefault();
        addTag(inputValue);
      }
    } else if (e.key === "," && normalizedInput) {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === "Tab" && !e.shiftKey) {
      if (normalizedInput) {
        const active = showDropdown ? options[activeOptionIndex] : undefined;
        e.preventDefault();
        addTag(active ? active.value : inputValue);
      } else {
        setOpen(false);
      }
    } else if (e.key === "Backspace" && inputValue === "" && value.length > 0) {
      removeTag(value[value.length - 1]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div
        className={cn("flex min-h-7 flex-wrap items-center gap-1 px-0 text-sm", className)}
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-muted py-0.5 pr-1 pl-2 font-medium text-muted-foreground text-xs"
          >
            #{tag}
            <button
              type="button"
              aria-label={`Remove ${tag}`}
              className="rounded-full p-0.5 text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                removeTag(tag);
              }}
            >
              <XIcon className="size-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? placeholder : undefined}
          autoComplete="off"
          className="min-w-24 flex-1 bg-transparent py-0.5 outline-none placeholder:text-muted-foreground"
        />
      </div>
      {showDropdown && (
        <div
          role="listbox"
          className="absolute top-full right-0 left-0 z-50 mt-1 overflow-hidden rounded-md border bg-popover p-1 shadow-md"
        >
          {options.map((option, index) => {
            const active = index === activeOptionIndex;
            return (
              <button
                key={option.kind === "create" ? `__create__${option.value}` : option.value}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  addTag(option.value);
                  inputRef.current?.focus();
                }}
                onMouseEnter={() => setActiveIndex(index)}
                className={cn(
                  "flex w-full items-center gap-1 rounded-sm px-2 py-1.5 text-left text-sm outline-hidden",
                  active && "bg-accent text-accent-foreground",
                  option.kind === "create" && "text-muted-foreground",
                )}
              >
                {option.kind === "create" ? (
                  <>
                    Create <span className="font-medium text-foreground">#{option.value}</span>
                  </>
                ) : (
                  <>#{option.value}</>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
