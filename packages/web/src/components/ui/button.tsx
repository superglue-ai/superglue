import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/src/lib/general-utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "btn",
        destructive: "btn-destructive",
        outline: "btn-outline",
        secondary: "btn-secondary",
        ghost: "btn-ghost",
        link: "btn-link",
        success: "btn-success",
        glass:
          "bg-gradient-to-br from-muted/50 to-muted/30 dark:from-muted/50 dark:to-muted/30 backdrop-blur-sm border border-border/50 dark:border-border/70 shadow-sm hover:shadow hover:border-border/60 dark:hover:border-border/90 hover:from-muted/60 hover:to-muted/40 dark:hover:from-muted/60 dark:hover:to-muted/40 active:scale-[0.99] text-foreground/90 dark:text-foreground/95 hover:text-foreground transition-all duration-200",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
