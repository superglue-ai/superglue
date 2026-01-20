"use client";
import { ToolCreateStepper } from "@/src/components/tools/ToolCreateStepper";
import { useSearchParams } from "next/navigation";

export default function NewToolPage() {
  const searchParams = useSearchParams();

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

  const skipParam = searchParams.get("skip");
  const initialView = skipParam === "systems" ? "instructions" : "systems";

  return (
    <ToolCreateStepper
      initialSystemIds={systemIds}
      initialView={initialView as "systems" | "instructions"}
    />
  );
}
