import { UserRole } from "@superglue/shared";

export interface OrganizationMembership {
  id: string;
  displayName: string;
  slug: string;
  role: UserRole;
  createdAt: string;
}

export interface OrgMember {
  userId: string;
  email: string | null;
  name: string | null;
  role: UserRole;
  createdAt: string;
}
