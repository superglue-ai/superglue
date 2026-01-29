"use client";

import { RunsView } from "./views/RunsView";
import { SchedulesView } from "./views/SchedulesView";
import { NotificationsView } from "./views/NotificationsView";
import { ApiKeysView } from "./views/ApiKeysView";

interface AdminContentProps {
  view: string;
}

export function AdminContent({ view }: AdminContentProps) {
  switch (view) {
    case "runs":
      return <RunsView />;
    case "schedules":
      return <SchedulesView />;
    case "api-keys":
      return <ApiKeysView />;
    case "notifications":
      return <NotificationsView />;
    default:
      return <RunsView />;
  }
}
