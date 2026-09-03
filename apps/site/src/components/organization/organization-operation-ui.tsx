"use client";

import * as React from 'react';
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Loader2, Star, X } from 'lucide-react';

import { Button as BaseButton } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

type Spacing = number | string;

const spacingClass = (value: Spacing | undefined, prefix: 'gap' | 'p' | 'm' | 'px' | 'py' | 'mt' | 'mb'): string => {
  if (value === undefined) return '';
  const key = String(value);
  const scale: Record<string, string> = { '0': '0', xs: '2', sm: '3', md: '4', lg: '6', xl: '8', '1': '1', '2': '2', '4': '4', '6': '6', '8': '8' };
  const resolved = scale[key];
  return resolved ? `${prefix}-${resolved}` : '';
};

const textColorClass = (color?: string): string => {
  if (!color) return '';
  if (color === 'dimmed' || color === 'gray') return 'text-muted-foreground';
  if (color === 'red') return 'text-destructive';
  if (color === 'blue') return 'text-blue-700 dark:text-blue-300';
  if (color === 'green' || color === 'teal') return 'text-emerald-700 dark:text-emerald-300';
  if (color === 'yellow' || color === 'orange') return 'text-amber-700 dark:text-amber-300';
  return '';
};

type LayoutProps = React.HTMLAttributes<HTMLDivElement> & {
  gap?: Spacing;
  justify?: 'center' | 'flex-end' | 'space-between' | 'space-around' | 'flex-start';
  align?: 'center' | 'flex-start' | 'flex-end' | 'end' | 'stretch' | 'baseline';
  wrap?: 'wrap' | 'nowrap' | 'wrap-reverse';
  grow?: boolean;
  p?: Spacing;
  px?: Spacing;
  py?: Spacing;
  mt?: Spacing;
  mb?: Spacing;
  c?: string;
  h?: number | string;
  miw?: number | string;
  maw?: number | string;
  w?: number | string;
};

const layoutClasses = (props: LayoutProps): string => cn(
  spacingClass(props.gap, 'gap'), spacingClass(props.p, 'p'), spacingClass(props.px, 'px'), spacingClass(props.py, 'py'),
  spacingClass(props.mt, 'mt'), spacingClass(props.mb, 'mb'),
  props.justify === 'center' && 'justify-center', props.justify === 'flex-end' && 'justify-end', props.justify === 'space-between' && 'justify-between', props.justify === 'space-around' && 'justify-around', props.justify === 'flex-start' && 'justify-start',
  props.align === 'center' && 'items-center', props.align === 'flex-start' && 'items-start', props.align === 'flex-end' && 'items-end', props.align === 'end' && 'items-end', props.align === 'stretch' && 'items-stretch', props.align === 'baseline' && 'items-baseline',
  props.wrap === 'wrap' && 'flex-wrap', props.wrap === 'nowrap' && 'flex-nowrap', props.wrap === 'wrap-reverse' && 'flex-wrap-reverse', props.grow && '[&>*]:flex-1', textColorClass(props.c),
);

const layoutStyle = (props: LayoutProps): React.CSSProperties => ({ height: props.h, minWidth: props.miw, maxWidth: props.maw, width: props.w, ...props.style });

export const Group = React.forwardRef<HTMLDivElement, LayoutProps>(function Group(props, ref) {
  const { className, children, gap, justify, align, wrap, grow, p, px, py, mt, mb, c, h, miw, maw, w, style, ...rest } = props;
  const layoutProps = { gap, justify, align, wrap, grow, p, px, py, mt, mb, c, h, miw, maw, w, style };
  return <div ref={ref} className={cn('flex min-w-0', layoutClasses(layoutProps), className)} style={layoutStyle(layoutProps)} {...rest}>{children}</div>;
});

export const Stack = React.forwardRef<HTMLDivElement, LayoutProps>(function Stack(props, ref) {
  const { className, children, gap, justify, align, wrap, grow, p, px, py, mt, mb, c, h, miw, maw, w, style, ...rest } = props;
  const layoutProps = { gap, justify, align, wrap, grow, p, px, py, mt, mb, c, h, miw, maw, w, style };
  return <div ref={ref} className={cn('flex min-w-0 flex-col', layoutClasses(layoutProps), className)} style={layoutStyle(layoutProps)} {...rest}>{children}</div>;
});

type SimpleGridProps = React.HTMLAttributes<HTMLDivElement> & { cols?: number | { base?: number; sm?: number; md?: number; lg?: number; xl?: number }; spacing?: Spacing; mb?: Spacing; mt?: Spacing; p?: Spacing; py?: Spacing };
const gridColumnClass = (value: number | undefined): string => value ? `grid-cols-${value}` : '';
export function SimpleGrid({ className, cols = 1, spacing = 'md', mb, mt, p, py, ...props }: SimpleGridProps) {
  const classes = typeof cols === 'number'
    ? gridColumnClass(cols)
    : cn(gridColumnClass(cols.base ?? 1), cols.sm && `sm:${gridColumnClass(cols.sm)}`, cols.md && `md:${gridColumnClass(cols.md)}`, cols.lg && `lg:${gridColumnClass(cols.lg)}`, cols.xl && `xl:${gridColumnClass(cols.xl)}`);
  return <div className={cn('grid min-w-0', classes, spacingClass(spacing, 'gap'), spacingClass(mb, 'mb'), spacingClass(mt, 'mt'), spacingClass(p, 'p'), spacingClass(py, 'py'), className)} {...props} />;
}

