"use client";

import { AgentInterface } from "@/src/components/agent/AgentInterface";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function AgentPageContent() {
  const searchParams = useSearchParams();
  const prompt = searchParams.get("prompt");

  const initialPrompts = prompt ? { userPrompt: prompt, systemPrompt: "" } : null;

  return (
    <div className="p-6 w-full h-full">
      <AgentInterface initialPrompts={initialPrompts} />
    </div>
  );
}

export default function AgentPage() {
  return (
    <Suspense fallback={<div className="p-6 w-full h-full" />}>
      <AgentPageContent />
    </Suspense>
  );
}
