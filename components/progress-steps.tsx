import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const steps = ["Import", "Clarify", "Estimate", "Optimize"];

export function ProgressSteps({ current }: { current: number }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {steps.map((step, index) => {
        const active = index === current;
        const done = index < current;

        return (
          <div key={step} className="flex items-center gap-2">
            <div
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-xs font-bold transition",
                done && "border-primary bg-primary text-primary-foreground",
                active && "border-primary bg-primary/10 text-primary",
                !done && !active && "border-border bg-white text-muted-foreground"
              )}
            >
              {done ? <Check className="h-4 w-4" /> : index + 1}
            </div>
            <span
              className={cn(
                "hidden text-sm font-semibold sm:inline",
                active || done ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {step}
            </span>
          </div>
        );
      })}
    </div>
  );
}
