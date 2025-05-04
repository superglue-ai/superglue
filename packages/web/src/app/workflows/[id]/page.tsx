"use client";
import WorkflowPlayground from "@/src/components/workflow/WorkflowPlayground";
import { useParams } from "next/navigation";

export default function WorkflowsPage() {
  const params = useParams();
  const id = params.id as string;

  return <WorkflowPlayground id={id}/>
}
