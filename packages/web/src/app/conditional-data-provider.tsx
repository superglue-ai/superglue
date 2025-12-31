"use client";

import { usePathname } from "next/navigation";
import { IntegrationsProvider } from "./integrations-context";
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
      <IntegrationsProvider>
        <SchedulesProvider>{children}</SchedulesProvider>
      </IntegrationsProvider>
    </ToolsProvider>
  );
}
