import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold leading-tight",
  {
    variants: {
      variant: {
        muted: "bg-elevated text-muted-foreground",
        brand: "bg-brand/15 text-sky-300",
        ok: "bg-emerald-400/15 text-emerald-300",
        danger: "bg-rose-400/15 text-rose-300",
        warn: "bg-amber-400/15 text-amber-300",
      },
    },
    defaultVariants: { variant: "muted" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
