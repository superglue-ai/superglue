import { useEffect, useState } from "react";
import { decodeJWTPayload } from "../lib/jwt-utils";
import { useToken } from "./use-token";

export function useJWTOrgInfos() {
  const [currentOrgId, setCurrentOrgId] = useState<string>("");
  const [currentOrgName, setCurrentOrgName] = useState<string>("");
  const [isPersonalOrg, setIsPersonalOrg] = useState<boolean>(false);

  const token = useToken();
  const isSingleTenant = !!process.env.NEXT_PUBLIC_SUPERGLUE_API_KEY;

  useEffect(() => {
    // In single-tenant mode, skip JWT decoding (no org info)
    if (isSingleTenant) {
      setCurrentOrgId("");
      setCurrentOrgName("");
      setIsPersonalOrg(false);
      return;
    }

    if (token) {
      const payload = decodeJWTPayload(token);

      if (!payload) {
        setCurrentOrgId("");
        setCurrentOrgName("");
        setIsPersonalOrg(false);
        return;
      }

      setCurrentOrgId(payload.app_metadata?.active_org_id);
      setCurrentOrgName(payload.app_metadata?.active_org_name);
      setIsPersonalOrg(payload.app_metadata?.active_org_name === "Personal");
    }
  }, [token, isSingleTenant]);

  return { currentOrgId, currentOrgName, isPersonalOrg };
}
