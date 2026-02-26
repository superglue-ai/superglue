"use client";

import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { AgentInterface } from "@/src/components/agent/AgentInterface";

export default function Main() {
  const searchParams = useSearchParams();
  const promptParam = searchParams.get("prompt");

  const initialPrompts = useMemo(() => {
    if (!promptParam) return null;
    return {
      userPrompt: promptParam,
      systemPrompt: "",
    };
  }, [promptParam]);

  return <AgentInterface initialPrompts={initialPrompts} />;
}
