import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Button styles exposed as `buttonVariants` so they can also be applied to a
 * react-router <Link> via className — no Radix Slot needed.
 */
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md font-semibold whitespace-nowrap select-none cursor-pointer no-underline press focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 disabled:pointer-events-none aria-disabled:opacity-50 aria-disabled:pointer-events-none",
  {
    variants: {
      variant: {
        default:
          "bg-elevated text-foreground border border-border hover:bg-[#23314f]",
        aurora: "bg-aurora text-white border-0 glow hover:brightness-[1.08]",
        ghost:
          "bg-transparent border border-border text-foreground hover:bg-elevated",
        danger:
          "bg-transparent border border-danger/40 text-danger hover:bg-danger/10",
        link: "border-0 bg-transparent text-brand font-medium hover:underline underline-offset-4",
      },
      size: {
        default: "h-11 px-4 text-[15px]",
        sm: "h-9 px-3 text-sm",
        lg: "h-12 px-6 text-base",
        icon: "h-11 w-11 p-0",
        none: "",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";
