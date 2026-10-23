import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "./cn";

// Follows the shadcn/ui Button pattern, themed with the project tokens in globals.css.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-brand text-brand-foreground hover:bg-brand-hover",
        secondary: "border border-line bg-surface text-ink hover:bg-canvas",
        ghost: "text-ink hover:bg-accent hover:text-accent-foreground",
      },
      size: {
        // 44 px minimum touch target (docs/design/frontend-design-rules.md rule 10).
        md: "h-11 px-4",
        // Dense, pointer-only contexts; still above the WCAG 2.5.8 minimum of 24 px.
        sm: "h-8 px-3",
        icon: "size-11",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type ButtonProps = ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Component = asChild ? Slot.Root : "button";
  return <Component className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
