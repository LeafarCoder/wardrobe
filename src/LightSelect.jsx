import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CaretDown, Check, MagnifyingGlass } from "@phosphor-icons/react";
import { tr } from "./i18n.js";
import "./light-select.css";

function normalizeOptions(options) {
  return options.map((option) => typeof option === "string"
    ? { value: option, label: option, keywords: "" }
    : {
        ...option,
        value: String(option.value),
        label: String(option.label ?? option.value),
        keywords: Array.isArray(option.keywords) ? option.keywords.join(" ") : String(option.keywords || ""),
      });
}

function matchingOptions(options, query) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return options;
  return options
    .map((option, index) => {
      const label = option.label.toLocaleLowerCase();
      const searchableText = `${label} ${option.keywords.toLocaleLowerCase()}`;
      return {
        option,
        index,
        rank: label.startsWith(normalizedQuery) ? 0 : searchableText.includes(normalizedQuery) ? 1 : 2,
      };
    })
    .filter((entry) => entry.rank < 2)
    .sort((first, second) => first.rank - second.rank || first.index - second.index)
    .map((entry) => entry.option);
}

function visibleVerticalBounds(element) {
  let top = 0;
  let bottom = window.innerHeight;
  let parent = element?.parentElement;
  while (parent) {
    const overflow = getComputedStyle(parent).overflowY;
    if (/(auto|scroll|hidden|clip)/.test(overflow)) {
      const rect = parent.getBoundingClientRect();
      top = Math.max(top, rect.top);
      bottom = Math.min(bottom, rect.bottom);
    }
    parent = parent.parentElement;
  }
  return { top, bottom };
}

