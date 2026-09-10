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

type RadiusValue = string | number | undefined;

const numericRadiusClass = (value: number): string => {
  if (value <= 0) return 'org-radius-none';
  if (value <= 4) return 'org-radius-small';
  if (value <= 8) return 'org-radius-control';
  return 'org-radius-surface';
};

const radiusClasses: Record<string, string> = {
  none: 'org-radius-none', xs: 'org-radius-small', sm: 'org-radius-small',
  xl: 'org-radius-pill', full: 'org-radius-pill',
};

const radiusClass = (value: RadiusValue, fallback: 'surface' | 'control'): string => {
  if (typeof value === 'number') return numericRadiusClass(value);
  return radiusClasses[value ?? ''] ?? `org-radius-${fallback}`;
};

const spacingClasses: Record<string, Record<string, string>> = {
  gap: { '0': 'gap-0', '1': 'gap-px', '2': 'gap-0.5', '4': 'gap-1', '6': 'gap-1.5', '8': 'gap-2', '10': 'gap-2.5', '12': 'gap-3', '16': 'gap-4', '20': 'gap-5', '24': 'gap-6', '32': 'gap-8', 'xs': 'gap-2', 'sm': 'gap-3', 'md': 'gap-4', 'lg': 'gap-6', 'xl': 'gap-8' },
  p: { '0': 'p-0', '1': 'p-px', '2': 'p-0.5', '4': 'p-1', '6': 'p-1.5', '8': 'p-2', '10': 'p-2.5', '12': 'p-3', '16': 'p-4', '20': 'p-5', '24': 'p-6', '32': 'p-8', 'xs': 'p-2', 'sm': 'p-3', 'md': 'p-4', 'lg': 'p-6', 'xl': 'p-8' },
  m: { '0': 'm-0', '1': 'm-px', '2': 'm-0.5', '4': 'm-1', '6': 'm-1.5', '8': 'm-2', '10': 'm-2.5', '12': 'm-3', '16': 'm-4', '20': 'm-5', '24': 'm-6', '32': 'm-8', 'xs': 'm-2', 'sm': 'm-3', 'md': 'm-4', 'lg': 'm-6', 'xl': 'm-8' },
  px: { '0': 'px-0', '1': 'px-px', '2': 'px-0.5', '4': 'px-1', '6': 'px-1.5', '8': 'px-2', '10': 'px-2.5', '12': 'px-3', '16': 'px-4', '20': 'px-5', '24': 'px-6', '32': 'px-8', 'xs': 'px-2', 'sm': 'px-3', 'md': 'px-4', 'lg': 'px-6', 'xl': 'px-8' },
  py: { '0': 'py-0', '1': 'py-px', '2': 'py-0.5', '4': 'py-1', '6': 'py-1.5', '8': 'py-2', '10': 'py-2.5', '12': 'py-3', '16': 'py-4', '20': 'py-5', '24': 'py-6', '32': 'py-8', 'xs': 'py-2', 'sm': 'py-3', 'md': 'py-4', 'lg': 'py-6', 'xl': 'py-8' },
  pb: { '0': 'pb-0', '1': 'pb-px', '2': 'pb-0.5', '4': 'pb-1', '6': 'pb-1.5', '8': 'pb-2', '10': 'pb-2.5', '12': 'pb-3', '16': 'pb-4', '20': 'pb-5', '24': 'pb-6', '32': 'pb-8', 'xs': 'pb-2', 'sm': 'pb-3', 'md': 'pb-4', 'lg': 'pb-6', 'xl': 'pb-8' },
  mt: { '0': 'mt-0', '1': 'mt-px', '2': 'mt-0.5', '4': 'mt-1', '6': 'mt-1.5', '8': 'mt-2', '10': 'mt-2.5', '12': 'mt-3', '16': 'mt-4', '20': 'mt-5', '24': 'mt-6', '32': 'mt-8', 'xs': 'mt-2', 'sm': 'mt-3', 'md': 'mt-4', 'lg': 'mt-6', 'xl': 'mt-8' },
  mb: { '0': 'mb-0', '1': 'mb-px', '2': 'mb-0.5', '4': 'mb-1', '6': 'mb-1.5', '8': 'mb-2', '10': 'mb-2.5', '12': 'mb-3', '16': 'mb-4', '20': 'mb-5', '24': 'mb-6', '32': 'mb-8', 'xs': 'mb-2', 'sm': 'mb-3', 'md': 'mb-4', 'lg': 'mb-6', 'xl': 'mb-8' },
};

