"use client";
import ToolPlayground from "@/src/components/tools/ToolPlayground";
import { useParams, useSearchParams } from "next/navigation";

export default function ToolsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const restoreRunId = searchParams.get("restoreRunId") ?? undefined;

  return <ToolPlayground id={id} embedded={false} restoreRunId={restoreRunId} />;
}
