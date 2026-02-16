import { cn } from "@/src/lib/general-utils";

interface UserIconProps {
  name?: string | null;
  email?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  sm: "h-8 w-8 text-sm",
  md: "h-10 w-10 text-base",
  lg: "h-12 w-12 text-lg",
};

export function UserIcon({ name, email, size = "md", className }: UserIconProps) {
  const initial = (name?.[0] || email?.[0] || "?").toUpperCase();

  return (
    <div
      className={cn(
        "rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-primary font-semibold",
        sizeClasses[size],
        className,
      )}
    >
      {initial}
    </div>
  );
}
