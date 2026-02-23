import * as React from 'react';
import { cn } from '@/lib/utils/cn';

export interface SelectNativeProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> { }

/**
 * Accessible native `<select>` styled to match the shadcn input family.
 * Use for simple option lists; for searchable comboboxes consider a custom
 * implementation built on top of the DropdownMenu primitive.
 */
const SelectNative = React.forwardRef<HTMLSelectElement, SelectNativeProps>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'flex h-9 w-full appearance-none rounded-md border border-zinc-200 bg-background text-foreground px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:focus-visible:ring-zinc-300 [&_option]:bg-popover [&_option]:text-popover-foreground',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
SelectNative.displayName = 'SelectNative';

export { SelectNative };