type TextProps = React.HTMLAttributes<HTMLElement> & { component?: React.ElementType; size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'; c?: string; fw?: number | string; tt?: string; truncate?: boolean | string; lineClamp?: number; mb?: Spacing; mt?: Spacing; p?: Spacing; py?: Spacing; fz?: string | number; lh?: string | number; ta?: string; w?: string | number; span?: boolean };
export function Text({ component: Component = 'p', size = 'md', c, fw, tt, truncate, lineClamp, mb, mt, p, py, fz, lh, ta, w, span, className, style, ...props }: TextProps) {
  const Tag = span ? 'span' : Component;
  return <Tag className={cn(size === 'xs' ? 'text-xs' : size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-lg' : size === 'xl' ? 'text-xl' : 'text-base', textColorClass(c), fw && `font-${fw}`, tt === 'uppercase' && 'uppercase', truncate && 'truncate', lineClamp && `line-clamp-${lineClamp}`, spacingClass(mb, 'mb'), spacingClass(mt, 'mt'), spacingClass(p, 'p'), spacingClass(py, 'py'), ta && `text-${ta}`, className)} style={{ fontSize: fz, lineHeight: lh, width: w, ...style }} {...props} />;
}

type TitleProps = TextProps & { order?: 1 | 2 | 3 | 4 | 5 | 6 };
export function Title({ order = 2, size, className, ...props }: TitleProps) {
  const Component = `h${order}` as React.ElementType;
  return <Text component={Component} size={size ?? (order <= 2 ? 'xl' : 'lg')} fw={600} className={cn('tracking-tight text-foreground', className)} {...props} />;
}

type PaperProps = React.HTMLAttributes<HTMLDivElement> & { withBorder?: boolean; radius?: string | number; p?: Spacing; mb?: Spacing; mt?: Spacing; shadow?: string; component?: React.ElementType; ta?: string; h?: number | string };
export function Paper({ withBorder, radius: _radius, p, mb, mt, shadow, component: Component = 'div', ta, h, className, style, ...props }: PaperProps) {
  return <Component className={cn('min-w-0 max-w-full bg-card text-card-foreground', withBorder && 'border border-border', spacingClass(p, 'p'), spacingClass(mb, 'mb'), spacingClass(mt, 'mt'), shadow === 'xs' && 'shadow-sm', shadow === 'sm' && 'shadow-md', ta && `text-${ta}`, className)} style={{ height: h, ...style }} {...props} />;
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string; color?: string; loading?: boolean; fullWidth?: boolean; leftSection?: React.ReactNode; rightSection?: React.ReactNode; justify?: string; compact?: string; radius?: string | number; component?: React.ElementType; href?: string; target?: string; rel?: string; nativeButton?: boolean; mt?: Spacing | { base?: Spacing; md?: Spacing }; mb?: Spacing | { base?: Spacing; md?: Spacing }; px?: Spacing; w?: number | string };
export function Button({ className, variant = 'filled', size = 'md', color, loading, fullWidth, leftSection, rightSection, justify, compact, radius: _radius, component, href, target, rel, nativeButton: _nativeButton, mt, mb, px, w, children, disabled, style, ...props }: ButtonProps) {
  const mappedVariant = color === 'red' || variant === 'danger' ? 'destructive' : variant === 'light' ? 'secondary' : variant === 'subtle' ? 'ghost' : variant === 'outline' ? 'outline' : variant === 'link' ? 'link' : 'default';
  const mappedSize = compact === 'xs' || size === 'xs' || size === 'compact-xs' ? 'xs' : compact === 'sm' || size === 'sm' || size === 'compact-sm' ? 'sm' : size === 'lg' ? 'lg' : size === 'icon' ? 'icon' : 'default';
  const content = <>{loading && <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />}{leftSection}{children}{rightSection}</>;
  const buttonProps = { ...props, target, rel, disabled: disabled || loading, 'aria-busy': loading || undefined, className: cn(fullWidth && 'w-full', justify === 'flex-start' && 'justify-start', spacingClass(px, 'px'), typeof mt !== 'object' && spacingClass(mt, 'mt'), typeof mb !== 'object' && spacingClass(mb, 'mb'), className), style: { width: w, ...style } } as any;
  if (component === 'a') {
    return <BaseButton nativeButton={false} render={<a href={href} />} variant={mappedVariant as any} size={mappedSize as any} {...buttonProps}>{content}</BaseButton>;
  }
  return <BaseButton variant={mappedVariant as any} size={mappedSize as any} {...buttonProps}>{content}</BaseButton>;
}

type FieldProps = { id?: string; label?: React.ReactNode; description?: React.ReactNode; error?: React.ReactNode; required?: boolean; mb?: Spacing; mt?: Spacing; p?: Spacing };
const useFieldId = (id: string | undefined, label: React.ReactNode): string => {
  const generatedId = React.useId();
  if (id) return id;
  const labelPart = typeof label === 'string' ? label.toLowerCase().replace(/[^a-z0-9]+/g, '-') : 'field';
  return `organization-field-${labelPart}-${generatedId.replace(/[^a-z0-9]+/gi, '')}`;
};
function FieldFrame({ id, label, description, error, required, mb, mt, p, className, children }: FieldProps & { className?: string; children: React.ReactNode }) {
  return <div className={cn('min-w-0 space-y-1.5', spacingClass(mb, 'mb'), spacingClass(mt, 'mt'), spacingClass(p, 'p'), className)}>{label && <label htmlFor={id} className="block text-sm font-medium text-foreground">{label}{required && <span aria-hidden="true"> *</span>}</label>}{children}{description && <p className="text-xs text-muted-foreground">{description}</p>}{error && <p role="alert" className="text-xs text-destructive">{error}</p>}</div>;
}

const stableChangeEvent = <T extends HTMLInputElement | HTMLTextAreaElement>(event: React.ChangeEvent<T>): React.ChangeEvent<T> => {
  const currentTarget = event.currentTarget;
  return new Proxy(event, { get(target, property, receiver) { return property === 'currentTarget' ? currentTarget : Reflect.get(target, property, receiver); } });
};

type TextInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> & FieldProps & { size?: string; variant?: string; radius?: string | number; leftSection?: React.ReactNode; rightSection?: React.ReactNode; leftSectionWidth?: number; rightSectionWidth?: number };
export const TextInput = React.forwardRef<HTMLInputElement, TextInputProps>(function TextInput({ id, label, description, error, required, mb, mt, p, size: _size, variant: _variant, radius: _radius, leftSection, rightSection, leftSectionWidth, rightSectionWidth, className, onChange, ...props }, ref) {
  const resolvedId = useFieldId(id, label);
  return <FieldFrame id={resolvedId} label={label} description={description} error={error} required={required} mb={mb} mt={mt} p={p}><div className="relative"><input ref={ref} id={resolvedId} required={required} aria-invalid={Boolean(error) || undefined} className={cn('h-11 min-h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 md:text-sm', leftSection && 'pl-9', rightSection && 'pr-9', className)} {...props} onChange={(event) => onChange?.(stableChangeEvent(event))} />{leftSection && <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2" style={{ width: leftSectionWidth }}>{leftSection}</span>}{rightSection && <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2" style={{ width: rightSectionWidth }}>{rightSection}</span>}</div></FieldFrame>;
});

export function PasswordInput(props: TextInputProps) { return <TextInput {...props} type="password" />; }

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps & { minRows?: number; maxRows?: number; autosize?: boolean; size?: string };
export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ id, label, description, error, required, mb, mt, p, minRows = 3, maxRows: _maxRows, autosize: _autosize, size: _size, className, onChange, ...props }, ref) {
  const resolvedId = useFieldId(id, label);
  return <FieldFrame id={resolvedId} label={label} description={description} error={error} required={required} mb={mb} mt={mt} p={p}><textarea ref={ref} id={resolvedId} required={required} rows={minRows} aria-invalid={Boolean(error) || undefined} className={cn('min-h-24 w-full min-w-0 resize-y rounded-lg border border-input bg-background px-3 py-2.5 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 md:text-sm', className)} {...props} onChange={(event) => onChange?.(stableChangeEvent(event))} /></FieldFrame>;
});

