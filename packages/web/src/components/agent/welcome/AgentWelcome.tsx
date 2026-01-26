"use client";

import { Card } from "@/src/components/ui/card";
import { BadgeInfo, HelpCircle, PlugZap, Users } from "lucide-react";
import React, { useImperativeHandle, useState } from "react";
import { AgentWelcomeToolLibrary } from "./AgentWelcomeToolLibrary";
import { AgentWelcomeExamples } from "./AgentWelcomeExamples";

const EXAMPLES = {
  EXAMPLE: {
    title: "Give me an example",
    description: "Find out how superglue can help you",
  },
  CAPABILITIES: {
    title: "What can superglue do for you?",
    description: "Explain superglue's capabilities",
    user: "What can I do with superglue?",
    system:
      "Dont answer using emojies! You are explaining Superglue's capabilities to a new user. Be comprehensive but concise. Answer in a nice Markdown format. To the first question, answer in about 10 sentences. Dont use emohies like the rocket or checkmarks or any other.",
  },
  SYSTEM: {
    title: "Set up an integration",
    description: "Let superglue build your first integration",
    user: "Hey superglue, can you help me set up a system?",
    system:
      "You are helping the user build a system. Ask with which system they want to connect with - give a couple examples like slack, github, asana, etc. Group them into categories. Explain to the user that you might need an api key or oauth credentials for some systems, but superglue will help with the setup. Answer in less than 5 sentences.",
  },
  TEMPLATES: {
    title: "What are other people building?",
    description: "Explore a library of production ready tools",
    user: "What are other people building with superglue?",
    system:
      "Very important:When the user asks what other people are building with superglue, tell the user, that the tool library will be comming very soon. Dont do any web searches or think of any examples. Only tell the user that the tool library will be comming very soon.",
  },
};

export interface AgentWelcomeRef {
  cleanup: () => void;
}

interface AgentWelcomeProps {
  onStartPrompt: (userPrompt: string, systemPrompt?: string) => void;
  ref?: React.Ref<AgentWelcomeRef>;
}

export function AgentWelcome({ onStartPrompt, ref }: AgentWelcomeProps) {
  const [showToolLibrary, setShowToolLibrary] = useState(false);
  const [showToolExamples, setShowToolExamples] = useState(false);

  const cleanup = () => {
    setShowToolLibrary(false);
    setShowToolExamples(false);
  };

  useImperativeHandle(ref, () => ({
    cleanup,
  }));

  return (
    <div className="space-y-6 p-6">
      <div className="text-center space-y-4">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">Hi there.</h2>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mx-auto max-w-3xl">
        <Card
          className="p-4 hover:bg-muted/30 transition-colors cursor-pointer border-2 hover:border-primary/20"
          onClick={() => onStartPrompt(EXAMPLES.CAPABILITIES.user, EXAMPLES.CAPABILITIES.system)}
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
              <HelpCircle className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="space-y-1">
              <h3 className="font-medium text-sm">{EXAMPLES.CAPABILITIES.title}</h3>
              <p className="text-xs text-muted-foreground">{EXAMPLES.CAPABILITIES.description}</p>
            </div>
          </div>
        </Card>

        <Card
          className="p-4 hover:bg-muted/30 transition-colors cursor-pointer border-2 hover:border-primary/20"
          onClick={() => {
            setShowToolExamples(!showToolExamples);
            setShowToolLibrary(false);
          }}
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
              <BadgeInfo className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="space-y-1">
              <h3 className="font-medium text-sm">{EXAMPLES.EXAMPLE.title}</h3>
              <p className="text-xs text-muted-foreground">{EXAMPLES.EXAMPLE.description}</p>
            </div>
          </div>
        </Card>

        <Card
          className="p-4 hover:bg-muted/30 transition-colors cursor-pointer border-2 hover:border-primary/20"
          onClick={() => onStartPrompt(EXAMPLES.SYSTEM.user, EXAMPLES.SYSTEM.system)}
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
              <PlugZap className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div className="space-y-1">
              <h3 className="font-medium text-sm">{EXAMPLES.SYSTEM.title}</h3>
              <p className="text-xs text-muted-foreground">{EXAMPLES.SYSTEM.description}</p>
            </div>
          </div>
        </Card>

        <Card
          className="p-4 hover:bg-muted/30 transition-colors cursor-pointer border-2 hover:border-primary/20"
          onClick={() => {
            setShowToolLibrary(!showToolLibrary);
            setShowToolExamples(false);
          }}
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
              <Users className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div className="space-y-1">
              <h3 className="font-medium text-sm">{EXAMPLES.TEMPLATES.title}</h3>
              <p className="text-xs text-muted-foreground">{EXAMPLES.TEMPLATES.description}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Show tool examples below the suggestions */}
      {showToolExamples && (
        <AgentWelcomeExamples
          onStartPrompt={onStartPrompt}
          onDismiss={() => setShowToolExamples(false)}
        />
      )}

      {/* Show tool library below the suggestions */}
      {showToolLibrary && (
        <AgentWelcomeToolLibrary
          onDismiss={() => setShowToolLibrary(false)}
          onStartPrompt={onStartPrompt}
        />
      )}
    </div>
  );
}
