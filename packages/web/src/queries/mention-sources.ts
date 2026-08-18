import { useQueries, useQuery } from "@tanstack/react-query";
import { MessageReference, Run, System, Tool } from "@superglue/shared";
import { hasResolvedOrgId, useOrgOptional } from "@/src/app/org-context";
import { useSuperglueClient } from "./use-client";
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

/** Every tool the user may see - the mention popover must not hide any of them. */
export function useAllToolsForMentions() {
  const org = useOrgOptional();
  const orgId = org?.orgId;
  const createClient = useSuperglueClient();

  const query = useQuery<Tool[]>({
    queryKey: ["mention-sources", "tools", orgId ?? ""],
    queryFn: async () => {
      const client = createClient();
      return fetchAllPages((page) => client.listWorkflows(PAGE_SIZE, (page - 1) * PAGE_SIZE));
    },
    enabled: hasResolvedOrgId(orgId),
  });

  return { tools: query.data ?? [], isLoading: query.isLoading };
}

/** Every system the user may see, across environments. */
export function useAllSystemsForMentions() {
  const org = useOrgOptional();
  const orgId = org?.orgId;
  const createClient = useSuperglueClient();

  const query = useQuery<System[]>({
    queryKey: ["mention-sources", "systems", orgId ?? ""],
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
    queryKey: ["mention-sources", "runs", orgId ?? "", trimmed],
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
