'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

const SideDialog = DialogPrimitive.Root;
const SideDialogTrigger = DialogPrimitive.Trigger;
const SideDialogPortal = DialogPrimitive.Portal;
const SideDialogClose = DialogPrimitive.Close;

const SideDialogOverlay = React.forwardRef<
    React.ElementRef<typeof DialogPrimitive.Overlay>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
    <DialogPrimitive.Overlay
        ref={ref}
        className={cn(
            'fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            className,
        )}
        {...props}
    />
));
SideDialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const SideDialogContent = React.forwardRef<
    React.ElementRef<typeof DialogPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
    <SideDialogPortal>
        <SideDialogOverlay />
        <DialogPrimitive.Content
            ref={ref}
            className={cn(
                'fixed right-4 top-4 bottom-4 z-50 flex w-full max-w-md flex-col overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-right-full sm:max-w-lg dark:bg-zinc-950 dark:border dark:border-zinc-800',
                className,
            )}
            {...props}
        >
            {children}
        </DialogPrimitive.Content>
    </SideDialogPortal>
));
SideDialogContent.displayName = DialogPrimitive.Content.displayName;

const SideDialogHeader = ({
    className,
    children,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
    <div
        className={cn(
            'flex items-center justify-between pb-4 border-b border-zinc-100 dark:border-zinc-800 mb-6',
            className,
        )}
        {...props}
    >
        <div className="flex flex-col space-y-1.5 text-left">
            {children}
        </div>
        <div className="flex items-center gap-2">
            <DialogPrimitive.Close className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-950 focus:ring-offset-2 disabled:pointer-events-none dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-50 transition-colors">
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
        </div>
    </div>
);
SideDialogHeader.displayName = 'SideDialogHeader';

const SideDialogFooter = ({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
    <div
        className={cn(
            'flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 mt-auto pt-6 border-t border-zinc-100 dark:border-zinc-800',
            className,
        )}
        {...props}
    />
);
SideDialogFooter.displayName = 'SideDialogFooter';

const SideDialogTitle = React.forwardRef<
    React.ElementRef<typeof DialogPrimitive.Title>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
    <DialogPrimitive.Title
        ref={ref}
        className={cn(
            'text-lg font-semibold leading-none tracking-tight text-foreground/90',
            className,
        )}
        {...props}
    />
));
SideDialogTitle.displayName = DialogPrimitive.Title.displayName;

const SideDialogDescription = React.forwardRef<
    React.ElementRef<typeof DialogPrimitive.Description>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
    <DialogPrimitive.Description
        ref={ref}
        className={cn('text-sm text-zinc-500 dark:text-zinc-400', className)}
        {...props}
    />
));
SideDialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
    SideDialog,
    SideDialogPortal,
    SideDialogOverlay,
    SideDialogClose,
    SideDialogTrigger,
    SideDialogContent,
    SideDialogHeader,
    SideDialogFooter,
    SideDialogTitle,
    SideDialogDescription,
};
