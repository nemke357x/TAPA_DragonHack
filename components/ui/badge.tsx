import * as React from "react";
import { cn } from "@/lib/utils";

type BadgeTone = "neutral" | "teal" | "rose" | "amber" | "green";

const tones: Record<BadgeTone, string> = {
  neutral: "border-border bg-white text-muted-foreground",
  teal: "border-primary/20 bg-primary/10 text-primary",
  rose: "border-accent/20 bg-accent/10 text-accent",
  amber: "border-warning/25 bg-warning/10 text-amber-700",
  green: "border-success/20 bg-success/10 text-success"
};

export function Badge({
  className,
  tone = "neutral",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-semibold",
        tones[tone],
        className
      )}
      {...props}
    />
  );
}
