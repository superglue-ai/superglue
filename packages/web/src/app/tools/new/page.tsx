"use client";
import { ToolCreateStepper } from "@/src/components/tools/ToolCreateStepper";
import { useSearchParams } from "next/navigation";

export default function NewToolPage() {
  const searchParams = useSearchParams();

  // - integration=single-id (for preselecting one)
  // - integrations=id1,id2,id3 (for preselecting multiple)
  const singleIntegration = searchParams.get("integration");
  const multipleIntegrations = searchParams.get("integrations");

  let integrationIds: string[] = [];
  if (multipleIntegrations) {
    integrationIds = multipleIntegrations
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
  } else if (singleIntegration) {
    integrationIds = [singleIntegration.trim()];
  }

  // Parse skip param: skip=integrations means skip integration selection, go straight to instructions
  const skipParam = searchParams.get("skip");
  const initialView = skipParam === "integrations" ? "instructions" : "integrations";

  return (
    <ToolCreateStepper
      initialIntegrationIds={integrationIds}
      initialView={initialView as "integrations" | "instructions"}
    />
  );
}
