import { useQueries, useQuery } from "@tanstack/react-query";
import { MessageReference, Run, System, Tool } from "@superglue/shared";
import { hasResolvedOrgId, useOrgOptional } from "@/src/app/org-context";
import { useSuperglueClient } from "./use-client";
import { queryKeys } from "./query-keys";
import { useMemo } from "react";

// The REST layer clamps page size to 1000, so that is the largest useful request.
const PAGE_SIZE = 1000;
// Safety net against a miscounted total turning pagination into an endless loop.
const MAX_PAGES = 50;
// Runs are searched server-side, so only one page has to be held in memory.
const RUN_PAGE_SIZE = 50;
// Mentionable runs are limited to a recent window. Nothing is deleted - the filter only keeps
// the popover fast and readable, since the run search cannot use an index for its ILIKE scan.
export const RUN_MENTION_WINDOW_DAYS = 2;

async function fetchAllPages<T>(
  fetchPage: (page: number) => Promise<{ items: T[]; total: number }>,
): Promise<T[]> {
  const first = await fetchPage(1);
  const items = [...first.items];
  const total = first.total ?? items.length;

  for (let page = 2; items.length < total && page <= MAX_PAGES; page++) {
    const next = await fetchPage(page);
    if (next.items.length === 0) break;
    items.push(...next.items);
  }

  return items;
}

/**
 * Tools for the mention popover, paginated to the backend's ceiling: the list handler
 * fetches at most 10000 rows from the datastore before filtering, so tools beyond that
 * are not reachable through this endpoint at all.
 */
export function useAllToolsForMentions() {
  const org = useOrgOptional();
  const orgId = org?.orgId;
  const createClient = useSuperglueClient();

  const query = useQuery<Tool[]>({
    // Nested under the app-wide tools prefix so every existing invalidation (e.g. after
    // the agent's save_tool confirmation) refreshes the mention candidates too.
    queryKey: [...queryKeys.tools.all(orgId ?? ""), "mention-source"],
    queryFn: async () => {
      const client = createClient();
      return fetchAllPages((page) => client.listWorkflows(PAGE_SIZE, (page - 1) * PAGE_SIZE));
    },
    enabled: hasResolvedOrgId(orgId),
  });

  return { tools: query.data ?? [], isLoading: query.isLoading };
}

/**
 * Systems for the mention popover, paginated to the backend's ceiling: the list handler
 * always fetches limit 1000 / offset 0 from the datastore and paginates in memory, so an
 * org with more than 1000 systems cannot reach the rest through this endpoint - a
 * platform-wide limit (the systems page shares it), not something this hook can lift.
 */
export function useAllSystemsForMentions() {
  const org = useOrgOptional();
  const orgId = org?.orgId;
  const createClient = useSuperglueClient();

  const query = useQuery<System[]>({
    // Nested under the app-wide systems prefix: creating a system (systems page or the
    // agent's create_system flow) invalidates ["systems", orgId] and this query with it -
    // without this, a freshly created system was only mentionable after a hard refresh.
    queryKey: [...queryKeys.systems.all(orgId ?? ""), "mention-source"],
    queryFn: async () => {
      const client = createClient();
      return fetchAllPages((page) => client.listSystems(PAGE_SIZE, page, { mode: "all" }));
    },
    enabled: hasResolvedOrgId(orgId),
  });

  return { systems: query.data ?? [], isLoading: query.isLoading };
}

/**
 * Runs are the one entity with real server-side search, so instead of loading the whole
 * history the query is pushed to the backend. Every run stays reachable without holding
 * thousands of rows in the browser.
 */
export function useRunsForMentions(search: string) {
  const org = useOrgOptional();
  const orgId = org?.orgId;
  const createClient = useSuperglueClient();
  const trimmed = search.trim();

  const query = useQuery<Run[]>({
    queryKey: [...queryKeys.runs.all(orgId ?? ""), "mention-source", trimmed],
    queryFn: async ({ signal }) => {
      const client = createClient();
      const startedAfter = new Date(Date.now() - RUN_MENTION_WINDOW_DAYS * 24 * 60 * 60 * 1000);
      const result = await client.listRuns({
        limit: RUN_PAGE_SIZE,
        page: 1,
        includeTotal: false,
        search: trimmed || undefined,
        startedAfter,
        signal,
      });
      return result.items;
    },
    enabled: hasResolvedOrgId(orgId),
    placeholderData: (previous) => previous,
  });

  return { runs: query.data ?? [], isLoading: query.isLoading };
}

/**
 * Checks which referenced entities still exist, so chips in the transcript can flag
 * mentions whose target was deleted after the message was sent. Verification is a live
 * by-id lookup on every mount: the state is derived, which is exactly why the warning
 * survives resending or editing the message - the entity simply still does not exist.
 */
export function useMissingReferences(references: MessageReference[]): Set<string> {
  const org = useOrgOptional();
  const orgId = org?.orgId;
  const createClient = useSuperglueClient();

  const unique = useMemo(() => {
    const seen = new Map<string, MessageReference>();
    for (const reference of references) {
      seen.set(`${reference.type}:${reference.id}`, reference);
    }
    return [...seen.values()];
  }, [references]);

  const results = useQueries({
    queries: unique.map((reference) => ({
      queryKey: ["reference-exists", orgId ?? "", reference.type, reference.id],
      enabled: hasResolvedOrgId(orgId),
      staleTime: 30_000,
      retry: 1,
      queryFn: async (): Promise<boolean> => {
        const client = createClient();
        try {
          if (reference.type === "tool") return !!(await client.getWorkflow(reference.id));
          if (reference.type === "run") return !!(await client.getRun(reference.id));
          await client.getSystem(reference.id);
          return true;
        } catch (error: any) {
          // Only a confirmed 404 marks the entity as gone; transient errors must not
          // repaint healthy chips gray.
          if (/404|not found/i.test(error?.message ?? "")) return false;
          throw error;
        }
      },
    })),
  });

  // Stable signature so the Set identity only changes when the actual outcome changes.
  const signature = results
    .map((result, index) =>
      result.data === false ? `${unique[index].type}:${unique[index].id}` : "",
    )
    .filter(Boolean)
    .sort()
    .join("|");

  return useMemo(() => new Set(signature ? signature.split("|") : []), [signature]);
}