const spacingClass = (value: Spacing | undefined, prefix: 'gap' | 'p' | 'm' | 'px' | 'py' | 'pb' | 'mt' | 'mb'): string => {
  if (value === undefined) return '';
  return spacingClasses[prefix][String(value)] ?? '';
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

const justifyClasses: Record<string, string> = {
  center: 'justify-center', 'flex-end': 'justify-end', 'space-between': 'justify-between',
  'space-around': 'justify-around', 'flex-start': 'justify-start',
};
const alignClasses: Record<string, string> = {
  center: 'items-center', 'flex-start': 'items-start', 'flex-end': 'items-end',
  end: 'items-end', stretch: 'items-stretch', baseline: 'items-baseline',
};
const wrapClasses: Record<string, string> = {
  wrap: 'flex-wrap', nowrap: 'flex-nowrap', 'wrap-reverse': 'flex-wrap-reverse',
};

const layoutClasses = (props: LayoutProps): string => cn(
  spacingClass(props.gap, 'gap'), spacingClass(props.p, 'p'), spacingClass(props.px, 'px'), spacingClass(props.py, 'py'),
  spacingClass(props.mt, 'mt'), spacingClass(props.mb, 'mb'),
  justifyClasses[props.justify ?? ''], alignClasses[props.align ?? ''],
  wrapClasses[props.wrap ?? ''], props.grow && '[&>*]:flex-1', textColorClass(props.c),
);

const layoutStyle = (props: LayoutProps): React.CSSProperties => ({ height: props.h, minWidth: props.miw, maxWidth: props.maw, width: props.w, ...props.style });

export const Group = React.forwardRef<HTMLDivElement, LayoutProps>(function Group(props, ref) {
  const { className, children, gap = 'md', justify, align = 'center', wrap = 'wrap', grow, p, px, py, mt, mb, c, h, miw, maw, w, style, ...rest } = props;
  const layoutProps = { gap, justify, align, wrap, grow, p, px, py, mt, mb, c, h, miw, maw, w, style };
  return <div ref={ref} className={cn('flex min-w-0', layoutClasses(layoutProps), className)} style={layoutStyle(layoutProps)} {...rest}>{children}</div>;
});

export const Stack = React.forwardRef<HTMLDivElement, LayoutProps>(function Stack(props, ref) {
  const { className, children, gap = 'md', justify, align, wrap, grow, p, px, py, mt, mb, c, h, miw, maw, w, style, ...rest } = props;
  const layoutProps = { gap, justify, align, wrap, grow, p, px, py, mt, mb, c, h, miw, maw, w, style };
  return <div ref={ref} className={cn('flex min-w-0 flex-col', layoutClasses(layoutProps), className)} style={layoutStyle(layoutProps)} {...rest}>{children}</div>;
});

type ContainerProps = React.HTMLAttributes<HTMLDivElement> & { size?: number | string; fluid?: boolean; py?: Spacing };
export function Container({ size = 'lg', fluid = false, py, className, style, ...props }: ContainerProps) {
  const maxWidth = fluid ? undefined : typeof size === 'number' ? size : size === 'xs' ? 480 : size === 'sm' ? 640 : size === 'md' ? 768 : size === 'lg' ? 1024 : size === 'xl' ? 1280 : undefined;
  return <div className={cn('mx-auto w-full min-w-0 px-4 md:px-6', !fluid && 'max-w-7xl', spacingClass(py, 'py'), className)} style={{ maxWidth, ...style }} {...props} />;
}

type SimpleGridProps = React.HTMLAttributes<HTMLDivElement> & { cols?: number | { base?: number; sm?: number; md?: number; lg?: number; xl?: number }; spacing?: Spacing; verticalSpacing?: Spacing; mb?: Spacing; mt?: Spacing; p?: Spacing; py?: Spacing };
const gridColumns: Record<string, Record<number, string>> = {
  "base": {
    "1": "grid-cols-1",
    "2": "grid-cols-2",
    "3": "grid-cols-3",
    "4": "grid-cols-4",
    "5": "grid-cols-5",
    "6": "grid-cols-6"
  },
  "sm": {
    "1": "sm:grid-cols-1",
    "2": "sm:grid-cols-2",
    "3": "sm:grid-cols-3",
    "4": "sm:grid-cols-4",
    "5": "sm:grid-cols-5",
    "6": "sm:grid-cols-6"
  },
  "md": {
    "1": "md:grid-cols-1",
    "2": "md:grid-cols-2",
    "3": "md:grid-cols-3",
    "4": "md:grid-cols-4",
    "5": "md:grid-cols-5",
    "6": "md:grid-cols-6"
  },
  "lg": {
    "1": "lg:grid-cols-1",
    "2": "lg:grid-cols-2",
    "3": "lg:grid-cols-3",
    "4": "lg:grid-cols-4",
    "5": "lg:grid-cols-5",
    "6": "lg:grid-cols-6"
  },
  "xl": {
    "1": "xl:grid-cols-1",
    "2": "xl:grid-cols-2",
    "3": "xl:grid-cols-3",
    "4": "xl:grid-cols-4",
    "5": "xl:grid-cols-5",
    "6": "xl:grid-cols-6"
  }
};
export function SimpleGrid({ className, cols = 1, spacing = 'md', verticalSpacing, mb, mt, p, py, ...props }: SimpleGridProps) {
  const values = typeof cols === 'number' ? { base: cols } : { base: 1, ...cols };
  const classes = Object.entries(values).map(([breakpoint, count]) => gridColumns[breakpoint]?.[count]);
  return <div className={cn('grid min-w-0', classes, spacingClass(spacing, 'gap'), verticalSpacing !== undefined && spacingClass(verticalSpacing, 'gap'), spacingClass(mb, 'mb'), spacingClass(mt, 'mt'), spacingClass(p, 'p'), spacingClass(py, 'py'), className)} {...props} />;
}

type TextProps = React.HTMLAttributes<HTMLElement> & { component?: React.ElementType; size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'; c?: string; fw?: number | string; tt?: string; truncate?: boolean | string; lineClamp?: number; mb?: Spacing; mt?: Spacing; p?: Spacing; py?: Spacing; pb?: Spacing; fz?: string | number; lh?: string | number; ta?: string; w?: string | number; span?: boolean };
const textSizeClasses = { xs: 'text-xs', sm: 'text-sm', md: 'text-base', lg: 'text-lg', xl: 'text-xl' };
export function Text({ component: Component = 'p', size = 'md', c, fw, tt, truncate, lineClamp, mb, mt, p, py, pb, fz, lh, ta, w, span, className, style, ...props }: TextProps) {
  const Tag = span ? 'span' : Component;
  return <Tag className={cn(textSizeClasses[size], textColorClass(c), tt === 'uppercase' && 'uppercase', truncate && 'truncate', lineClamp && `line-clamp-${lineClamp}`, spacingClass(mb, 'mb'), spacingClass(mt, 'mt'), spacingClass(p, 'p'), spacingClass(py, 'py'), spacingClass(pb, 'pb'), className)} style={{ fontSize: fz, fontWeight: fw, textAlign: ta as React.CSSProperties['textAlign'], lineHeight: lh, width: w, ...style }} {...props} />;
}

type TitleProps = TextProps & { order?: 1 | 2 | 3 | 4 | 5 | 6 };
export function Title({ order = 2, size, className, ...props }: TitleProps) {
  const Component = `h${order}` as React.ElementType;
  return <Text component={Component} size={size ?? (order <= 2 ? 'xl' : 'lg')} fw={600} className={cn('tracking-tight text-foreground', className)} {...props} />;
}

type PaperProps = React.HTMLAttributes<HTMLDivElement> & { withBorder?: boolean; radius?: string | number; p?: Spacing; mb?: Spacing; mt?: Spacing; shadow?: string; component?: React.ElementType; ta?: string; h?: number | string; maw?: number | string; bg?: string };
export function Paper({ withBorder, radius, p, mb, mt, shadow, component: Component = 'div', ta, h, maw, bg, className, style, ...props }: PaperProps) {
  const backgroundClass = bg === 'white' ? 'bg-white' : bg === 'gray.0' ? 'bg-muted' : undefined;
  return <Component className={cn('org-paper min-w-0 max-w-full bg-card text-card-foreground', backgroundClass, radiusClass(radius, 'surface'), withBorder && 'border border-border', spacingClass(p, 'p'), spacingClass(mb, 'mb'), spacingClass(mt, 'mt'), shadow === 'xs' && 'shadow-sm', shadow === 'sm' && 'shadow-md', ta && `text-${ta}`, className)} style={{ height: h, maxWidth: maw, ...style }} {...props} />;
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string; color?: string; loading?: boolean; fullWidth?: boolean; leftSection?: React.ReactNode; rightSection?: React.ReactNode; justify?: string; compact?: string; radius?: string | number; component?: React.ElementType; href?: string; target?: string; rel?: string; nativeButton?: boolean; mt?: Spacing | { base?: Spacing; md?: Spacing }; mb?: Spacing | { base?: Spacing; md?: Spacing }; px?: Spacing; w?: number | string };
const buttonVariant = (variant: string, color?: string) => {
  if (color === 'red' || variant === 'danger') return 'destructive';
  const variants: Record<string, 'secondary' | 'ghost' | 'outline' | 'link'> = {
    light: 'secondary', secondary: 'secondary', subtle: 'ghost', ghost: 'ghost',
    outline: 'outline', default: 'outline', link: 'link',
  };
  return variants[variant] ?? 'default';
};

const buttonSize = (size: string, compact?: string) => {
  if (compact === 'xs' || ['xs', 'compact-xs'].includes(size)) return 'xs';
  if (compact === 'sm' || ['sm', 'compact-sm'].includes(size)) return 'sm';
  if (size === 'lg') return 'lg';
  if (size === 'icon') return 'icon';
  return 'default';
};
const buttonMarginClass = (margin: ButtonProps['mt'], direction: 'mt' | 'mb') => {
  return typeof margin === 'object' ? '' : spacingClass(margin, direction);
};

export function Button({ className, variant = 'filled', size = 'md', color, loading, fullWidth, leftSection, rightSection, justify, compact, radius, component, href, target, rel, nativeButton: _nativeButton, mt, mb, px, w, children, disabled, style, ...props }: ButtonProps) {
  const mappedVariant = buttonVariant(variant, color);
  const mappedSize = buttonSize(size, compact);
  const content = <>{loading && <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />}{leftSection}{children}{rightSection}</>;
  const buttonProps = {
    ...props,
    target,
    rel,
    role: component === 'a' ? 'link' : props.role,
    disabled: disabled || loading,
    'aria-busy': loading || undefined,
    className: cn(radiusClass(radius, 'control'), fullWidth && 'w-full', justify === 'flex-start' && 'justify-start', spacingClass(px, 'px'), buttonMarginClass(mt, 'mt'), buttonMarginClass(mb, 'mb'), className),
    style: { width: w, ...style },
  } as unknown as React.ComponentProps<typeof BaseButton>;
  if (component === 'a') {
    return <BaseButton nativeButton={false} render={<a href={href} />} variant={mappedVariant as React.ComponentProps<typeof BaseButton>['variant']} size={mappedSize as React.ComponentProps<typeof BaseButton>['size']} {...buttonProps}>{content}</BaseButton>;
  }
  return <BaseButton variant={mappedVariant as React.ComponentProps<typeof BaseButton>['variant']} size={mappedSize as React.ComponentProps<typeof BaseButton>['size']} {...buttonProps}>{content}</BaseButton>;
}

type FieldProps = { id?: string; label?: React.ReactNode; description?: React.ReactNode; error?: React.ReactNode; errorProps?: React.HTMLAttributes<HTMLParagraphElement>; required?: boolean; mb?: Spacing; mt?: Spacing; p?: Spacing };
const useFieldId = (id: string | undefined, label: React.ReactNode): string => {
  const generatedId = React.useId();
  if (id) return id;
  const labelPart = typeof label === 'string' ? label.toLowerCase().replace(/[^a-z0-9]+/g, '-') : 'field';
  return `organization-field-${labelPart}-${generatedId.replace(/[^a-z0-9]+/gi, '')}`;
};
const fieldMessageIds = (id: string | undefined, description: React.ReactNode, error: React.ReactNode) => {
  const baseId = id ?? 'organization-field';
  const descriptionId = description ? `${baseId}-description` : undefined;
  const errorId = error ? `${baseId}-error` : undefined;
  return {
    descriptionId,
    errorId,
    describedBy: [descriptionId, errorId].filter(Boolean).join(' ') || undefined,
  };
};
function FieldFrame({ id, label, description, error, errorProps, required, mb, mt, p, labelId, descriptionId, errorId, className, style, children }: FieldProps & { labelId?: string; descriptionId?: string; errorId?: string; className?: string; style?: React.CSSProperties; children: React.ReactNode }) {
  const messageIds = fieldMessageIds(id, description, error);
  const resolvedDescriptionId = descriptionId ?? messageIds.descriptionId;
  const resolvedErrorId = errorId ?? messageIds.errorId;
  return <div className={cn('min-w-0 space-y-1.5', spacingClass(mb, 'mb'), spacingClass(mt, 'mt'), spacingClass(p, 'p'), className)} style={style}>
    {label && <label id={labelId} htmlFor={id} className="block text-sm font-medium text-foreground">{label}{required && <span aria-hidden="true"> *</span>}</label>}
    {children}
    {description && <p id={resolvedDescriptionId} className="text-xs text-muted-foreground">{description}</p>}
    {error && <p id={resolvedErrorId} role="alert" className="text-xs text-destructive" {...errorProps}>{error}</p>}
  </div>;
}

const stableChangeEvent = <T extends HTMLInputElement | HTMLTextAreaElement>(event: React.ChangeEvent<T>): React.ChangeEvent<T> => {
  const currentTarget = event.currentTarget;
  return new Proxy(event, { get(target, property, receiver) { return property === 'currentTarget' ? currentTarget : Reflect.get(target, property, receiver); } });
};

type TextInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> & FieldProps & { size?: string; variant?: string; radius?: string | number; leftSection?: React.ReactNode; rightSection?: React.ReactNode; leftSectionWidth?: number; rightSectionWidth?: number; withAsterisk?: boolean; styles?: unknown; w?: number | string; maw?: number | string };
export const TextInput = React.forwardRef<HTMLInputElement, TextInputProps>(function TextInput({ id, label, description, error, errorProps, required, withAsterisk, mb, mt, p, size: _size, variant: _variant, radius, leftSection, rightSection, leftSectionWidth, rightSectionWidth, styles: _styles, w, maw, className, style, onChange, ...props }, ref) {
  const resolvedId = useFieldId(id, label);
  const messageIds = fieldMessageIds(resolvedId, description, error);
  const isRequired = required || withAsterisk;
  return (
    <FieldFrame
      id={resolvedId}
      label={label}
      description={description}
      error={error}
      errorProps={errorProps}
      required={isRequired}
      mb={mb}
      mt={mt}
      p={p}
      className={className}
      style={{ width: w, maxWidth: maw, ...style }}
    >
      <div className="relative">
        <input
          {...props}
          ref={ref}
          id={resolvedId}
          required={isRequired}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={props['aria-describedby'] ?? messageIds.describedBy}
          className={cn('h-11 min-h-11 w-full min-w-0 border border-input bg-background px-3 py-2 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 md:text-sm', radiusClass(radius, 'control'), leftSection && 'pl-9', rightSection && 'pr-9')}
          onChange={(event) => onChange?.(stableChangeEvent(event))}
        />
        {leftSection && <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2" style={{ width: leftSectionWidth }}>{leftSection}</span>}
        {rightSection && <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2" style={{ width: rightSectionWidth }}>{rightSection}</span>}
      </div>
    </FieldFrame>
  );
});

export function PasswordInput(props: TextInputProps) { return <TextInput {...props} type="password" />; }

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps & { minRows?: number; maxRows?: number; autosize?: boolean; size?: string; radius?: string | number };
export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ id, label, description, error, errorProps, required, mb, mt, p, minRows = 3, maxRows: _maxRows, autosize: _autosize, size: _size, radius, className, style, onChange, ...props }, ref) {
  const resolvedId = useFieldId(id, label);
  const messageIds = fieldMessageIds(resolvedId, description, error);
  return (
    <FieldFrame
      id={resolvedId}
      label={label}
      description={description}
      error={error}
      errorProps={errorProps}
      required={required}
      mb={mb}
      mt={mt}
      p={p}
      className={className}
      style={style}
    >
      <textarea
        {...props}
        ref={ref}
        id={resolvedId}
        required={required}
        rows={minRows}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={props['aria-describedby'] ?? messageIds.describedBy}
        className={cn('min-h-24 w-full min-w-0 resize-y border border-input bg-background px-3 py-2.5 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 md:text-sm', radiusClass(radius, 'control'))}
        onChange={(event) => onChange?.(stableChangeEvent(event))}
      />
    </FieldFrame>
  );
});
type NumberInputProps = Omit<TextInputProps, 'type' | 'onChange'> & { value?: number | string; onChange?: (value: number | string) => void; decimalScale?: number; fixedDecimalScale?: boolean; prefix?: string; suffix?: string; min?: number; max?: number; step?: number; w?: number | string; maw?: number | string; styles?: unknown; clampBehavior?: 'strict' | 'blur' | 'none'; allowDecimal?: boolean };
const numberInputDisplayValue = (value: number | string | undefined): string => value == null ? '' : String(value);
const numberInputDraftPattern = /^[+-]?(?:\d+(?:\.\d*)?|\.\d*)?$/;
const clampNumberInputValue = (value: number, min?: number, max?: number): number => Math.min(max ?? value, Math.max(min ?? value, value));
export function NumberInput({ value, onChange, prefix, suffix, decimalScale: _decimalScale, fixedDecimalScale: _fixedDecimalScale, w, maw, styles: _styles, clampBehavior: requestedClampBehavior, allowDecimal: _allowDecimal, ...props }: NumberInputProps) {
  const [inputValue, setInputValue] = React.useState(() => numberInputDisplayValue(value));
  const editingRef = React.useRef(false);
  const lastAcceptedValueRef = React.useRef(inputValue);
  const clampBehavior = requestedClampBehavior ?? 'blur';
  React.useEffect(() => {
    if (!editingRef.current) {
      const nextValue = numberInputDisplayValue(value);
      setInputValue(nextValue);
      lastAcceptedValueRef.current = nextValue;
    }
  }, [value]);
  const { onFocus, onBlur, ...inputProps } = props;
  const applyChange = (raw: string) => {
    if (raw === '') {
      setInputValue(raw);
      lastAcceptedValueRef.current = raw;
      onChange?.('');
      return;
    }
    if (!numberInputDraftPattern.test(raw) || (_allowDecimal === false && raw.includes('.'))) return;
    setInputValue(raw);
    const numeric = Number(raw);
    const isFiniteNumber = Number.isFinite(numeric);
    if (!isFiniteNumber) {
      lastAcceptedValueRef.current = raw;
      return;
    }
    if (!(_allowDecimal !== false || Number.isInteger(numeric))) return;
    if (clampBehavior === 'strict' && (numeric < (props.min ?? numeric) || numeric > (props.max ?? numeric))) {
      setInputValue(lastAcceptedValueRef.current);
      return;
    }
    lastAcceptedValueRef.current = raw;
    onChange?.(numeric);
  };
  const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    editingRef.current = false;
    onBlur?.(event);
    if (inputValue === '') {
      lastAcceptedValueRef.current = '';
      return;
    }
    const numeric = Number(inputValue);
    if (!Number.isFinite(numeric)) {
      setInputValue('');
      lastAcceptedValueRef.current = '';
      onChange?.('');
      return;
    }
    if (clampBehavior === 'none') {
      lastAcceptedValueRef.current = inputValue;
      return;
    }
    const nextValue = clampNumberInputValue(numeric, props.min, props.max);
    if (nextValue !== numeric) {
      const nextDisplayValue = numberInputDisplayValue(nextValue);
      setInputValue(nextDisplayValue);
      lastAcceptedValueRef.current = nextDisplayValue;
      onChange?.(nextValue);
      return;
    }
    setInputValue(numberInputDisplayValue(value));
    lastAcceptedValueRef.current = numberInputDisplayValue(value);
  };
  return <TextInput {...inputProps} type="text" inputMode={_allowDecimal === false ? 'numeric' : 'decimal'} value={inputValue} min={props.min} max={props.max} step={props.step} leftSection={prefix} rightSection={suffix} style={{ width: w, maxWidth: maw, ...props.style }} onFocus={(event) => { editingRef.current = true; onFocus?.(event); }} onBlur={handleBlur} onChange={(event) => applyChange(event.currentTarget.value)} />;
}

