import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";
import { useEESuperglueClient } from "./use-client";
import { useOrg } from "@/src/app/org-context";
import type { NotificationSettingsResponse } from "@/src/lib/ee-superglue-client";
import type { SlackAuthType, NotificationRule } from "@superglue/shared";

export function useNotificationSettings() {
  const { orgId } = useOrg();
  const createClient = useEESuperglueClient();

  return useQuery<NotificationSettingsResponse>({
    queryKey: queryKeys.notifications.settings(orgId),
    queryFn: async () => {
      const client = createClient();
      return client.getNotificationSettings();
    },
    enabled: !!orgId,
  });
}

export function useUpdateNotificationSettings() {
  const { orgId } = useOrg();
  const createClient = useEESuperglueClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (settings: {
      channels?: {
        slack?: {
          enabled?: boolean;
          authType?: SlackAuthType;
          webhookUrl?: string;
          botToken?: string;
          channelId?: string;
          rules?: NotificationRule[];
        };
      };
    }) => {
      const client = createClient();
      return client.updateNotificationSettings(settings);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all(orgId) });
    },
  });
}

export function useTestNotification() {
  const createClient = useEESuperglueClient();
  return useMutation({
    mutationFn: async ({ channel, baseUrl }: { channel: "slack"; baseUrl?: string }) => {
      const client = createClient();
      return client.testNotification(channel, baseUrl);
    },
  });
}

export function useDeleteNotificationChannel() {
  const { orgId } = useOrg();
  const createClient = useEESuperglueClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (channelId: "slack") => {
      const client = createClient();
      return client.deleteNotificationChannel(channelId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all(orgId) });
    },
  });
}
