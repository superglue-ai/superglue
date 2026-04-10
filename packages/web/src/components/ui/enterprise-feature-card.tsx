import { Badge } from "@/src/components/ui/badge";
import { cn } from "@/src/lib/general-utils";
import { Lock } from "lucide-react";

interface EnterpriseFeatureCardProps {
  title: string;
  description: string;
  className?: string;
}

export function EnterpriseFeatureCard({
  title,
  description,
  className,
}: EnterpriseFeatureCardProps) {
  return (
    <div
      className={cn("rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-4", className)}
    >
      <div className="mb-3 flex items-center gap-2">
        <Badge variant="glass-primary" className="h-5 px-2 text-[10px] uppercase tracking-[0.08em]">
          Enterprise
        </Badge>
        <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Lock className="h-3.5 w-3.5" />
          {title}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
