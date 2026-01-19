"use client";
import { ToolCreateStepper } from "@/src/components/tools/ToolCreateStepper";
import { useSearchParams } from "next/navigation";

export default function NewToolPage() {
  const searchParams = useSearchParams();

  // -  =single-id (for preselecting one)
  // - systems=id1,id2,id3 (for preselecting multiple)
  const singleSystem = searchParams.get("system");
  const multipleSystems = searchParams.get("systems");

  let systemIds: string[] = [];
  if (multipleSystems) {
    systemIds = multipleSystems
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
  } else if (singleSystem) {
    systemIds = [singleSystem.trim()];
  }

  // Parse skip param: skip=systems means skip system selection, go straight to instructions
  const skipParam = searchParams.get("skip");
  const initialView = skipParam === "systems" ? "instructions" : "systems";

  return (
    <ToolCreateStepper
      initialSystemIds={systemIds}
      initialView={initialView as "systems" | "instructions"}
    />
  );
}