export function LightSelect({
  value,
  onChange,
  options,
  ariaLabel,
  placeholder = tr("Choose an option"),
  searchPlaceholder = tr("Search options"),
  noResultsLabel = tr("No matching options"),
  searchable,
  disabled = false,
  className = "",
}) {
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const searchRef = useRef(null);
  const listId = `light-select-${useId().replaceAll(":", "")}`;
  const normalizedOptions = useMemo(() => normalizeOptions(options), [options]);
  const selectedOption = normalizedOptions.find((option) => option.value === String(value ?? ""));
  const hasSearch = searchable ?? normalizedOptions.length > 6;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [placement, setPlacement] = useState("down");
  const filteredOptions = useMemo(
    () => matchingOptions(normalizedOptions, query),
    [normalizedOptions, query],
  );

  const closeMenu = (restoreFocus = false) => {
    setOpen(false);
    setQuery("");
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
  };

  const openMenu = () => {
    if (disabled) return;
    setQuery("");
    setActiveIndex(Math.max(0, normalizedOptions.findIndex((option) => option.value === String(value ?? ""))));
    setOpen(true);
  };

  const chooseOption = (option) => {
    onChange(option.value);
    closeMenu(true);
  };

  useEffect(() => {
    if (!open) return undefined;
    const closeFromOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) closeMenu(false);
    };
    document.addEventListener("pointerdown", closeFromOutside);
    if (hasSearch) requestAnimationFrame(() => searchRef.current?.focus({ preventScroll: true }));
    return () => document.removeEventListener("pointerdown", closeFromOutside);
  }, [hasSearch, open]);

  useLayoutEffect(() => {
    if (!open) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const bounds = visibleVerticalBounds(triggerRef.current);
    const expectedHeight = hasSearch ? 226 : 184;
    const availableBelow = bounds.bottom - rect.bottom;
    const availableAbove = rect.top - bounds.top;
    setPlacement(availableBelow < expectedHeight && availableAbove > availableBelow ? "up" : "down");
  }, [hasSearch, open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    rootRef.current
      ?.querySelector(`[data-light-option-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const handleMenuKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeMenu(true);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        openMenu();
        return;
      }
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => {
        if (!filteredOptions.length) return 0;
        return (current + direction + filteredOptions.length) % filteredOptions.length;
      });
      return;
    }
    if (event.key === "Enter" && open && filteredOptions[activeIndex]) {
      event.preventDefault();
      chooseOption(filteredOptions[activeIndex]);
    }
  };

  return (
    <div className={`light-select${open ? " is-open" : ""}${className ? ` ${className}` : ""}`} ref={rootRef}>
      <button
        className="light-select__trigger"
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        disabled={disabled}
        onClick={() => open ? closeMenu(false) : openMenu()}
        onKeyDown={handleMenuKeyDown}
      >
        <span className={`light-select__value${selectedOption ? "" : " is-placeholder"}`}>
          {selectedOption?.icon && <span className="light-select__icon" aria-hidden="true">{selectedOption.icon}</span>}
          <span>{selectedOption?.label || placeholder}</span>
        </span>
        <CaretDown size={14} weight="regular" aria-hidden="true" />
      </button>
      {open && (
        <div className={`light-select__popover is-${placement}`}>
          {hasSearch && (
            <label className="light-select__search">
              <MagnifyingGlass size={15} weight="regular" aria-hidden="true" />
              <input
                ref={searchRef}
                value={query}
                type="search"
                autoComplete="off"
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                aria-controls={listId}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleMenuKeyDown}
              />
            </label>
          )}
          <div className="light-select__list" id={listId} role="listbox" aria-label={ariaLabel}>
            {filteredOptions.map((option, index) => (
              <button
                className={`light-select__option${index === activeIndex ? " is-active" : ""}`}
                data-light-option-index={index}
                type="button"
                role="option"
                aria-selected={option.value === String(value ?? "")}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => chooseOption(option)}
                key={option.value}
              >
                <span className="light-select__value">
                  {option.icon && <span className="light-select__icon" aria-hidden="true">{option.icon}</span>}
                  <span className="light-select__option-copy">
                    <span>{option.label}</span>
                    {option.meta && <small>{option.meta}</small>}
                  </span>
                </span>
                {option.value === String(value ?? "") && <Check size={14} weight="bold" aria-hidden="true" />}
              </button>
            ))}
            {!filteredOptions.length && <p className="light-select__empty">{noResultsLabel}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export function LightTypeahead({
  value,
  onChange,
  options,
  onSelect,
  onCommit,
  ariaLabel,
  placeholder = "",
  autoComplete = "off",
  minCharacters = 1,
  maxResults = 4,
  className = "",
  maxLength,
}) {
  const rootRef = useRef(null);
  const listId = `light-typeahead-${useId().replaceAll(":", "")}`;
  const normalizedOptions = useMemo(() => normalizeOptions(options), [options]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const filteredOptions = useMemo(
    () => matchingOptions(normalizedOptions, value).slice(0, maxResults),
    [maxResults, normalizedOptions, value],
  );
  const suggestionsVisible = open
    && value.trim().length >= minCharacters
    && filteredOptions.length > 0;

  useEffect(() => {
    const closeFromOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeFromOutside);
    return () => document.removeEventListener("pointerdown", closeFromOutside);
  }, []);

  useEffect(() => {
    setActiveIndex(0);
  }, [value]);

  const chooseOption = (option) => {
    onSelect?.(option.value, option);
    setOpen(false);
  };

  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      if (suggestionsVisible) {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
      }
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!filteredOptions.length || value.trim().length < minCharacters) return;
      event.preventDefault();
      setOpen(true);
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => (current + direction + filteredOptions.length) % filteredOptions.length);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (suggestionsVisible && filteredOptions[activeIndex]) chooseOption(filteredOptions[activeIndex]);
      else onCommit?.(value);
      return;
    }
    if (event.key === ",") {
      event.preventDefault();
      onCommit?.(value);
      setOpen(false);
    }
  };

  return (
    <div className={`light-typeahead${className ? ` ${className}` : ""}`} ref={rootRef}>
      <input
        value={value}
        role="combobox"
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={suggestionsVisible}
        aria-controls={suggestionsVisible ? listId : undefined}
        aria-activedescendant={suggestionsVisible ? `${listId}-${activeIndex}` : undefined}
        autoComplete={autoComplete}
        maxLength={maxLength}
        placeholder={placeholder}
        onFocus={() => setOpen(false)}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(event.target.value.trim().length >= minCharacters);
        }}
        onKeyDown={handleKeyDown}
      />
      {suggestionsVisible && (
        <div className="light-typeahead__list" id={listId} role="listbox" aria-label={ariaLabel}>
          {filteredOptions.map((option, index) => (
            <button
              className={index === activeIndex ? "is-active" : ""}
              id={`${listId}-${index}`}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => chooseOption(option)}
              key={option.value}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
