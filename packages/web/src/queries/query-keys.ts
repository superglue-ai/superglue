export const queryKeys = {
  org: {
    all: () => ["org"] as const,
    me: (orgId: string) => [...queryKeys.org.all(), orgId, "me"] as const,
    billing: (userId: string) => [...queryKeys.org.all(), userId, "billing"] as const,
  },

  tools: {
    all: (orgId: string) => ["tools", orgId] as const,
    lists: (orgId: string) => [...queryKeys.tools.all(orgId), "list"] as const,
    list: (orgId: string) => [...queryKeys.tools.lists(orgId)] as const,
    listIncludingArchived: (orgId: string) =>
      [...queryKeys.tools.lists(orgId), { includeArchived: true }] as const,
    history: (orgId: string, id: string) =>
      [...queryKeys.tools.all(orgId), "detail", id, "history"] as const,
  },

  systems: {
    all: (orgId: string) => ["systems", orgId] as const,
    lists: (orgId: string) => [...queryKeys.systems.all(orgId), "list"] as const,
    list: (orgId: string) => [...queryKeys.systems.lists(orgId)] as const,
    detail: (orgId: string, id: string) => [...queryKeys.systems.all(orgId), "detail", id] as const,
    tunnels: (orgId: string) => [...queryKeys.systems.all(orgId), "tunnels"] as const,
  },

  runs: {
    all: (orgId: string) => ["runs", orgId] as const,
    lists: (orgId: string) => [...queryKeys.runs.all(orgId), "list"] as const,
    list: (
      orgId: string,
      filters?: {
        search?: string;
        status?: string;
        triggers?: string[];
        timeRange?: string;
        toolId?: string;
      },
    ) => [...queryKeys.runs.lists(orgId), filters ?? {}] as const,
  },

  schedules: {
    all: (orgId: string) => ["schedules", orgId] as const,
    lists: (orgId: string) => [...queryKeys.schedules.all(orgId), "list"] as const,
    list: (orgId: string) => [...queryKeys.schedules.lists(orgId)] as const,
  },

  orgMembers: {
    all: (orgId: string) => ["org-members", orgId] as const,
    lists: (orgId: string) => [...queryKeys.orgMembers.all(orgId), "list"] as const,
    list: (orgId: string) => [...queryKeys.orgMembers.lists(orgId)] as const,
  },

  roles: {
    all: (orgId: string) => ["roles", orgId] as const,
    lists: (orgId: string) => [...queryKeys.roles.all(orgId), "list"] as const,
    list: (orgId: string) => [...queryKeys.roles.lists(orgId)] as const,
  },

  apiKeys: {
    all: (orgId: string) => ["api-keys", orgId] as const,
    lists: (orgId: string) => [...queryKeys.apiKeys.all(orgId), "list"] as const,
    list: (orgId: string) => [...queryKeys.apiKeys.lists(orgId)] as const,
  },

  notifications: {
    all: (orgId: string) => ["notifications", orgId] as const,
    settings: (orgId: string) => [...queryKeys.notifications.all(orgId), "settings"] as const,
  },

  docFiles: {
    all: (orgId: string) => ["doc-files", orgId] as const,
    list: (orgId: string, systemId: string) =>
      [...queryKeys.docFiles.all(orgId), systemId] as const,
  },

  discovery: {
    all: (orgId: string) => ["discovery", orgId] as const,
    lists: (orgId: string) => [...queryKeys.discovery.all(orgId), "list"] as const,
    list: (orgId: string) => [...queryKeys.discovery.lists(orgId)] as const,
    detail: (orgId: string, runId: string) =>
      [...queryKeys.discovery.all(orgId), "detail", runId] as const,
    files: (orgId: string, runId: string) =>
      [...queryKeys.discovery.detail(orgId, runId), "files"] as const,
    filesByIds: (orgId: string, runId: string, fileIdsKey: string) =>
      [...queryKeys.discovery.files(orgId, runId), fileIdsKey] as const,
  },
} as const;
