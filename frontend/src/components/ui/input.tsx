import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "h-12 w-full rounded-md border border-input bg-surface px-3.5 text-base text-foreground outline-none transition placeholder:text-muted-foreground/70 focus-visible:border-brand/60 focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";