type SelectOption = string | { label: React.ReactNode; value: string; disabled?: boolean };
const normalizeSelectOption = (option: SelectOption) => typeof option === 'string' ? { label: option, value: option, disabled: false } : option;
const selectOptionLabel = (option: SelectOption): string => { const normalized = normalizeSelectOption(option); return typeof normalized.label === 'string' || typeof normalized.label === 'number' ? String(normalized.label) : ''; };
const nextEnabledOptionIndex = (options: ReadonlyArray<SelectOption>, currentIndex: number, direction: 1 | -1): number => {
  if (options.length === 0) return -1;
  if (currentIndex < 0) {
    if (direction > 0) return options.findIndex((option) => !normalizeSelectOption(option).disabled);
    for (let index = options.length - 1; index >= 0; index -= 1) {
      if (!normalizeSelectOption(options[index]).disabled) return index;
    }
    return -1;
  }
  for (let offset = 1; offset <= options.length; offset += 1) {
    const index = (currentIndex + direction * offset + options.length) % options.length;
    if (!normalizeSelectOption(options[index]).disabled) return index;
  }
  return -1;
};
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
type SelectProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'size'> & FieldProps & { data?: ReadonlyArray<SelectOption>; value?: string | null; onChange?: (value: string | null) => void; placeholder?: string; allowDeselect?: boolean; clearable?: boolean; searchable?: boolean; nothingFoundMessage?: string; size?: string; radius?: string | number; leftSection?: React.ReactNode; leftSectionWidth?: number; rightSection?: React.ReactNode; rightSectionWidth?: number; rightSectionPointerEvents?: string; searchValue?: string; onSearchChange?: (value: string) => void; renderOption?: ({ option }: { option: { label: React.ReactNode; value: string; disabled?: boolean } }) => React.ReactNode; hideSelectedLabel?: boolean; comboboxProps?: unknown; styles?: unknown; withAsterisk?: boolean; native?: boolean; w?: number | string; maw?: number | string };
const hasClearableSelection = (value: SelectProps['value'], allowDeselect?: boolean, clearable?: boolean) => Boolean(value && (allowDeselect || clearable));
export function Select({ data = [], value, onChange, id, label, description, error, errorProps, required, withAsterisk, mb, mt, p, placeholder, allowDeselect, clearable, searchable: _searchable, nothingFoundMessage: _nothingFoundMessage, size: _size, radius, leftSection, leftSectionWidth, rightSection, rightSectionWidth, rightSectionPointerEvents, searchValue: _searchValue, onSearchChange, renderOption: _renderOption, hideSelectedLabel = false, comboboxProps: _comboboxProps, styles: _styles, native = false, w, maw, className, style, onKeyDown: onKeyDownProp, ...props }: SelectProps) {
  const resolvedId = useFieldId(id, label);
  const messageIds = fieldMessageIds(resolvedId, description, error);
  const listboxId = React.useId();
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState<string | null>(null);
  const [activeOptionIndex, setActiveOptionIndex] = React.useState(-1);
  const listboxRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open || activeOptionIndex < 0) return;
    const activeOption = listboxRef.current?.querySelector<HTMLElement>(`[data-option-index="${activeOptionIndex}"]`);
    if (activeOption && typeof activeOption.scrollIntoView === 'function') {
      activeOption.scrollIntoView({ block: 'nearest' });
    }
  }, [activeOptionIndex, open]);
  const close = () => {
    setSearch(null);
    setActiveOptionIndex(-1);
    onSearchChange?.('');
    setOpen(false);
  };
  const containerRef = useDismissibleLayer(open, close);
  const clearableSelection = hasClearableSelection(value, allowDeselect, clearable);
  const selectedOption = data.find((option) => normalizeSelectOption(option).value === value);
  const selectedLabel = selectedOption ? selectOptionLabel(selectedOption) : '';
  const visibleOptions = data.filter((option) => !search || selectOptionLabel(option).toLowerCase().includes(search.toLowerCase()));
  const controlRadius = radiusClass(radius, 'control');
  const selectOption = (option: SelectOption) => {
    const normalized = normalizeSelectOption(option);
    if (normalized.disabled) return;
    onChange?.(normalized.value);
    setSearch(null);
    setActiveOptionIndex(-1);
    setOpen(false);
  };
  const clearSelection = () => {
    onChange?.(null);
    close();
  };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    onKeyDownProp?.(event);
    if (event.defaultPrevented) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActiveOptionIndex((currentIndex) => nextEnabledOptionIndex(visibleOptions, currentIndex, event.key === 'ArrowDown' ? 1 : -1));
      return;
    }
    if (event.key === 'Enter' && open) {
      const optionIndex = activeOptionIndex >= 0 && activeOptionIndex < visibleOptions.length
        ? activeOptionIndex
        : nextEnabledOptionIndex(visibleOptions, -1, 1);
      const option = optionIndex >= 0 ? visibleOptions[optionIndex] : undefined;
      if (option) {
        event.preventDefault();
        selectOption(option);
      }
    }
  };
  const nativeProps = props as React.SelectHTMLAttributes<HTMLSelectElement>;
  if (native) {
    return <FieldFrame id={resolvedId} label={label} description={description} error={error} errorProps={errorProps} required={required || withAsterisk} mb={mb} mt={mt} p={p} className={className} style={{ width: w, maxWidth: maw, ...style }}><select {...nativeProps} id={resolvedId} value={value ?? ''} required={required || withAsterisk} aria-invalid={Boolean(error) || undefined} aria-describedby={props['aria-describedby'] ?? messageIds.describedBy} onKeyDown={onKeyDownProp as React.KeyboardEventHandler<HTMLSelectElement> | undefined} onChange={(event) => onChange?.(event.currentTarget.value || null)} className={cn('h-11 min-h-11 w-full min-w-0 appearance-none rounded-lg border border-input bg-background px-3 py-2 text-base text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground md:text-sm', radiusClass(radius, 'control'), className)} style={style}>{placeholder ? <option value="">{placeholder}</option> : null}{data.map((option) => { const normalized = normalizeSelectOption(option); return <option key={normalized.value} value={normalized.value} disabled={normalized.disabled}>{normalized.label}</option>; })}</select></FieldFrame>;
  }
  return (
    <FieldFrame id={resolvedId} label={label} description={description} error={error} errorProps={errorProps} required={required || withAsterisk} mb={mb} mt={mt} p={p} className={className} style={{ width: w, maxWidth: maw, ...style }}>
      <div ref={containerRef} className={cn('relative', controlRadius)}>
        {leftSection && <span className="pointer-events-none absolute top-1/2 left-3 z-10 -translate-y-1/2" style={{ width: leftSectionWidth }}>{leftSection}</span>}
        <input
          {...props}
          id={resolvedId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={open && activeOptionIndex >= 0 ? `${listboxId}-option-${activeOptionIndex}` : undefined}
          aria-autocomplete="list"
          value={search ?? (hideSelectedLabel ? '' : selectedLabel)}
          placeholder={placeholder}
          required={required || withAsterisk}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={props['aria-describedby'] ?? messageIds.describedBy}
          onFocus={() => { setOpen(true); setActiveOptionIndex(-1); }}
          onClick={() => { setOpen(true); setActiveOptionIndex(-1); }}
          onKeyDown={handleKeyDown}
          onChange={(event) => { setOpen(true); setActiveOptionIndex(-1); setSearch(event.currentTarget.value); onSearchChange?.(event.currentTarget.value); }}
          className={cn('h-11 min-h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 pr-10 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 md:text-sm', leftSection && 'pl-9', rightSection && 'pr-9')}
        />
        {clearableSelection && <button type="button" aria-label="Clear selection" disabled={Boolean(props.disabled)} onMouseDown={(event) => event.preventDefault()} onClick={clearSelection} className="absolute top-1/2 right-2 z-10 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"><X size={14} aria-hidden="true" /></button>}
        {rightSection && <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2" style={{ width: rightSectionWidth, pointerEvents: rightSectionPointerEvents as React.CSSProperties['pointerEvents'] }}>{rightSection}</span>}
        {open && <div ref={listboxRef} id={listboxId} role="listbox" className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg">{visibleOptions.length ? visibleOptions.map((option, index) => { const normalized = normalizeSelectOption(option); const renderedOption = _renderOption?.({ option: { label: normalized.label, value: normalized.value, disabled: normalized.disabled } }); return <button type="button" role="option" id={`${listboxId}-option-${index}`} data-option-index={index} aria-label={selectOptionLabel(option)} aria-selected={normalized.value === value} key={normalized.value} disabled={normalized.disabled} onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setActiveOptionIndex(index)} onClick={() => selectOption(option)} className={cn('block min-h-10 w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50', index === activeOptionIndex && 'bg-muted')}>{renderedOption ?? selectOptionLabel(option)}</button>; }) : <div className="px-3 py-2 text-sm text-muted-foreground">{_nothingFoundMessage ?? 'Nothing found'}</div>}</div>}
      </div>
    </FieldFrame>
  );
}


type MultiSelectProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'size'> & FieldProps & { data?: ReadonlyArray<SelectOption>; value?: string[]; onChange?: (value: string[]) => void; placeholder?: string; searchable?: boolean; clearable?: boolean; nothingFoundMessage?: string; size?: string; radius?: string | number; comboboxProps?: unknown; rightSection?: React.ReactNode; styles?: unknown; withAsterisk?: boolean; w?: number | string; maw?: number | string };
export function MultiSelect({ data = [], value = [], onChange, id, label, description, error, errorProps, required, withAsterisk, mb, mt, p, className, placeholder, searchable: _searchable, clearable: _clearable, nothingFoundMessage: _nothingFoundMessage, size: _size, radius, comboboxProps: _comboboxProps, rightSection, styles: _styles, w, maw, style, onKeyDown: onKeyDownProp, ...props }: MultiSelectProps) {
  const resolvedId = useFieldId(id, label);
  const messageIds = fieldMessageIds(resolvedId, description, error);
  const listboxId = React.useId();
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState<string | null>(null);
  const [activeOptionIndex, setActiveOptionIndex] = React.useState(-1);
  const listboxRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open || activeOptionIndex < 0) return;
    const activeOption = listboxRef.current?.querySelector<HTMLElement>(`[data-option-index="${activeOptionIndex}"]`);
    if (activeOption && typeof activeOption.scrollIntoView === 'function') {
      activeOption.scrollIntoView({ block: 'nearest' });
    }
  }, [activeOptionIndex, open]);
  const close = () => {
    setSearch(null);
    setActiveOptionIndex(-1);
    setOpen(false);
  };
  const containerRef = useDismissibleLayer(open, close);
  const selectedLabels = data.filter((option) => value.includes(normalizeSelectOption(option).value)).map(selectOptionLabel).join(', ');
  const visibleOptions = data.filter((option) => !search || selectOptionLabel(option).toLowerCase().includes(search.toLowerCase()));
  const controlRadius = radiusClass(radius, 'control');
  const toggleOption = (option: SelectOption) => {
    const normalized = normalizeSelectOption(option);
    if (normalized.disabled) return;
    onChange?.(value.includes(normalized.value) ? value.filter((entry) => entry !== normalized.value) : [...value, normalized.value]);
    setSearch(null);
  };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    onKeyDownProp?.(event);
    if (event.defaultPrevented) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActiveOptionIndex((currentIndex) => nextEnabledOptionIndex(visibleOptions, currentIndex, event.key === 'ArrowDown' ? 1 : -1));
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === 'Enter' && open) {
      const optionIndex = activeOptionIndex >= 0 && activeOptionIndex < visibleOptions.length
        ? activeOptionIndex
        : nextEnabledOptionIndex(visibleOptions, -1, 1);
      const option = optionIndex >= 0 ? visibleOptions[optionIndex] : undefined;
      if (option) {
        event.preventDefault();
        toggleOption(option);
      }
    }
  };
  return (
    <FieldFrame id={resolvedId} label={label} description={description} error={error} errorProps={errorProps} required={required || withAsterisk} mb={mb} mt={mt} p={p} className={className} style={{ width: w, maxWidth: maw, ...style }}>
      <div ref={containerRef} className={cn('relative', controlRadius)}>
        <input
          {...props}
          id={resolvedId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={open && activeOptionIndex >= 0 ? `${listboxId}-option-${activeOptionIndex}` : undefined}
          aria-autocomplete="list"
          value={search ?? selectedLabels}
          placeholder={placeholder}
          required={required || withAsterisk}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={props['aria-describedby'] ?? messageIds.describedBy}
          onFocus={() => { setOpen(true); setActiveOptionIndex(-1); }}
          onClick={() => { setOpen(true); setActiveOptionIndex(-1); }}
          onKeyDown={handleKeyDown}
          onChange={(event) => { setOpen(true); setActiveOptionIndex(-1); setSearch(event.currentTarget.value); }}
          className={cn('h-11 min-h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 pr-10 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 md:text-sm')}
        />
        <span aria-hidden={rightSection ? undefined : true} className="pointer-events-none absolute top-1/2 right-3 flex -translate-y-1/2 items-center text-muted-foreground">{rightSection ?? <ChevronDown aria-hidden="true" className="size-4" />}</span>
        <div ref={listboxRef} id={listboxId} role="listbox" aria-multiselectable="true" hidden={!open} className="absolute top-full z-30 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground">
          {visibleOptions.length ? visibleOptions.map((option, index) => {
            const normalized = normalizeSelectOption(option);
            const selected = value.includes(normalized.value);
            return <button key={normalized.value} id={`${listboxId}-option-${index}`} data-option-index={index} type="button" role="option" aria-selected={selected} disabled={normalized.disabled} className={cn('flex min-h-10 w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50', index === activeOptionIndex && 'bg-muted')} onMouseEnter={() => setActiveOptionIndex(index)} onClick={() => toggleOption(option)}>{selected && <Check aria-hidden="true" className="size-4" />}{normalized.label}</button>;
          }) : <p className="px-3 py-2 text-sm text-muted-foreground">{_nothingFoundMessage ?? 'No options found.'}</p>}
        </div>
      </div>
    </FieldFrame>
  );
}
type TagsInputOption = string | { value: string; label: string };
type TagsInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'size'> & FieldProps & {
  data?: ReadonlyArray<TagsInputOption>;
  value?: string[];
  onChange?: (value: string[]) => void;
  placeholder?: string;
  clearable?: boolean;
  size?: string;
  radius?: string | number;
  comboboxProps?: unknown;
  w?: number | string;
  maw?: number | string;
};
export function TagsInput({
  data = [],
  value = [],
  onChange,
  id,
  label,
  description,
  error,
  errorProps,
  required,
  placeholder,
  clearable,
  radius,
  comboboxProps: _comboboxProps,
  size: _size,
  w,
  maw,
  className,
  style,
  disabled,
  ...props
}: TagsInputProps) {
  const resolvedId = useFieldId(id, label);
  const messageIds = fieldMessageIds(resolvedId, description, error);
  const listboxId = React.useId();
  const [search, setSearch] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const containerRef = useDismissibleLayer(open, () => setOpen(false));
  const selected = Array.isArray(value) ? value : [];
  const addTag = (candidate: string) => {
    const nextTag = candidate.trim();
    if (!nextTag || selected.includes(nextTag)) {
      setSearch('');
      return;
    }
    onChange?.([...selected, nextTag]);
    setSearch('');
    setOpen(false);
  };
  const removeTag = (tag: string) => onChange?.(selected.filter((entry) => entry !== tag));
  const normalizedOptions = data.map((option) => typeof option === 'string'
    ? { value: option, label: option }
    : option);
  const visibleOptions = normalizedOptions.filter((option) => (
    !selected.includes(option.value) &&
    (!search || option.label.toLowerCase().includes(search.toLowerCase()))
  ));
  return (
    <FieldFrame
      id={resolvedId}
      label={label}
      description={description}
      error={error}
      errorProps={errorProps}
      required={required}
      style={{ width: w, maxWidth: maw, ...style }}
      className={className}
    >
      <div ref={containerRef} className={cn('relative', radiusClass(radius, 'control'))}>
        <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-background px-2 py-1.5 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-inset focus-within:ring-ring">
          {selected.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs text-foreground">
              {tag}
              <button
                type="button"
                aria-label={`Remove ${tag}`}
                disabled={disabled}
                onClick={() => removeTag(tag)}
                className="rounded-full text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                <X aria-hidden="true" size={12} />
              </button>
            </span>
          ))}
          <input
            {...props}
            id={resolvedId}
            role="combobox"
            value={search}
            disabled={disabled}
            placeholder={selected.length > 0 ? undefined : placeholder}
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-expanded={open}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={props['aria-describedby'] ?? messageIds.describedBy}
            onFocus={() => setOpen(true)}
            onChange={(event) => {
              setSearch(event.currentTarget.value);
              setOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addTag(search || visibleOptions[0]?.value || '');
              } else if (event.key === 'Backspace' && !search && selected.length > 0) {
                removeTag(selected[selected.length - 1]);
              }
            }}
            className="min-w-32 flex-1 border-0 bg-transparent px-1 py-1 text-base text-foreground outline-none placeholder:text-muted-foreground"
          />
          {clearable && selected.length > 0 ? (
            <button
              type="button"
              aria-label="Clear values"
              disabled={disabled}
              onClick={() => onChange?.([])}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              <X aria-hidden="true" size={16} />
            </button>
          ) : null}
        </div>
        {open && !disabled && visibleOptions.length > 0 ? (
          <div
            id={listboxId}
            role="listbox"
            className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-border bg-popover p-1 shadow-lg"
          >
            {visibleOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={false}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => addTag(option.value)}
                className="block w-full rounded-md px-3 py-2 text-left text-sm text-popover-foreground hover:bg-muted"
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </FieldFrame>
  );
}


