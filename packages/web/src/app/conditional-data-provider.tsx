"use client";

import { usePathname } from "next/navigation";
import { SystemsProvider } from "./systems-context";
import { SchedulesProvider } from "./schedules-context";
import { ToolsProvider } from "./tools-context";

const BLACKLISTED_PATHS = ["/auth", "/login"];

export function ConditionalDataProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (BLACKLISTED_PATHS.some((path) => pathname.startsWith(path))) {
    return children;
  }

  return (
    <ToolsProvider>
      <SystemsProvider>
        <SchedulesProvider>{children}</SchedulesProvider>
      </SystemsProvider>
    </ToolsProvider>
  );
}
