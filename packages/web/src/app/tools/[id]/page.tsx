"use client";
import ToolPlayground from "@/src/components/tools/ToolPlayground";
import { useParams } from "next/navigation";

export default function ToolsPage() {
  const params = useParams();
  const id = params.id as string;

  return <ToolPlayground id={id}/>
}
