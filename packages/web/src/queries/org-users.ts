import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useCallback } from "react";
import type { OrgMember, OrgInvitation, EndUserCredentialStatus, Role } from "@superglue/shared";
import { queryKeys } from "./query-keys";
import { useEESuperglueClient } from "./use-client";
import { hasResolvedOrgId, useOrg } from "@/src/app/org-context";

export interface OrgUser {
  id: string;
  email: string | null;
  name: string | null;
  userType: "member" | "end_user";
  roleIds: string[];
  createdAt?: string;
  externalId?: string;
  metadata?: Record<string, any>;
  credentials?: EndUserCredentialStatus[];
}

function toOrgUser(m: OrgMember): OrgUser {
  return {
    id: m.id,
    email: m.email,
    name: m.name,
    userType: m.userType,
    roleIds: m.roleIds,
    createdAt: m.createdAt,
    externalId: m.externalId,
    metadata: m.metadata,
    credentials: m.credentials,
  };
}

export function useOrgUsers() {
  const { orgId } = useOrg();
  const createClient = useEESuperglueClient();
  const queryClient = useQueryClient();

  // Members query
  const membersQuery = useQuery({
    queryKey: queryKeys.orgMembers.list(orgId),
    queryFn: async () => {
      const client = createClient();
      const data = await client.listOrgMembers();
      return {
        members: data.members.map(toOrgUser),
        invitations: data.invitations,
      };
    },
    enabled: hasResolvedOrgId(orgId),
  });

  // Roles query
  const rolesQuery = useQuery({
    queryKey: queryKeys.roles.list(orgId),
    queryFn: async () => {
      const client = createClient();
      return client.listRoles();
    },
    enabled: hasResolvedOrgId(orgId),
  });

  const allUsers = membersQuery.data?.members ?? [];
  const invitations = membersQuery.data?.invitations ?? [];
  const roles = rolesQuery.data ?? [];

  // Derived data (useMemo)
  const { users, members, endUsers } = useMemo(() => {
    const memberList = allUsers.filter((u) => u.userType === "member");
    const endUserList = allUsers.filter((u) => u.userType === "end_user");
    return { users: allUsers, members: memberList, endUsers: endUserList };
  }, [allUsers]);

  const userMap = useMemo(() => {
    const map = new Map<string, OrgUser>();
    for (const user of users) {
      map.set(user.id, user);
    }
    return map;
  }, [users]);

  const roleUserCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const role of roles) {
      if (role.id === "admin" || role.id === "member") {
        counts[role.id] = members.filter((u) => u.roleIds.includes(role.id)).length;
      } else if (role.id === "enduser") {
        counts[role.id] = endUsers.filter((u) => u.roleIds.includes(role.id)).length;
      } else {
        counts[role.id] = allUsers.filter((u) => u.roleIds.includes(role.id)).length;
      }
    }
    return counts;
  }, [roles, members, endUsers, allUsers]);

  // toggleUserRole mutation with optimistic update
  const toggleRoleMutation = useMutation({
    mutationFn: async ({
      userId,
      roleId,
      checked,
    }: {
      userId: string;
      roleId: string;
      checked: boolean;
    }) => {
      const client = createClient();
      if (checked) {
        await client.addUserRoles(userId, [roleId]);
      } else {
        await client.removeUserRole(userId, roleId);
      }
    },
    onMutate: async ({ userId, roleId, checked }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.orgMembers.list(orgId) });
      const previous = queryClient.getQueryData<OrgUser[]>(queryKeys.orgMembers.list(orgId));
      queryClient.setQueryData<OrgUser[]>(queryKeys.orgMembers.list(orgId), (old) =>
        (old ?? []).map((u) => {
          if (u.id !== userId) return u;
          const roleIds = checked
            ? [...u.roleIds, roleId]
            : u.roleIds.filter((id) => id !== roleId);
          return { ...u, roleIds };
        }),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.orgMembers.list(orgId), context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.roles.list(orgId) });
    },
  });

  // createRole mutation
  const createRoleMutation = useMutation({
    mutationFn: async (name: string) => {
      const client = createClient();
      await client.createRole({ name });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.roles.list(orgId) });
    },
  });

  // Lookup helpers
  const getUserById = useCallback(
    (userId: string | null | undefined): OrgUser | null => {
      if (!userId) return null;
      return userMap.get(userId) || null;
    },
    [userMap],
  );

  const getUserDisplayName = useCallback(
    (userId: string | null | undefined): string | null => {
      const user = getUserById(userId);
      if (!user) return null;
      return user.name || user.email || user.externalId || user.id;
    },
    [getUserById],
  );

  const getUserEmail = useCallback(
    (userId: string | null | undefined): string | null => {
      const user = getUserById(userId);
      return user?.email || null;
    },
    [getUserById],
  );

  const getUsersForRole = useCallback(
    (roleId: string): OrgUser[] => {
      if (roleId === "admin" || roleId === "member") {
        return members.filter((u) => u.roleIds.includes(roleId));
      }
      if (roleId === "enduser") {
        return endUsers.filter((u) => u.roleIds.includes(roleId));
      }
      return allUsers.filter((u) => u.roleIds.includes(roleId));
    },
    [members, endUsers, allUsers],
  );

  return {
    users,
    members,
    endUsers,
    invitations,
    roles,
    isLoading: membersQuery.isLoading || rolesQuery.isLoading,
    isRefetching: membersQuery.isRefetching || rolesQuery.isRefetching,
    error: membersQuery.error?.message || rolesQuery.error?.message || null,
    refetch: async () => {
      await Promise.all([membersQuery.refetch(), rolesQuery.refetch()]);
    },
    refetchRoles: () => rolesQuery.refetch(),
    toggleUserRole: (userId: string, roleId: string, checked: boolean) =>
      toggleRoleMutation.mutateAsync({ userId, roleId, checked }),
    createRole: (name: string) => createRoleMutation.mutateAsync(name),
    getUserById,
    getUserDisplayName,
    getUserEmail,
    roleUserCounts,
    getUsersForRole,
  };
}
