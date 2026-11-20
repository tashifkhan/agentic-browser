// shadcn/ui DropdownMenu, on Radix, styled with the shared design tokens.
import * as Menu from "@radix-ui/react-dropdown-menu";
import type { ComponentProps, ReactNode } from "react";
import { Check } from "../icons";

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;
export const DropdownMenuGroup = Menu.Group;
export const DropdownMenuRadioGroup = Menu.RadioGroup;

export function DropdownMenuContent({ className, sideOffset = 6, ...props }: ComponentProps<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content className={`ui-popover ui-dropdown${className ? ` ${className}` : ""}`} sideOffset={sideOffset} {...props} />
    </Menu.Portal>
  );
}

export function DropdownMenuItem({ className, hint, children, ...props }: ComponentProps<typeof Menu.Item> & { hint?: ReactNode }) {
  return (
    <Menu.Item className={`ui-menu__item${className ? ` ${className}` : ""}`} {...props}>
      {children}
      {hint && <span className="ui-menu__hint">{hint}</span>}
    </Menu.Item>
  );
}

export function DropdownMenuRadioItem({ className, hint, children, ...props }: ComponentProps<typeof Menu.RadioItem> & { hint?: ReactNode }) {
  return (
    <Menu.RadioItem className={`ui-menu__item${className ? ` ${className}` : ""}`} {...props}>
      {children}
      {hint && <span className="ui-menu__hint">{hint}</span>}
      <Menu.ItemIndicator className="ui-menu__check">
        <Check size={13} />
      </Menu.ItemIndicator>
    </Menu.RadioItem>
  );
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof Menu.Label>) {
  return <Menu.Label className={`ui-menu__label${className ? ` ${className}` : ""}`} {...props} />;
}

export function DropdownMenuSeparator(props: ComponentProps<typeof Menu.Separator>) {
  return <Menu.Separator className="ui-menu__sep" {...props} />;
}
