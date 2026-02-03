"use client";

import { cn, getSimpleIcon } from "@/src/lib/general-utils";
import { useTheme } from "@/src/hooks/use-theme";
import { systems, SystemConfig } from "@superglue/shared";
import { useRef, useMemo, useState, useCallback, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface DockIconData {
  key: string;
  label: string;
  slug: string;
  hex: string;
  svg: string;
  config: SystemConfig;
}

function adjustColorForDarkMode(hex: string): string {
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (luminance < 0.3) {
    const factor = 1.5;
    const newR = Math.min(255, Math.round(r * factor + 60));
    const newG = Math.min(255, Math.round(g * factor + 60));
    const newB = Math.min(255, Math.round(b * factor + 60));
    return `${newR.toString(16).padStart(2, "0")}${newG.toString(16).padStart(2, "0")}${newB.toString(16).padStart(2, "0")}`;
  }
  return hex;
}

function formatLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

interface SystemCarouselProps {
  onSystemSelect?: (key: string, label: string, config: SystemConfig) => void;
  className?: string;
  showNavArrows?: boolean;
}

export function SystemCarousel({ onSystemSelect, className, showNavArrows }: SystemCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [, , resolvedTheme] = useTheme();
  const isDark = resolvedTheme === "dark";

  const scrollByAmount = useCallback((direction: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollAmount = 200;
    el.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  }, []);

  const icons = useMemo(() => {
    const result: DockIconData[] = [];
    for (const [key, config] of Object.entries(systems)) {
      if (!config.icon) continue;
      const icon = getSimpleIcon(config.icon);
      if (icon) {
        result.push({
          key,
          label: formatLabel(key),
          slug: icon.slug,
          hex: icon.hex,
          svg: icon.svg,
          config,
        });
      }
    }
    return result;
  }, []);

  const tripleIcons = useMemo(() => {
    return [...icons, ...icons, ...icons];
  }, [icons]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || icons.length === 0) return;

    const iconWidth = 48 + 12;
    const singleSetWidth = icons.length * iconWidth;
    el.scrollLeft = singleSetWidth;
  }, [icons.length]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || icons.length === 0) return;

    const iconWidth = 48 + 12;
    const singleSetWidth = icons.length * iconWidth;

    if (el.scrollLeft < singleSetWidth * 0.25) {
      el.scrollLeft += singleSetWidth;
    } else if (el.scrollLeft > singleSetWidth * 1.75) {
      el.scrollLeft -= singleSetWidth;
    }
  }, [icons.length]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (e.ctrlKey) return;
      e.preventDefault();
      const multiplier = e.deltaMode === 1 ? 20 : e.deltaMode === 2 ? el.clientWidth : 1;
      el.scrollLeft += (e.deltaY + e.deltaX) * multiplier;
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  const handleClick = useCallback(
    (icon: DockIconData) => {
      onSystemSelect?.(icon.key, icon.label, icon.config);
    },
    [onSystemSelect],
  );

  if (icons.length === 0) return null;

  return (
    <div className={cn("relative", className)}>
      {showNavArrows && (
        <button
          type="button"
          onClick={() => scrollByAmount("left")}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-background/80 border border-border/50 text-muted-foreground hover:text-foreground hover:border-border transition-all shadow-sm hover:shadow"
          aria-label="Scroll left"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      )}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className={cn(
          "flex items-center gap-3 py-3 overflow-x-auto scrollbar-none",
          showNavArrows ? "px-12" : "px-4",
        )}
        style={{
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          maskImage:
            "linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)",
        }}
      >
        {tripleIcons.map((icon, index) => {
          const isHovered = hoveredKey === `${icon.key}-${index}`;
          const displayHex = isDark ? adjustColorForDarkMode(icon.hex) : icon.hex;
          const svgWithColor = icon.svg.replace("<svg", `<svg fill="#${displayHex}"`);

          return (
            <div
              key={`${icon.key}-${index}`}
              onClick={() => handleClick(icon)}
              onMouseEnter={() => setHoveredKey(`${icon.key}-${index}`)}
              onMouseLeave={() => setHoveredKey(null)}
              role="button"
              tabIndex={0}
              className="relative flex-shrink-0 w-12 h-12 cursor-pointer"
            >
              <div
                className={cn(
                  "absolute inset-0 rounded-xl flex flex-col items-center justify-center overflow-hidden",
                  "transition-all duration-150 ease-out origin-center",
                  isHovered && "scale-[1.17] -translate-y-1",
                )}
                style={{
                  backgroundColor: isHovered ? `#${displayHex}25` : `#${displayHex}10`,
                  border: isHovered ? `1px solid #${displayHex}50` : "none",
                }}
              >
                <span
                  className={cn(
                    "transition-all duration-150",
                    isHovered ? "[&>svg]:w-4 [&>svg]:h-4" : "[&>svg]:w-6 [&>svg]:h-6",
                  )}
                  dangerouslySetInnerHTML={{ __html: svgWithColor }}
                />
                {isHovered && (
                  <span
                    className="text-[7px] font-semibold text-center leading-none px-0.5 truncate max-w-full"
                    style={{ color: `#${displayHex}` }}
                  >
                    {icon.label}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {showNavArrows && (
        <button
          type="button"
          onClick={() => scrollByAmount("right")}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-background/80 border border-border/50 text-muted-foreground hover:text-foreground hover:border-border transition-all shadow-sm hover:shadow"
          aria-label="Scroll right"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}
