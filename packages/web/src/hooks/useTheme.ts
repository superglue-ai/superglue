import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";

export function useTheme(): [Theme, (theme: Theme) => void, "light" | "dark"] {
  const getSystemTheme = () =>
    window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === "undefined") return "dark";
    const stored = localStorage.getItem("theme");
    if (stored === "light" || stored === "dark" || stored === "system") return stored as Theme;
    return "system";
  });

  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "dark";
    const stored = localStorage.getItem("theme");
    if (stored === "light" || stored === "dark") return stored as "light" | "dark";
    return getSystemTheme();
  });

  useEffect(() => {
    // Only ever add/remove the "dark" class, never touch any other classes!
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
      setResolvedTheme("dark");
    } else if (theme === "light") {
      root.classList.remove("dark");
      setResolvedTheme("light");
    } else {
      // system
      const systemTheme = getSystemTheme();
      setResolvedTheme(systemTheme);
      if (systemTheme === "dark") {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
      // Listen for system changes
      const mql = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = (e: MediaQueryListEvent) => {
        setResolvedTheme(e.matches ? "dark" : "light");
        if (e.matches) {
          root.classList.add("dark");
        } else {
          root.classList.remove("dark");
        }
      };
      mql.addEventListener("change", handler);
      return () => mql.removeEventListener("change", handler);
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);

  return [theme, setTheme, resolvedTheme];
}
