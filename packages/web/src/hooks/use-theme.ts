import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";

export function useTheme(): [Theme, (theme: Theme) => void, "light" | "dark"] {
  const getSystemTheme = () =>
    window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "dark";
    return (localStorage.getItem("theme") as Theme) || "system";
  });

  const [resolved, setResolved] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "dark";
    const stored = localStorage.getItem("theme");
    if (stored === "light" || stored === "dark") return stored;
    return getSystemTheme();
  });

  useEffect(() => {
    const root = document.documentElement;
    const apply = (t: "light" | "dark") => {
      root.classList.toggle("dark", t === "dark");
      setResolved(t);
    };

    if (theme === "system") {
      const mql = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => apply(getSystemTheme());
      handler();
      mql.addEventListener("change", handler);
      return () => mql.removeEventListener("change", handler);
    } else {
      apply(theme);
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  return [theme, setTheme, resolved];
}
