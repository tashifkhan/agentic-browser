// shadcn/ui Select, on Radix, styled with the shared design tokens
// instead of Tailwind. Same part names as shadcn so its docs apply.
import * as SelectPrimitive from "@radix-ui/react-select";
import type { ComponentProps, ReactNode } from "react";
import { Check, ChevronDown } from "../icons";

export const Select = SelectPrimitive.Root;
export const SelectGroup = SelectPrimitive.Group;
export const SelectValue = SelectPrimitive.Value;

export function SelectTrigger({ className, children, ...props }: ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger className={`ui-select__trigger${className ? ` ${className}` : ""}`} {...props}>
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown size={14} className="ui-select__chev" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

export function SelectContent({ className, children, position = "popper", ...props }: ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content className={`ui-popover ui-select__content${className ? ` ${className}` : ""}`} position={position} sideOffset={6} {...props}>
        <SelectPrimitive.Viewport className="ui-select__viewport">{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

export function SelectLabel({ className, ...props }: ComponentProps<typeof SelectPrimitive.Label>) {
  return <SelectPrimitive.Label className={`ui-menu__label${className ? ` ${className}` : ""}`} {...props} />;
}

export function SelectItem({ className, children, hint, ...props }: ComponentProps<typeof SelectPrimitive.Item> & { hint?: ReactNode }) {
  return (
    <SelectPrimitive.Item className={`ui-menu__item${className ? ` ${className}` : ""}`} {...props}>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      {hint && <span className="ui-menu__hint">{hint}</span>}
      <SelectPrimitive.ItemIndicator className="ui-menu__check">
        <Check size={13} />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

export function SelectSeparator(props: ComponentProps<typeof SelectPrimitive.Separator>) {
  return <SelectPrimitive.Separator className="ui-menu__sep" {...props} />;
}

export type SelectOption = { value: string; label: ReactNode; hint?: ReactNode; disabled?: boolean };

/** Shorthand for the common case: a value, a list of options, and a change handler. */
export function SimpleSelect({
  value,
  onChange,
  options,
  placeholder,
  label,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  label?: string;
  className?: string;
}) {
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className={className}>
        <SelectValue placeholder={placeholder ?? "Choose"} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} hint={o.hint} disabled={o.disabled}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
