"use client";

import { X } from "lucide-react";
import { Dialog } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "./cn";

// Slide-over panel built on the Radix Dialog primitive (focus trap, Escape to close,
// aria-modal). Used for the mobile navigation drawer.
export const Sheet = Dialog.Root;
export const SheetTrigger = Dialog.Trigger;
export const SheetClose = Dialog.Close;

export function SheetContent({
  className,
  children,
  title,
  ...props
}: ComponentProps<typeof Dialog.Content> & { title: string; children: ReactNode }) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
      <Dialog.Content
        className={cn("fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-surface shadow-xl outline-none", className)}
        {...props}
      >
        <Dialog.Title className="sr-only">{title}</Dialog.Title>
        <Dialog.Description className="sr-only">Site navigation</Dialog.Description>
        {children}
        <Dialog.Close
          className="absolute top-2 right-2 flex size-11 items-center justify-center rounded-md text-muted hover:bg-canvas focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
          aria-label="Close navigation"
        >
          <X className="size-5" aria-hidden />
        </Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  );
}