type NumberInputProps = Omit<TextInputProps, 'type' | 'onChange'> & { value?: number | string; onChange?: (value: number | string) => void; decimalScale?: number; fixedDecimalScale?: boolean; prefix?: string; suffix?: string; min?: number; max?: number; step?: number; w?: number | string };
export function NumberInput({ value, onChange, prefix, suffix, decimalScale: _decimalScale, fixedDecimalScale: _fixedDecimalScale, w, ...props }: NumberInputProps) { return <TextInput {...props} type="number" value={value ?? ''} min={props.min} max={props.max} step={props.step} leftSection={prefix} rightSection={suffix} style={{ width: w, ...props.style }} onChange={(event) => { const raw = event.currentTarget.value; onChange?.(raw === '' ? '' : Number(raw)); }} />; }

type SelectOption = string | { label: React.ReactNode; value: string; disabled?: boolean };
const normalizeSelectOption = (option: SelectOption) => typeof option === 'string' ? { label: option, value: option, disabled: false } : option;
const selectOptionLabel = (option: SelectOption): string => { const normalized = normalizeSelectOption(option); return typeof normalized.label === 'string' || typeof normalized.label === 'number' ? String(normalized.label) : ''; };
const useDismissibleLayer = (open: boolean, onClose: () => void) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, open]);
  return containerRef;
};
type SelectProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'size'> & FieldProps & { data?: ReadonlyArray<SelectOption>; value?: string | null; onChange?: (value: string | null) => void; placeholder?: string; allowDeselect?: boolean; clearable?: boolean; searchable?: boolean; nothingFoundMessage?: string; size?: string; rightSection?: React.ReactNode; rightSectionWidth?: number; rightSectionPointerEvents?: string; searchValue?: string; onSearchChange?: (value: string) => void };
export function Select({ data = [], value, onChange, id, label, description, error, required, mb, mt, p, placeholder, allowDeselect, clearable: _clearable, searchable: _searchable, nothingFoundMessage: _nothingFoundMessage, size: _size, rightSection, rightSectionWidth, rightSectionPointerEvents, searchValue: _searchValue, onSearchChange, className, ...props }: SelectProps) {
  const resolvedId = useFieldId(id, label);
  const listboxId = React.useId();
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const containerRef = useDismissibleLayer(open, () => setOpen(false));
  const selectedOption = data.find((option) => normalizeSelectOption(option).value === value);
  const selectedLabel = selectedOption ? selectOptionLabel(selectedOption) : '';
  const visibleOptions = data.filter((option) => !search || selectOptionLabel(option).toLowerCase().includes(search.toLowerCase()));
  return <FieldFrame id={resolvedId} label={label} description={description} error={error} required={required} mb={mb} mt={mt} p={p}><div ref={containerRef} className="relative"><input {...props} id={resolvedId} role="combobox" aria-expanded={open} aria-controls={listboxId} value={search || selectedLabel} placeholder={placeholder} required={required} aria-invalid={Boolean(error) || undefined} onFocus={() => setOpen(true)} onClick={() => setOpen(true)} onChange={(event) => { setSearch(event.currentTarget.value); onSearchChange?.(event.currentTarget.value); }} className={cn('h-11 min-h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 pr-10 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 md:text-sm', className)} /><span aria-hidden={rightSection ? undefined : true} className={cn('absolute top-1/2 right-3 flex -translate-y-1/2 items-center justify-center text-muted-foreground', rightSectionPointerEvents === 'none' ? 'pointer-events-none' : 'pointer-events-auto')} style={{ width: rightSectionWidth }}>{rightSection ?? <ChevronDown aria-hidden="true" className="size-4" />}</span><div id={listboxId} role="listbox" hidden={!open} className="absolute top-full z-30 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg">{allowDeselect && value && <button type="button" role="option" aria-selected={false} className="block min-h-10 w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => { onChange?.(null); setSearch(''); setOpen(false); }}>Clear selection</button>}{visibleOptions.length ? visibleOptions.map((option) => { const normalized = normalizeSelectOption(option); return <button key={normalized.value} type="button" role="option" aria-selected={normalized.value === value} disabled={normalized.disabled} className="block min-h-10 w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50" onClick={() => { onChange?.(normalized.value); setSearch(''); setOpen(false); }}>{normalized.label}</button>; }) : <p className="px-3 py-2 text-sm text-muted-foreground">No options found.</p>}</div></div></FieldFrame>;
}

type MultiSelectProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'size'> & FieldProps & { data?: ReadonlyArray<SelectOption>; value?: string[]; onChange?: (value: string[]) => void; placeholder?: string; searchable?: boolean; clearable?: boolean; size?: string };
export function MultiSelect({ data = [], value = [], onChange, id, label, description, error, required, mb, mt, p, className, placeholder, searchable: _searchable, clearable: _clearable, size: _size, ...props }: MultiSelectProps) {
  const resolvedId = useFieldId(id, label);
  const listboxId = React.useId();
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const containerRef = useDismissibleLayer(open, () => setOpen(false));
  const selectedLabels = data.filter((option) => value.includes(normalizeSelectOption(option).value)).map(selectOptionLabel).join(', ');
  const visibleOptions = data.filter((option) => !search || selectOptionLabel(option).toLowerCase().includes(search.toLowerCase()));
  return <FieldFrame id={resolvedId} label={label} description={description} error={error} required={required} mb={mb} mt={mt} p={p}><div ref={containerRef} className="relative"><input {...props} id={resolvedId} role="combobox" aria-expanded={open} aria-controls={listboxId} value={search || selectedLabels} placeholder={placeholder} required={required} aria-invalid={Boolean(error) || undefined} onFocus={() => setOpen(true)} onClick={() => setOpen(true)} onChange={(event) => setSearch(event.currentTarget.value)} className={cn('h-11 min-h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 pr-10 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 md:text-sm', className)} /><ChevronDown aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" /><div id={listboxId} role="listbox" aria-multiselectable="true" hidden={!open} className="absolute top-full z-30 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg">{visibleOptions.length ? visibleOptions.map((option) => { const normalized = normalizeSelectOption(option); const selected = value.includes(normalized.value); return <button key={normalized.value} type="button" role="option" aria-selected={selected} disabled={normalized.disabled} className="flex min-h-10 w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50" onClick={() => { onChange?.(selected ? value.filter((entry) => entry !== normalized.value) : [...value, normalized.value]); setSearch(''); }}>{selected && <Check aria-hidden="true" className="size-4" />}{normalized.label}</button>; }) : <p className="px-3 py-2 text-sm text-muted-foreground">No options found.</p>}</div></div></FieldFrame>;
}

type AutocompleteProps = Omit<TextInputProps, 'value' | 'onChange'> & { data?: ReadonlyArray<string>; value?: string; onChange?: (value: string) => void; comboboxProps?: unknown };
export function Autocomplete({ data = [], value, onChange, comboboxProps: _comboboxProps, ...props }: AutocompleteProps) { const listId = React.useId(); return <><TextInput {...props} value={value ?? ''} onChange={(event) => onChange?.(event.currentTarget.value)} list={listId} /><datalist id={listId}>{data.map((option) => <option key={option} value={option} />)}</datalist></>; }

type ColorInputProps = Omit<TextInputProps, 'value' | 'onChange' | 'type'> & { value?: string; onChange?: (value: string) => void; format?: string; swatches?: string[] };
export function ColorInput({ value, onChange, ...props }: ColorInputProps) { return <TextInput {...props} value={value ?? ''} onChange={(event) => onChange?.(event.currentTarget.value)} />; }

type DateControlProps = FieldProps & React.AriaAttributes & { value?: Date | string | null; onChange?: (value: Date | null) => void; minDate?: Date; placeholder?: string; size?: string; clearable?: boolean; valueFormat?: string; highlightToday?: boolean; leftSection?: React.ReactNode; timePickerProps?: unknown; clearButtonProps?: React.ButtonHTMLAttributes<HTMLButtonElement>; popoverProps?: unknown; style?: React.CSSProperties };
const dateInputValue = (value: Date | string | null | undefined, includeTime: boolean): string => { if (!value) return ''; if (typeof value === 'string') return value.slice(0, includeTime ? 16 : 10); const pad = (n: number) => String(n).padStart(2, '0'); const date = `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`; return includeTime ? `${date}T${pad(value.getHours())}:${pad(value.getMinutes())}` : date; };
const parseDateValue = (value: Date | string | null | undefined): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const parsed = match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const startOfDay = (value: Date): number => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
const dateKey = (value: Date): string => `${value.getFullYear()}-${value.getMonth()}-${value.getDate()}`;
const formatDateLabel = (value: Date | null, valueFormat?: string): string => {
  if (!value) return '';
  if (valueFormat === 'MMM D, YYYY') return value.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${String(value.getMonth() + 1).padStart(2, '0')}/${String(value.getDate()).padStart(2, '0')}/${value.getFullYear()}`;
};
const monthDays = (value: Date): Array<Date | null> => {
  const firstDay = new Date(value.getFullYear(), value.getMonth(), 1).getDay();
  const daysInMonth = new Date(value.getFullYear(), value.getMonth() + 1, 0).getDate();
  return [
    ...Array.from({ length: firstDay }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => new Date(value.getFullYear(), value.getMonth(), index + 1)),
  ];
};
function DateControl({ value, onChange, id, label, description, error, required, mb, mt, p, minDate, placeholder = 'mm/dd/yyyy', clearable = false, valueFormat, highlightToday = false, leftSection, timePickerProps: _timePickerProps, clearButtonProps, popoverProps: _popoverProps, style, size: _size, includeTime, ...ariaProps }: DateControlProps & { includeTime?: boolean }) {
  const resolvedId = useFieldId(id, label);
  const selectedDate = parseDateValue(value);
  const [open, setOpen] = React.useState(false);
  const [viewDate, setViewDate] = React.useState(() => selectedDate ?? new Date());
  const containerRef = useDismissibleLayer(open, () => setOpen(false));
  const accessibleName = ariaProps['aria-label'] ?? (typeof label === 'string' ? label : 'Choose date');
  if (includeTime) {
    return <FieldFrame id={resolvedId} label={label} description={description} error={error} required={required} mb={mb} mt={mt} p={p}><input {...ariaProps} id={resolvedId} type="datetime-local" value={dateInputValue(value, true)} min={minDate ? dateInputValue(minDate, true) : undefined} placeholder={placeholder} required={required} aria-invalid={Boolean(error) || undefined} onChange={(event) => onChange?.(event.currentTarget.value ? new Date(event.currentTarget.value) : null)} className="h-11 min-h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-base text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 md:text-sm" style={style} /></FieldFrame>;
  }
  const days = monthDays(viewDate);
  const today = new Date();
  const minimumTime = minDate ? startOfDay(minDate) : null;
  return <FieldFrame id={resolvedId} label={label} description={description} error={error} required={required} mb={mb} mt={mt} p={p}><div ref={containerRef} className="relative"><button {...ariaProps} id={resolvedId} type="button" aria-haspopup="dialog" aria-expanded={open} aria-label={accessibleName} onClick={() => setOpen((current) => !current)} className="flex h-11 min-h-11 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 py-2 text-left text-base text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 md:text-sm" style={style}><span className={selectedDate ? '' : 'text-muted-foreground'}>{formatDateLabel(selectedDate, valueFormat) || placeholder}</span><span className="flex items-center gap-1 text-muted-foreground">{leftSection ?? <CalendarDays aria-hidden="true" className="size-4" />}</span></button>{clearable && selectedDate && <button {...clearButtonProps} type="button" aria-label="Clear date" onClick={() => { onChange?.(null); setOpen(false); }} className="absolute top-1/2 right-9 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted"><X aria-hidden="true" className="size-4" /></button>}{open && <div role="dialog" aria-label={accessibleName} className="absolute top-full left-0 z-40 mt-2 w-72 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-xl"><div className="flex items-center justify-between gap-2"><button type="button" aria-label="Previous month" onClick={() => setViewDate((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))} className="flex size-10 items-center justify-center rounded-md hover:bg-muted"><ChevronLeft aria-hidden="true" className="size-4" /></button><Text component="span" fw={600} className="text-sm">{viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Text><button type="button" aria-label="Next month" onClick={() => setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))} className="flex size-10 items-center justify-center rounded-md hover:bg-muted"><ChevronRight aria-hidden="true" className="size-4" /></button></div><div className="mt-3 grid grid-cols-7 text-center text-xs font-semibold text-muted-foreground">{['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => <span key={day} className="py-1">{day}</span>)}</div><div className="grid grid-cols-7 gap-1">{days.map((day, index) => { if (!day) return <span key={`blank-${index}`} aria-hidden="true" />; const disabled = minimumTime !== null && startOfDay(day) < minimumTime; const selected = selectedDate !== null && dateKey(day) === dateKey(selectedDate); const isToday = dateKey(day) === dateKey(today); const dateLabel = day.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }); return <button key={day.toISOString()} type="button" aria-pressed={selected} aria-current={isToday ? 'date' : undefined} aria-label={dateLabel} disabled={disabled} onClick={() => { onChange?.(day); setOpen(false); }} className={cn('flex min-h-10 items-center justify-center rounded-md text-sm transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-35', selected && 'bg-primary text-primary-foreground hover:bg-primary', highlightToday && isToday && !selected && 'ring-1 ring-primary')}>{day.getDate()}</button>; })}</div><div className="mt-2 flex items-center justify-between border-t border-border pt-2"><button type="button" className="min-h-10 rounded-md px-2 text-sm text-primary hover:bg-muted" onClick={() => { onChange?.(null); setOpen(false); }}>Clear</button><button type="button" className="min-h-10 rounded-md px-2 text-sm text-primary hover:bg-muted" onClick={() => { onChange?.(new Date()); setOpen(false); }}>Today</button></div></div>}</div></FieldFrame>;
}
export function DatePickerInput(props: DateControlProps) { return <DateControl {...props} includeTime={false} />; }
export function DateTimePicker(props: DateControlProps) { return <DateControl {...props} includeTime />; }

type FileInputProps = FieldProps & { value?: File | null; onChange?: (value: File | null) => void; placeholder?: string; accept?: string; clearable?: boolean; className?: string };
export function FileInput({ value: _value, onChange, id, label, description, error, required, mb, mt, p, placeholder, accept, className }: FileInputProps) { const resolvedId = useFieldId(id, label); return <FieldFrame id={resolvedId} label={label} description={description} error={error} required={required} mb={mb} mt={mt} p={p}><input id={resolvedId} type="file" accept={accept} required={required} aria-label={typeof label === 'string' ? label : placeholder} onChange={(event) => onChange?.(event.currentTarget.files?.[0] ?? null)} className={cn('block min-h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5', className)} /></FieldFrame>; }

type SwitchProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & FieldProps & { checked?: boolean; onChange?: React.ChangeEventHandler<HTMLInputElement> };
export function Switch({ id, label, description, mb, mt, p, checked, onChange, disabled, className, ...props }: SwitchProps) { const resolvedId = useFieldId(id, label); return <label htmlFor={resolvedId} className={cn('flex min-h-11 items-start gap-3 rounded-lg border border-transparent py-2 text-sm', spacingClass(mb, 'mb'), spacingClass(mt, 'mt'), spacingClass(p, 'p'), disabled && 'cursor-not-allowed opacity-60', className)}><input {...props} id={resolvedId} type="checkbox" aria-label={typeof label === 'string' ? label : undefined} checked={checked} onChange={onChange} disabled={disabled} className="mt-1 size-4 accent-primary" /><span className="min-w-0"><span className="block font-medium text-foreground">{label}</span>{description && <span className="mt-1 block text-xs text-muted-foreground">{description}</span>}</span></label>; }

type CheckboxProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & { label?: React.ReactNode; description?: React.ReactNode; onCheckedChange?: (checked: boolean) => void };
export function Checkbox({ label, description, onChange, onCheckedChange, className, checked, ...props }: CheckboxProps) { const accessibleLabel = props['aria-label'] ?? (typeof label === 'string' ? label : undefined); const input = <input {...props} type="checkbox" aria-label={accessibleLabel} checked={checked} onChange={(event) => { onChange?.(event); onCheckedChange?.(event.currentTarget.checked); }} className={cn('size-4 shrink-0 accent-primary', className)} />; return label ? <label className="flex min-h-11 items-start gap-3 text-sm"><span className="pt-1">{input}</span><span><span className="block font-medium">{label}</span>{description && <span className="mt-1 block text-xs text-muted-foreground">{description}</span>}</span></label> : input; }

type ChipProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> & { checked?: boolean; onChange?: (checked: boolean) => void; radius?: string };
export function Chip({ checked = false, onChange, className, children, radius: _radius, ...props }: ChipProps) { return <button {...props} type="button" aria-pressed={checked} onClick={() => onChange?.(!checked)} className={cn('min-h-11 rounded-full border px-3 py-2 text-sm font-medium', checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-foreground hover:bg-muted', className)}>{children}</button>; }

type SegmentedControlProps = { value: string; onChange: (value: string) => void; data: Array<{ label: React.ReactNode; value: string }>; className?: string; fullWidth?: boolean };
export function SegmentedControl({ value, onChange, data, className, fullWidth }: SegmentedControlProps) { return <div className={cn('inline-flex max-w-full flex-wrap gap-1 rounded-lg bg-muted p-1', fullWidth && 'w-full', className)} role="group">{data.map((item) => <button type="button" key={item.value} aria-pressed={item.value === value} onClick={() => onChange(item.value)} className={cn('min-h-11 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground', fullWidth && 'flex-1', item.value === value && 'bg-background text-foreground shadow-sm')}>{item.label}</button>)}</div>; }

type ModalProps = { opened: boolean; onClose: () => void; title?: React.ReactNode; children?: React.ReactNode; centered?: boolean; size?: string; styles?: { content?: React.CSSProperties; body?: React.CSSProperties }; withCloseButton?: boolean };
export function Modal({ opened, onClose, title, children, size, styles, withCloseButton = true }: ModalProps) { return <Dialog open={opened} onOpenChange={(next) => { if (!next) onClose(); }}><DialogContent showCloseButton={withCloseButton} style={styles?.content} className={cn(size === 'xl' && 'max-w-4xl', size === 'lg' && 'max-w-2xl', size === 'sm' && 'max-w-sm')}><DialogHeader>{title && <DialogTitle>{title}</DialogTitle>}</DialogHeader><div style={styles?.body}>{children}</div></DialogContent></Dialog>; }

type ConfirmDialogProps = { opened?: boolean; open?: boolean; onClose?: () => void; onCancel?: () => void; onConfirm: () => void; title: React.ReactNode; children?: React.ReactNode; message?: React.ReactNode; confirmLabel?: string; cancelLabel?: string; confirming?: boolean; confirmColor?: string; destructive?: boolean };
export function ConfirmDialog({ opened, open, onClose, onCancel, onConfirm, title, children, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', confirming, confirmColor, destructive }: ConfirmDialogProps) { const visible = opened ?? open ?? false; const close = onClose ?? onCancel ?? (() => undefined); return <Modal opened={visible} onClose={close} title={title}><Stack gap="md"><Text>{children ?? message}</Text><Group justify="flex-end" gap="sm"><Button variant="outline" onClick={close}>{cancelLabel}</Button><Button color={destructive ? 'red' : confirmColor} loading={confirming} onClick={onConfirm}>{confirmLabel}</Button></Group></Stack></Modal>; }

type ScrollAreaProps = React.HTMLAttributes<HTMLDivElement> & { mah?: number | string; type?: string; scrollHideDelay?: number; offsetScrollbars?: boolean };
function ScrollAreaBase({ className, mah, style, scrollHideDelay: _scrollHideDelay, offsetScrollbars: _offsetScrollbars, ...props }: ScrollAreaProps) { return <div className={cn('min-w-0 overflow-auto', className)} style={{ ...style, maxHeight: mah }} {...props} />; }
export const ScrollArea = Object.assign(ScrollAreaBase, { Autosize: ScrollAreaBase });

type LoaderProps = React.SVGAttributes<SVGSVGElement> & { size?: 'xs' | 'sm' | 'md' | 'lg' | number };
export function Loader({ size = 'md', className, ...props }: LoaderProps) { const sizeClass = size === 'xs' ? 'size-3' : size === 'sm' ? 'size-4' : size === 'lg' ? 'size-7' : 'size-5'; return <Loader2 role="status" aria-label="Loading" className={cn(sizeClass, 'animate-spin motion-reduce:animate-none', className)} {...props} />; }

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & { size?: string; variant?: string; color?: string; radius?: string };
export function Badge({ size = 'md', variant: _variant, color, radius: _radius, className, ...props }: BadgeProps) { const colorClass = color === 'red' ? 'border-destructive/30 bg-destructive/10 text-destructive' : color === 'blue' ? 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200' : color === 'green' || color === 'teal' ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-200 dark:text-emerald-200' : color === 'orange' || color === 'yellow' ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200' : 'border-border bg-muted text-muted-foreground'; return <span className={cn('inline-flex w-fit items-center rounded-full border font-medium', size === 'xs' ? 'px-1.5 py-0.5 text-[0.68rem]' : size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm', colorClass, className)} {...props} />; }

type AvatarProps = React.HTMLAttributes<HTMLDivElement> & { src?: string | null; alt?: string; name?: string; size?: string | number; radius?: string };
export function Avatar({ src, alt, name, size = 'md', className, ...props }: AvatarProps) { const initials = name?.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase(); return <div className={cn('inline-flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-sm font-semibold text-muted-foreground', size === 'sm' && 'size-8 text-xs', size === 'lg' && 'size-14', className)} {...props}>{src ? <img src={src} alt={alt ?? name ?? ''} className="size-full object-cover" /> : initials}</div>; }

type AlertProps = React.HTMLAttributes<HTMLDivElement> & { title?: React.ReactNode; color?: string; icon?: React.ReactNode; withCloseButton?: boolean; onClose?: () => void; radius?: string; variant?: string; mb?: Spacing; mt?: Spacing; p?: Spacing };
export function Alert({ title, color, icon, withCloseButton, onClose, radius: _radius, variant: _variant, mb, mt, p, className, children, ...props }: AlertProps) { const tone = color === 'red' ? 'border-destructive/30 bg-destructive/10 text-destructive' : color === 'yellow' || color === 'orange' ? 'border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100' : color === 'blue' ? 'border-blue-300 bg-blue-50 text-blue-900 dark:bg-blue-950 dark:text-blue-100' : color === 'green' || color === 'teal' ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100' : 'border-border bg-muted text-foreground'; return <div role="alert" className={cn('relative flex gap-3 rounded-lg border text-sm', spacingClass(p, 'p') || 'p-3', spacingClass(mb, 'mb'), spacingClass(mt, 'mt'), tone, className)} {...props}>{icon && <span className="mt-0.5 shrink-0">{icon}</span>}<div className="min-w-0 flex-1">{title && <p className="mb-1 font-semibold">{title}</p>}<div>{children}</div></div>{withCloseButton && onClose && <button type="button" aria-label="Dismiss" onClick={onClose} className="min-h-8 min-w-8 rounded-md p-1 hover:bg-black/10"><X aria-hidden="true" className="size-4" /></button>}</div>; }

type ActionIconProps = Omit<ButtonProps, 'children' | 'fullWidth'> & { children?: React.ReactNode };
export function ActionIcon({ className, children, ...props }: ActionIconProps) { return <Button {...props} size={props.size ?? 'icon-sm'} className={cn('shrink-0', className)}>{children}</Button>; }
export function Tooltip({ label, children }: { label: React.ReactNode; children: React.ReactNode }) { return <span title={typeof label === 'string' ? label : undefined}>{children}</span>; }
export function Divider({ className, mt, mb, ...props }: React.HTMLAttributes<HTMLHRElement> & { mt?: Spacing; mb?: Spacing }) { return <hr className={cn('border-0 border-t border-border', spacingClass(mt, 'mt'), spacingClass(mb, 'mb'), className)} {...props} />; }
export function Progress({ value = 0, className, ...props }: React.HTMLAttributes<HTMLDivElement> & { value?: number; color?: string; size?: string | number }) { return <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)} {...props}><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>; }
export function Rating({ value = 0, onChange, readOnly = false, size = 'md', className }: { value?: number; onChange?: (value: number) => void; readOnly?: boolean; size?: string; fractions?: number; className?: string }) { const sizeClass = size === 'xs' ? 'size-3' : size === 'sm' ? 'size-4' : size === 'lg' ? 'size-7' : 'size-5'; return <div className={cn('inline-flex items-center gap-0.5', className)} aria-label={`${value} out of 5 stars`} role={readOnly ? 'img' : 'radiogroup'}>{[1, 2, 3, 4, 5].map((star) => { const icon = <Star aria-hidden="true" className={cn(sizeClass, star <= value ? 'fill-amber-400 text-amber-500' : 'text-muted-foreground/40')} />; return readOnly ? <span key={star}>{icon}</span> : <button key={star} type="button" role="radio" aria-checked={star === value} aria-label={`${star} star${star === 1 ? '' : 's'}`} onClick={() => onChange?.(star)}>{icon}</button>; })}</div>; }

type PopoverState = { open: boolean; setOpen: React.Dispatch<React.SetStateAction<boolean>> };
const PopoverContext = React.createContext<PopoverState | null>(null);
type PopoverProps = { children: React.ReactNode; width?: number | string; position?: string; shadow?: string; withArrow?: boolean; withinPortal?: boolean };
function PopoverRoot({ children, width: _width, position: _position, shadow: _shadow, withArrow: _withArrow, withinPortal: _withinPortal }: PopoverProps) { const [open, setOpen] = React.useState(false); return <PopoverContext.Provider value={{ open, setOpen }}><div className="relative inline-block">{children}</div></PopoverContext.Provider>; }
function PopoverTarget({ children }: { children: React.ReactElement }) { const context = React.useContext(PopoverContext); const childProps = children.props as { onClick?: (event: React.MouseEvent) => void }; return React.cloneElement(children, { onClick: (event: React.MouseEvent) => { childProps.onClick?.(event); context?.setOpen((current) => !current); } } as Partial<typeof children.props>); }
function PopoverDropdown({ children }: { children: React.ReactNode }) { const context = React.useContext(PopoverContext); return context?.open ? <div className="absolute top-full left-0 z-40 mt-1 min-w-60 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg">{children}</div> : null; }
export const Popover = Object.assign(PopoverRoot, { Target: PopoverTarget, Dropdown: PopoverDropdown });

export function Collapse({ in: visible, children }: { in: boolean; children?: React.ReactNode }) { return visible ? <div>{children}</div> : null; }

type TableCellProps = React.TdHTMLAttributes<HTMLTableCellElement> & { ta?: string; fw?: number | string; c?: string };
function TableCell({ ta, fw, c, className, ...props }: TableCellProps) { return <td className={cn('px-3 py-2 align-top text-sm', ta && `text-${ta}`, fw && `font-${fw}`, textColorClass(c), className)} {...props} />; }
function TableHeaderCell({ ta, fw, c, className, ...props }: TableCellProps) { return <th className={cn('px-3 py-2 text-left align-top text-sm font-semibold', ta && `text-${ta}`, fw && `font-${fw}`, textColorClass(c), className)} {...props} />; }
function TableBase({ className, striped, highlightOnHover, withTableBorder: _withTableBorder, withColumnBorders: _withColumnBorders, verticalSpacing: _verticalSpacing, horizontalSpacing: _horizontalSpacing, miw, layout, ...props }: React.TableHTMLAttributes<HTMLTableElement> & { striped?: boolean; highlightOnHover?: boolean; withTableBorder?: boolean; withColumnBorders?: boolean; verticalSpacing?: string; horizontalSpacing?: string; miw?: number | string; layout?: string }) { return <table className={cn('w-full border-collapse', striped && '[&_tbody_tr:nth-child(even)]:bg-muted/40', highlightOnHover && '[&_tbody_tr:hover]:bg-muted/60', className)} style={{ minWidth: miw, tableLayout: layout as React.CSSProperties['tableLayout'] }} {...props} />; }
export const Table = Object.assign(TableBase, { Thead: (props: React.HTMLAttributes<HTMLTableSectionElement>) => <thead {...props} />, Tbody: (props: React.HTMLAttributes<HTMLTableSectionElement>) => <tbody {...props} />, Tr: (props: React.HTMLAttributes<HTMLTableRowElement>) => <tr {...props} />, Td: TableCell, Th: TableHeaderCell, ScrollContainer: ({ children, minWidth: _minWidth, ...props }: React.HTMLAttributes<HTMLDivElement> & { minWidth?: number | string }) => <div className="overflow-x-auto" {...props}>{children}</div> });