type AutocompleteProps = Omit<TextInputProps, 'value' | 'onChange'> & { data?: ReadonlyArray<string>; value?: string; onChange?: (value: string) => void; comboboxProps?: unknown };
export function Autocomplete({ data = [], value, onChange, comboboxProps: _comboboxProps, ...props }: AutocompleteProps) { const listId = React.useId(); return <><TextInput {...props} value={value ?? ''} onChange={(event) => onChange?.(event.currentTarget.value)} list={listId} /><datalist id={listId}>{data.map((option) => <option key={option} value={option} />)}</datalist></>; }

type ColorInputProps = Omit<TextInputProps, 'value' | 'onChange' | 'type'> & { value?: string; onChange?: (value: string) => void; format?: string; swatches?: string[] };
export function ColorInput({ value, onChange, ...props }: ColorInputProps) { return <TextInput {...props} value={value ?? ''} onChange={(event) => onChange?.(event.currentTarget.value)} />; }

type DateControlProps = FieldProps & React.AriaAttributes & { value?: Date | string | null; onChange?: (value: Date | null) => void; disabled?: boolean; minDate?: Date; placeholder?: string; size?: string; radius?: string | number; clearable?: boolean; valueFormat?: string; highlightToday?: boolean; leftSection?: React.ReactNode; timePickerProps?: unknown; clearButtonProps?: React.ButtonHTMLAttributes<HTMLButtonElement>; popoverProps?: unknown; style?: React.CSSProperties; styles?: unknown; className?: string; includeTime?: boolean; withAsterisk?: boolean; w?: number | string; maw?: number | string };
const dateInputValue = (value: Date | string | null | undefined, includeTime: boolean): string => { if (!value) return ''; if (typeof value === 'string') return value.slice(0, includeTime ? 16 : 10); const pad = (n: number) => String(n).padStart(2, '0'); const date = `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`; return includeTime ? `${date}T${pad(value.getHours())}:${pad(value.getMinutes())}` : date; };
const parseDateValue = (value: Date | string | null | undefined): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  const localMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/);
  if (localMatch) {
    const [, year, month, day, hour = '0', minute = '0', second = '0', fraction = '0'] = localMatch;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second), Number(fraction.padEnd(3, '0')));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const startOfDay = (value: Date): number => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
