import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Check, Search } from 'lucide-react';

export interface DropdownMenuItem<T extends string = string> {
  value: T;
  label: string;
  description?: string;
  badge?: string | number;
  accentDotColor?: string;
}

interface DropdownMenuProps<T extends string = string> {
  id?: string;
  label?: string;
  placeholder?: string;
  ariaLabel?: string;
  value: T;
  options: DropdownMenuItem<T>[];
  onChange: (value: T) => void;
  icon?: React.ReactNode;
  searchable?: boolean;
  searchPlaceholder?: string;
  align?: 'left' | 'right';
  menuWidthClass?: string;
  className?: string;
  triggerClassName?: string;
}

export function DropdownMenu<T extends string = string>({
  id,
  label = '',
  placeholder,
  ariaLabel,
  value,
  options,
  onChange,
  icon,
  searchable = false,
  searchPlaceholder = 'Filter options...',
  align = 'left',
  menuWidthClass = 'w-60',
  className = '',
  triggerClassName = '',
}: DropdownMenuProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedOption = useMemo(
    () =>
      options.find((opt) => opt.value === value) ||
      (placeholder ? undefined : options[0]),
    [options, value, placeholder]
  );

  const filteredOptions = useMemo(() => {
    if (!searchable || !query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        (opt.description && opt.description.toLowerCase().includes(q))
    );
  }, [options, query, searchable]);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      return;
    }
    if (searchable) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 20);
      return () => clearTimeout(timer);
    }
  }, [isOpen, searchable]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const displayLabel = selectedOption
    ? selectedOption.label
    : placeholder || value;

  return (
    <div
      ref={containerRef}
      className={`relative inline-block max-w-full min-w-0 ${isOpen ? 'z-50' : 'z-10'} ${className}`}
    >
      {/* Custom Dropdown Trigger Button */}
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel || (label ? `${label}: ${displayLabel}` : displayLabel)}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full max-w-full min-w-0 inline-flex items-center justify-between gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border transition-all cursor-pointer select-none ${triggerClassName} ${
          isOpen
            ? 'bg-indigo-950/40 border-indigo-500 text-white shadow-sm shadow-indigo-500/10'
            : 'bg-[#0B0F17] border-slate-800 hover:border-indigo-500/60 text-slate-200 hover:text-white'
        }`}
      >
        <span className="inline-flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
          {icon && <span className="text-indigo-400 shrink-0">{icon}</span>}
          {label && (
            <span className="text-[11px] font-mono text-slate-400 shrink-0">
              {label}:
            </span>
          )}
          <span
            className={`truncate ${
              selectedOption ? 'font-semibold text-white' : 'font-medium text-slate-300'
            }`}
          >
            {displayLabel}
          </span>
          {selectedOption?.badge !== undefined && (
            <span className="text-[10px] font-mono tabular-nums text-indigo-300 shrink-0">
              ({selectedOption.badge})
            </span>
          )}
        </span>

        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform duration-150 ${
            isOpen ? 'rotate-180 text-indigo-400' : ''
          }`}
        />
      </button>

      {/* Floating Dropdown Menu Popover UI */}
      {isOpen && (
        <div
          role="listbox"
          aria-label={ariaLabel || label}
          className={`absolute z-50 mt-1.5 ${menuWidthClass} max-w-[calc(100vw-2rem)] ${
            align === 'right' ? 'right-0' : 'left-0'
          } bg-[#0B0F17] backdrop-blur-xl border border-slate-700/90 rounded-xl shadow-2xl shadow-black/80 overflow-hidden animate-dropdown-popover`}
        >
          {/* Optional Menu Header Bar */}
          <div className="px-3 py-2 border-b border-slate-800/80 flex items-center justify-between bg-[#0F1523]/90">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
              {label || 'Select Option'}
            </span>
            <span className="text-[10px] font-mono text-indigo-400 tabular-nums">
              {filteredOptions.length} {filteredOptions.length === 1 ? 'option' : 'options'}
            </span>
          </div>

          {/* Optional Search Input inside Dropdown Menu */}
          {searchable && (
            <div className="p-2 border-b border-slate-800/80 bg-[#0B0F17]">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder}
                  className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-[#0F1523] border border-slate-800 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          )}

          {/* Scrollable Options List */}
          <div className="max-h-64 overflow-y-auto p-1.5 space-y-0.5">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-slate-500 font-mono">
                No matching options
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onChange(opt.value);
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-600/20 text-white border border-indigo-500/40'
                        : 'text-slate-300 hover:bg-slate-800/70 hover:text-white border border-transparent'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {opt.accentDotColor && (
                          <span
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${opt.accentDotColor}`}
                          />
                        )}
                        <span
                          className={`text-xs truncate ${
                            isSelected ? 'font-semibold text-white' : 'font-medium'
                          }`}
                        >
                          {opt.label}
                        </span>
                      </div>
                      {opt.description && (
                        <div className="text-[11px] text-slate-400 truncate mt-0.5">
                          {opt.description}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {opt.badge !== undefined && (
                        <span
                          className={`text-[11px] font-mono tabular-nums ${
                            isSelected ? 'text-indigo-300' : 'text-slate-500'
                          }`}
                        >
                          {opt.badge}
                        </span>
                      )}
                      {isSelected && (
                        <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