const dateKey = (value: Date): string => `${value.getFullYear()}-${value.getMonth()}-${value.getDate()}`;
const formatDateLabel = (value: Date | null, valueFormat?: string): string => {
  if (!value) return '';
  if (valueFormat === 'MMM D, YYYY') return value.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${String(value.getMonth() + 1).padStart(2, '0')}/${String(value.getDate()).padStart(2, '0')}/${value.getFullYear()}`;
};
const formatDateTimeLabel = (value: Date | null, valueFormat?: string, includeTime = false): string => {
  const dateLabel = formatDateLabel(value, valueFormat);
  if (!value || !includeTime) return dateLabel;
  return `${dateLabel} ${value.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
};
const monthDays = (value: Date): Array<Date | null> => {
  const firstDay = new Date(value.getFullYear(), value.getMonth(), 1).getDay();
  const daysInMonth = new Date(value.getFullYear(), value.getMonth() + 1, 0).getDate();
  return [
    ...Array.from({ length: firstDay }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => new Date(value.getFullYear(), value.getMonth(), index + 1)),
  ];
};
const dateAccessibleName = (label: React.ReactNode, ariaLabel?: string) => ariaLabel ?? (typeof label === 'string' ? label : 'Choose date');
const minimumDateTime = (minimum?: Date) => minimum ? startOfDay(minimum) : null;
function DateTimeControl(props: DateControlProps) {
  return <CalendarDateControl {...props} includeTime />;
}
function CalendarDateControl({ value, onChange, id, label, description, error, errorProps, required, mb, mt, p, minDate, placeholder = 'mm/dd/yyyy', clearable = false, valueFormat, highlightToday = false, leftSection, timePickerProps: _timePickerProps, clearButtonProps, popoverProps: _popoverProps, styles: _styles, className: _className, style, size: _size, radius, includeTime = false, ...ariaProps }: DateControlProps) {
  const resolvedId = useFieldId(id, label);
  const messageIds = fieldMessageIds(resolvedId, description, error);
  const selectedDate = parseDateValue(value);
  const [open, setOpen] = React.useState(false);
  const [viewDate, setViewDate] = React.useState(() => selectedDate ?? new Date());
  const containerRef = useDismissibleLayer(open, () => setOpen(false));
  const wasDateOpenRef = React.useRef(false);
  React.useEffect(() => {
    if (wasDateOpenRef.current && !open) {
      containerRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    }
    wasDateOpenRef.current = open;
  }, [open, containerRef]);
  const accessibleName = dateAccessibleName(label, ariaProps['aria-label']);
  const controlRadius = radiusClass(radius, 'control');
  const days = monthDays(viewDate);
  const today = new Date();
  const minimumTime = minimumDateTime(minDate);
  const selectDate = (date: Date | null) => {
    if (!date) {
      onChange?.(null);
      setOpen(false);
      return;
    }
    const next = new Date(date);
    if (includeTime && selectedDate) {
      next.setHours(selectedDate.getHours(), selectedDate.getMinutes(), 0, 0);
    }
    onChange?.(next);
    setOpen(false);
  };
  const changeTime = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedDate || !event.currentTarget.value) return;
    const [hours, minutes] = event.currentTarget.value.split(':').map(Number);
    const next = new Date(selectedDate);
    next.setHours(hours, minutes, 0, 0);
    onChange?.(next);
  };
  const timeValue = selectedDate
    ? `${String(selectedDate.getHours()).padStart(2, '0')}:${String(selectedDate.getMinutes()).padStart(2, '0')}`
    : '';
  return <FieldFrame id={resolvedId} label={label} description={description} error={error} errorProps={errorProps} required={required} mb={mb} mt={mt} p={p} className={_className} style={style}><div ref={containerRef} className={cn('relative', controlRadius)}><button {...ariaProps} id={resolvedId} type="button" aria-haspopup="dialog" aria-expanded={open} aria-label={accessibleName} aria-describedby={ariaProps['aria-describedby'] ?? messageIds.describedBy} onClick={() => setOpen((current) => !current)} className="flex h-11 min-h-11 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 py-2 text-left text-base text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 md:text-sm" style={style}><span className={cn('min-w-0 flex-1 whitespace-nowrap overflow-hidden text-ellipsis', !selectedDate && 'text-muted-foreground')}>{formatDateTimeLabel(selectedDate, valueFormat, includeTime) || placeholder}</span><span className="flex shrink-0 items-center gap-1 text-muted-foreground">{leftSection ?? <CalendarDays aria-hidden="true" className="size-4" />}</span></button>{clearable && selectedDate && !ariaProps.disabled && <button {...clearButtonProps} type="button" aria-label="Clear date" onClick={() => selectDate(null)} className="absolute top-1/2 right-9 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted"><X aria-hidden="true" className="size-4" /></button>}{open && !ariaProps.disabled && <div role="dialog" aria-label={accessibleName} className="absolute top-full left-0 z-40 mt-2 w-72 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-xl"><div className="flex items-center justify-between gap-2"><button type="button" aria-label="Previous month" onClick={() => setViewDate((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))} className="flex size-10 items-center justify-center rounded-md hover:bg-muted"><ChevronLeft aria-hidden="true" className="size-4" /></button><Text component="span" fw={600} className="text-sm">{viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Text><button type="button" aria-label="Next month" onClick={() => setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))} className="flex size-10 items-center justify-center rounded-md hover:bg-muted"><ChevronRight aria-hidden="true" className="size-4" /></button></div><div className="mt-3 grid grid-cols-7 text-center text-xs font-semibold text-muted-foreground">{['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => <span key={day} className="py-1">{day}</span>)}</div><div className="grid grid-cols-7 gap-1">{days.map((day, index) => { if (!day) return <span key={`blank-${index}`} aria-hidden="true" />; const disabled = minimumTime !== null && startOfDay(day) < minimumTime; const selected = selectedDate !== null && dateKey(day) === dateKey(selectedDate); const isToday = dateKey(day) === dateKey(today); const dateLabel = day.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }); return <button key={day.toISOString()} type="button" aria-pressed={selected} aria-current={isToday ? 'date' : undefined} aria-label={dateLabel} disabled={disabled} onClick={() => selectDate(day)} className={cn('flex min-h-10 items-center justify-center rounded-md text-sm transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-35', selected && 'bg-primary text-primary-foreground hover:bg-primary', highlightToday && isToday && !selected && 'ring-1 ring-primary')}>{day.getDate()}</button>; })}</div>{includeTime && <label className="mt-3 block text-sm font-medium">Time<input aria-label={`${accessibleName} time`} type="time" value={timeValue} onChange={changeTime} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground" /></label>}<div className="mt-2 flex items-center justify-between border-t border-border pt-2"><button type="button" className="min-h-10 rounded-md px-2 text-sm text-primary hover:bg-muted" onClick={() => selectDate(null)}>Clear</button><button type="button" disabled={minimumTime !== null && startOfDay(today) < minimumTime} className="min-h-10 rounded-md px-2 text-sm text-primary hover:bg-muted disabled:cursor-not-allowed disabled:opacity-35" onClick={() => selectDate(today)}>Today</button></div></div>}</div></FieldFrame>;
}
function DateControl({ includeTime, ...props }: DateControlProps & { includeTime?: boolean }) {
  return includeTime ? <DateTimeControl {...props} /> : <CalendarDateControl {...props} />;
}
export function DatePickerInput({ withAsterisk, w, maw, style, ...props }: DateControlProps) { return <DateControl {...props} required={props.required || withAsterisk} style={{ width: w, maxWidth: maw, ...style }} includeTime={false} />; }
export function DateTimePicker({ withAsterisk, w, maw, style, ...props }: DateControlProps) { return <DateControl {...props} required={props.required || withAsterisk} style={{ width: w, maxWidth: maw, ...style }} includeTime />; }

type FileInputProps = FieldProps & { value?: File | null; onChange?: (value: File | null) => void; placeholder?: string; accept?: string; clearable?: boolean; radius?: string | number; className?: string; disabled?: boolean };
export function FileInput({ value, onChange, id, label, description, error, required, mb, mt, p, placeholder, accept, radius, className, disabled }: FileInputProps) { const resolvedId = useFieldId(id, label); return <FieldFrame id={resolvedId} label={label} description={description} error={error} required={required} mb={mb} mt={mt} p={p}><input id={resolvedId} type="file" accept={accept} required={required} disabled={disabled} aria-label={typeof label === 'string' ? label : placeholder} onChange={(event) => onChange?.(event.currentTarget.files?.[0] ?? null)} className={cn('block min-h-11 w-full min-w-0 border border-input bg-background px-3 py-2 text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5', radiusClass(radius, 'control'), className)} />{value ? <span className="block truncate text-sm text-muted-foreground">{value.name}</span> : null}</FieldFrame>; }

type SwitchProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> & FieldProps & { size?: string; checked?: boolean; onChange?: React.ChangeEventHandler<HTMLInputElement> };
export function Switch({ id, label, description, mb, mt, p, size: _size, checked, onChange, disabled, className, ...props }: SwitchProps) { const resolvedId = useFieldId(id, label); return <label htmlFor={resolvedId} className={cn('flex min-h-11 items-start gap-3 rounded-lg border border-transparent py-2 text-sm', spacingClass(mb, 'mb'), spacingClass(mt, 'mt'), spacingClass(p, 'p'), disabled && 'cursor-not-allowed opacity-60', className)}><input {...props} id={resolvedId} type="checkbox" role="switch" aria-label={typeof label === 'string' ? label : undefined} checked={checked} onChange={onChange} disabled={disabled} className="mt-1 size-4 accent-primary" /><span className="min-w-0"><span className="block font-medium text-foreground">{label}</span>{description && <span className="mt-1 block text-xs text-muted-foreground">{description}</span>}</span></label>; }

type CheckboxProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> & { size?: string; label?: React.ReactNode; description?: React.ReactNode; onCheckedChange?: (checked: boolean) => void };
export function Checkbox({ label, description, onChange, onCheckedChange, className, checked, size: _size, ...props }: CheckboxProps) { const accessibleLabel = props['aria-label'] ?? (typeof label === 'string' ? label : undefined); const input = <input {...props} type="checkbox" aria-label={accessibleLabel} checked={checked} onChange={(event) => { onChange?.(event); onCheckedChange?.(event.currentTarget.checked); }} className={cn('size-4 shrink-0 accent-primary', className)} />; return label ? <label className="flex min-h-11 items-start gap-3 text-sm"><span className="pt-1">{input}</span><span><span className="block font-medium">{label}</span>{description && <span className="mt-1 block text-xs text-muted-foreground">{description}</span>}</span></label> : input; }
type ChipProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> & { checked?: boolean; onChange?: (checked: boolean) => void; radius?: string };
export function Chip({ checked = false, onChange, className, children, radius: _radius, ...props }: ChipProps) { return <button {...props} type="button" aria-pressed={checked} onClick={() => onChange?.(!checked)} className={cn('min-h-11 rounded-full border px-3 py-2 text-sm font-medium', checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-foreground hover:bg-muted', className)}>{children}</button>; }
type SegmentedControlProps = { value: string; onChange: (value: string) => void; data: Array<{ label: React.ReactNode; value: string }>; className?: string; fullWidth?: boolean; radius?: string | number; size?: string };
export function SegmentedControl({ value, onChange, data, className, fullWidth, radius: _radius, size: _size }: SegmentedControlProps) { return <div className={cn('inline-flex max-w-full flex-wrap gap-1 bg-muted p-1 org-radius-surface', fullWidth && 'w-full', className)} role="group">{data.map((item) => <button type="button" key={item.value} aria-label={typeof item.label === 'string' ? item.label : item.value} aria-pressed={item.value === value} onClick={() => onChange(item.value)} className={cn('min-h-11 px-3 py-2 text-sm font-medium text-muted-foreground org-radius-control', fullWidth && 'flex-1', item.value === value && 'bg-background text-foreground shadow-sm')}>{item.label}</button>)}</div>; }

type ModalProps = { opened: boolean; onClose: () => void; title?: React.ReactNode; children?: React.ReactNode; centered?: boolean; size?: string; styles?: { content?: React.CSSProperties; body?: React.CSSProperties }; withCloseButton?: boolean; fullScreen?: boolean; closeOnClickOutside?: boolean; closeOnEscape?: boolean };
export function Modal({ opened, onClose, title, children, size, styles, withCloseButton = true, fullScreen = false, closeOnClickOutside: _closeOnClickOutside, closeOnEscape: _closeOnEscape }: ModalProps) { return <Dialog open={opened} onOpenChange={(next) => { if (!next) onClose(); }}><DialogContent showCloseButton={withCloseButton} style={styles?.content} className={cn(size === 'xl' && 'max-w-4xl', size === 'lg' && 'max-w-2xl', size === 'sm' && 'max-w-sm', fullScreen && 'h-[100dvh] max-w-none rounded-none')}><DialogHeader>{title && <DialogTitle>{title}</DialogTitle>}</DialogHeader><div style={styles?.body}>{children}</div></DialogContent></Dialog>; }

type ConfirmDialogProps = { opened?: boolean; open?: boolean; onClose?: () => void; onCancel?: () => void; onConfirm: () => void; title: React.ReactNode; children?: React.ReactNode; message?: React.ReactNode; confirmLabel?: string; cancelLabel?: string; confirming?: boolean; confirmColor?: string; destructive?: boolean };
export function ConfirmDialog({ opened, open, onClose, onCancel, onConfirm, title, children, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', confirming, confirmColor, destructive }: ConfirmDialogProps) { const visible = opened ?? open ?? false; const close = onClose ?? onCancel ?? (() => undefined); return <Modal opened={visible} onClose={close} title={title}><Stack gap="md"><Text>{children ?? message}</Text><Group justify="flex-end" gap="sm"><Button variant="outline" onClick={close}>{cancelLabel}</Button><Button color={destructive ? 'red' : confirmColor} loading={confirming} onClick={onConfirm}>{confirmLabel}</Button></Group></Stack></Modal>; }

type ScrollAreaProps = React.HTMLAttributes<HTMLDivElement> & { mah?: number | string; type?: string; scrollHideDelay?: number; offsetScrollbars?: boolean };
function ScrollAreaBase({ className, mah, style, scrollHideDelay: _scrollHideDelay, offsetScrollbars: _offsetScrollbars, ...props }: ScrollAreaProps) { return <div className={cn('min-w-0 overflow-auto', className)} style={{ ...style, maxHeight: mah }} {...props} />; }
export const ScrollArea = Object.assign(ScrollAreaBase, { Autosize: ScrollAreaBase });

type LoaderProps = React.SVGAttributes<SVGSVGElement> & { size?: 'xs' | 'sm' | 'md' | 'lg' | number };
export function Loader({ size = 'md', className, ...props }: LoaderProps) { const sizeClass = size === 'xs' ? 'size-3' : size === 'sm' ? 'size-4' : size === 'lg' ? 'size-7' : 'size-5'; return <Loader2 role="status" aria-label="Loading" className={cn(sizeClass, 'animate-spin motion-reduce:animate-none', className)} {...props} />; }

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & { size?: string; variant?: string; color?: string; radius?: string };
const badgeToneClasses: Record<string, string> = {
  red: 'border-destructive/30 bg-destructive/10 text-destructive',
  blue: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200',
  cyan: 'border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-800 dark:bg-cyan-950 dark:text-cyan-200',
  violet: 'border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-200',
  green: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  yellow: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200',
};
const operationColorAliases: Record<string, string> = { teal: 'green', orange: 'yellow' };
const operationTone = (color: string | undefined, tones: Record<string, string>, fallback: string) => {
  const name = color ?? '';
  return tones[operationColorAliases[name] ?? name] ?? fallback;
};
export function Badge({ size = 'md', variant: _variant, color, radius: _radius, className, ...props }: BadgeProps) { const colorClass = operationTone(color, badgeToneClasses, 'border-border bg-muted text-muted-foreground'); return <span className={cn('inline-flex w-fit items-center rounded-full border font-medium', size === 'xs' ? 'px-1.5 py-0.5 text-[0.68rem]' : size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm', colorClass, className)} {...props} />; }
type ImageProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt' | 'width' | 'height'> & { src: string; alt: string; width?: number | string; height?: number | string; w?: number | string; h?: number | string; maw?: number | string; fit?: string; radius?: string | number };
export function Image({ src, alt, width, height, w, h, maw, fit, radius, className, style, ...props }: ImageProps) { return <img src={src} alt={alt} width={width ?? w} height={height ?? h} className={cn(radiusClass(radius, 'surface'), className)} style={{ maxWidth: maw, objectFit: fit as React.CSSProperties['objectFit'], ...style }} {...props} />; }

type PillProps = React.HTMLAttributes<HTMLSpanElement> & { withRemoveButton?: boolean; onRemove?: () => void; styles?: unknown };
function PillBase({ children, withRemoveButton = false, onRemove, styles: _styles, className, ...props }: PillProps) { return <span className={cn('inline-flex min-h-8 max-w-full items-center gap-1 rounded-full border border-border bg-muted px-2 py-1 text-sm text-foreground', className)} {...props}><span className="min-w-0 truncate">{children}</span>{withRemoveButton && <button type="button" aria-label="Remove" onClick={(event) => { event.stopPropagation(); onRemove?.(); }} className="flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground"><X aria-hidden="true" className="size-3" /></button>}</span>; }
function PillGroup({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) { return <div className={cn('flex min-w-0 flex-wrap items-center gap-1', className)} {...props}>{children}</div>; }
export const Pill = Object.assign(PillBase, { Group: PillGroup });

type PillsInputContextState = { id: string; labelId?: string; describedBy?: string; error?: boolean };
const PillsInputContext = React.createContext<PillsInputContextState | null>(null);
type PillsInputProps = FieldProps & Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> & { disabled?: boolean; radius?: string | number; styles?: unknown; children?: React.ReactNode };
function PillsInputRoot({ id, label, description, error, errorProps, required, mb, mt, p, disabled, radius, styles: _styles, className, children, ...props }: PillsInputProps) {
  const resolvedId = useFieldId(id, label);
  const labelId = label ? `${resolvedId}-label` : undefined;
  const descriptionId = description ? `${resolvedId}-description` : undefined;
  const errorId = error ? `${resolvedId}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(' ') || undefined;
  return <PillsInputContext.Provider value={{ id: resolvedId, labelId, describedBy, error: Boolean(error) }}><FieldFrame id={resolvedId} label={label} description={description} error={error} errorProps={errorProps} required={required} mb={mb} mt={mt} p={p} labelId={labelId} descriptionId={descriptionId} errorId={errorId}><div className={cn('min-h-11 w-full min-w-0 border border-input bg-background px-2 py-1.5 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-inset focus-within:ring-ring', radiusClass(radius, 'control'), disabled && 'cursor-not-allowed bg-muted opacity-70', className)} aria-disabled={disabled || undefined} {...props}>{children}</div></FieldFrame></PillsInputContext.Provider>;
}
type PillsInputFieldProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> & { size?: string };
const PillsInputField = React.forwardRef<HTMLInputElement, PillsInputFieldProps>(function PillsInputField({ id, size: _size, className, ...props }, ref) {
  const context = React.useContext(PillsInputContext);
  return <input ref={ref} {...props} id={id ?? context?.id} aria-labelledby={props['aria-labelledby'] ?? context?.labelId} aria-describedby={props['aria-describedby'] ?? context?.describedBy} aria-invalid={props['aria-invalid'] ?? (context?.error ? true : undefined)} className={cn('min-h-8 min-w-24 flex-1 border-0 bg-transparent px-1 py-1 text-sm text-foreground outline-none placeholder:text-muted-foreground', className)} />;
});
export const PillsInput = Object.assign(PillsInputRoot, { Field: PillsInputField });

type RadioProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> & { size?: string; label?: React.ReactNode; description?: React.ReactNode; mt?: Spacing; mb?: Spacing };
type RadioGroupContextState = { name: string; value?: string; onChange?: (value: string) => void };
const RadioGroupContext = React.createContext<RadioGroupContextState | null>(null);
const RadioBase = React.forwardRef<HTMLInputElement, RadioProps>(function Radio({ label, description, size: _size, mt, mb, checked, name, value, onChange, className, ...props }, ref) {
  const context = React.useContext(RadioGroupContext);
  const control = <input ref={ref} {...props} name={name ?? context?.name} value={value} type="radio" checked={context ? context.value === value : checked} onChange={context ? () => context.onChange?.(String(value ?? '')) : onChange} className={cn('mt-1 size-4 accent-primary', spacingClass(mt, 'mt'), spacingClass(mb, 'mb'), className)} />;
  return label ? <label className="flex min-h-11 items-start gap-3 text-sm"><span>{control}</span><span className="min-w-0"><span className="block font-medium text-foreground">{label}</span>{description && <span className="mt-1 block text-xs text-muted-foreground">{description}</span>}</span></label> : control;
});
type RadioGroupProps = { label?: React.ReactNode; description?: React.ReactNode; value?: string; onChange?: (value: string) => void; children?: React.ReactNode };
function RadioGroup({ label, description, value, onChange, children }: RadioGroupProps) { const name = React.useId(); return <fieldset className="min-w-0" role="radiogroup" aria-label={typeof label === 'string' ? label : undefined}><legend className="text-sm font-medium text-foreground">{label}</legend>{description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}<RadioGroupContext.Provider value={{ name, value, onChange }}><div>{children}</div></RadioGroupContext.Provider></fieldset>; }
export const Radio = Object.assign(RadioBase, { Group: RadioGroup });

type AvatarProps = React.HTMLAttributes<HTMLDivElement> & { src?: string | null; alt?: string; name?: string; size?: string | number; radius?: string };
export function Avatar({ src, alt, name, size = 'md', className, ...props }: AvatarProps) { const initials = name?.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase(); return <div className={cn('inline-flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-sm font-semibold text-muted-foreground', size === 'sm' && 'size-8 text-xs', size === 'lg' && 'size-14', className)} {...props}>{src ? <img src={src} alt={alt ?? name ?? ''} className="size-full object-cover" /> : initials}</div>; }

type AlertProps = React.HTMLAttributes<HTMLDivElement> & { title?: React.ReactNode; color?: string; icon?: React.ReactNode; withCloseButton?: boolean; onClose?: () => void; radius?: string; variant?: string; mb?: Spacing; mt?: Spacing; p?: Spacing };
const alertToneClasses: Record<string, string> = {
  red: 'border-destructive/30 bg-destructive/10 text-destructive',
  yellow: 'border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100',
  blue: 'border-blue-300 bg-blue-50 text-blue-900 dark:bg-blue-950 dark:text-blue-100',
  green: 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100',
};
export function Alert({ title, color, icon, withCloseButton, onClose, radius, variant: _variant, mb, mt, p, className, children, ...props }: AlertProps) { const tone = operationTone(color, alertToneClasses, 'border-border bg-muted text-foreground'); return <div role="alert" className={cn('relative flex gap-3 border text-sm', radiusClass(radius, 'surface'), spacingClass(p, 'p') || 'p-3', spacingClass(mb, 'mb'), spacingClass(mt, 'mt'), tone, className)} {...props}>{icon && <span className="mt-0.5 shrink-0">{icon}</span>}<div className="min-w-0 flex-1">{title && <p className="mb-1 font-semibold">{title}</p>}<div>{children}</div></div>{withCloseButton && onClose && <button type="button" aria-label="Dismiss" onClick={onClose} className="min-h-8 min-w-8 rounded-md p-1 hover:bg-black/10"><X aria-hidden="true" className="size-4" /></button>}</div>; }

type ActionIconProps = Omit<ButtonProps, 'children' | 'fullWidth'> & { children?: React.ReactNode };
export function ActionIcon({ className, children, ...props }: ActionIconProps) { return <Button {...props} size={props.size ?? 'icon-sm'} className={cn('shrink-0', className)}>{children}</Button>; }
type TooltipProps = { label: React.ReactNode; children: React.ReactNode; multiline?: boolean; maw?: number | string; withArrow?: boolean };
export function Tooltip({ label, children, maw, multiline: _multiline, withArrow: _withArrow }: TooltipProps) { return <span title={typeof label === 'string' ? label : undefined} style={{ maxWidth: maw }}>{children}</span>; }
export function Divider({ className, mt, mb, ...props }: React.HTMLAttributes<HTMLHRElement> & { mt?: Spacing; mb?: Spacing }) { return <hr className={cn('border-0 border-t border-border', spacingClass(mt, 'mt'), spacingClass(mb, 'mb'), className)} {...props} />; }
export function Progress({ value = 0, className, ...props }: React.HTMLAttributes<HTMLDivElement> & { value?: number; color?: string; size?: string | number }) { return <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)} {...props}><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>; }
export function Rating({ value = 0, onChange, readOnly = false, size = 'md', className }: { value?: number; onChange?: (value: number) => void; readOnly?: boolean; size?: string; fractions?: number; className?: string }) { const sizeClass = size === 'xs' ? 'size-3' : size === 'sm' ? 'size-4' : size === 'lg' ? 'size-7' : 'size-5'; return <div className={cn('inline-flex items-center gap-0.5', className)} aria-label={`${value} out of 5 stars`} role={readOnly ? 'img' : 'radiogroup'}>{[1, 2, 3, 4, 5].map((star) => { const icon = <Star aria-hidden="true" className={cn(sizeClass, star <= value ? 'fill-amber-400 text-amber-500' : 'text-muted-foreground/40')} />; return readOnly ? <span key={star}>{icon}</span> : <button key={star} type="button" role="radio" aria-checked={star === value} aria-label={`${star} star${star === 1 ? '' : 's'}`} onClick={() => onChange?.(star)}>{icon}</button>; })}</div>; }

type PopoverState = { open: boolean; controlled: boolean; setOpen: React.Dispatch<React.SetStateAction<boolean>> };
const PopoverContext = React.createContext<PopoverState | null>(null);
type PopoverProps = { children: React.ReactNode; width?: number | string; position?: string; shadow?: string; withArrow?: boolean; withinPortal?: boolean; opened?: boolean; onChange?: (opened: boolean) => void };
function PopoverRoot({ children, width: _width, position: _position, shadow: _shadow, withArrow: _withArrow, withinPortal: _withinPortal, opened, onChange }: PopoverProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const controlled = opened !== undefined;
  const open = opened ?? uncontrolledOpen;
  const setOpen = React.useCallback<React.Dispatch<React.SetStateAction<boolean>>>((next) => {
    const nextValue = typeof next === 'function' ? next(open) : next;
    if (!controlled) setUncontrolledOpen(nextValue);
    onChange?.(nextValue);
  }, [controlled, onChange, open]);
  const containerRef = useDismissibleLayer(open, () => setOpen(false));
  return <PopoverContext.Provider value={{ open, controlled, setOpen }}><div ref={containerRef} className="relative inline-block">{children}</div></PopoverContext.Provider>;
}
function PopoverTarget({ children }: { children: React.ReactElement }) { const context = React.useContext(PopoverContext); const childProps = children.props as { onClick?: (event: React.MouseEvent) => void }; return React.cloneElement(children, { onClick: (event: React.MouseEvent) => { childProps.onClick?.(event); if (!context?.controlled) context?.setOpen((current) => !current); } } as Partial<typeof children.props>); }
function PopoverDropdown({ children, p, className }: { children: React.ReactNode; p?: Spacing; className?: string }) { const context = React.useContext(PopoverContext); return context?.open ? <div className={cn('absolute top-full left-0 z-40 mt-1 min-w-60 border border-border bg-popover text-popover-foreground shadow-lg org-radius-surface', spacingClass(p, 'p') || 'p-3', className)}>{children}</div> : null; }
export const Popover = Object.assign(PopoverRoot, { Target: PopoverTarget, Dropdown: PopoverDropdown });

export function Collapse({ in: visible, children, transitionDuration: _transitionDuration, transitionTimingFunction: _transitionTimingFunction, animateOpacity: _animateOpacity, className }: { in: boolean; children?: React.ReactNode; transitionDuration?: number; transitionTimingFunction?: string; animateOpacity?: boolean; className?: string }) { return <div className={className} aria-hidden={visible ? undefined : true} inert={visible ? undefined : true} style={{ maxHeight: visible ? undefined : 0, overflow: visible ? undefined : 'hidden', opacity: visible ? 1 : 0 }}>{children}</div>; }

type TableCellProps = React.TdHTMLAttributes<HTMLTableCellElement> & { ta?: string; fw?: number | string; c?: string };
function TableCell({ ta, fw, c, className, style, ...props }: TableCellProps) { return <td className={cn('px-3 py-2 align-top text-sm', textColorClass(c), className)} style={{ textAlign: ta as React.CSSProperties['textAlign'], fontWeight: fw, ...style }} {...props} />; }
function TableHeaderCell({ ta, fw, c, className, style, ...props }: TableCellProps) { return <th className={cn('px-3 py-2 text-left align-top text-sm font-semibold', textColorClass(c), className)} style={{ textAlign: ta as React.CSSProperties['textAlign'], fontWeight: fw, ...style }} {...props} />; }
function TableBase({ className, striped, highlightOnHover, withTableBorder: _withTableBorder, withColumnBorders: _withColumnBorders, verticalSpacing: _verticalSpacing, horizontalSpacing: _horizontalSpacing, miw, layout, ...props }: React.TableHTMLAttributes<HTMLTableElement> & { striped?: boolean; highlightOnHover?: boolean; withTableBorder?: boolean; withColumnBorders?: boolean; verticalSpacing?: string; horizontalSpacing?: string; miw?: number | string; layout?: string }) { return <table className={cn('w-full border-collapse', striped && '[&_tbody_tr:nth-child(even)]:bg-muted/40', highlightOnHover && '[&_tbody_tr:hover]:bg-muted/60', className)} style={{ minWidth: miw, tableLayout: layout as React.CSSProperties['tableLayout'] }} {...props} />; }
export const Table = Object.assign(TableBase, { Thead: (props: React.HTMLAttributes<HTMLTableSectionElement>) => <thead {...props} />, Tbody: (props: React.HTMLAttributes<HTMLTableSectionElement>) => <tbody {...props} />, Tr: (props: React.HTMLAttributes<HTMLTableRowElement>) => <tr {...props} />, Td: TableCell, Th: TableHeaderCell, ScrollContainer: ({ children, minWidth, className, style, ...props }: React.HTMLAttributes<HTMLDivElement> & { minWidth?: number | string }) => <div className={cn('overflow-x-auto', className)} {...props}><div style={{ minWidth, ...style }}>{children}</div></div> });
