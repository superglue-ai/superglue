"use client";

import { cn } from "@/src/lib/general-utils";
import { ChevronRight, ExternalLink, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "@/src/hooks/use-toast";
import { loadToolTemplate } from "@/src/lib/tool-templates/tool-templates";
import { tokenRegistry } from "@/src/lib/token-registry";
import { SuperglueClient } from "@superglue/shared";
import { useConfig } from "@/src/app/config-context";
import { getSimpleIcon } from "@/src/lib/general-utils";

type PopularTool = {
  id: string;
  simpleIcon?: string;
  logo?: string;
  name: string;
};

const POPULAR_TOOLS: PopularTool[] = [
  {
    id: "notion_create_page",
    simpleIcon: "notion",
    name: "Create a page in your Notion workspace",
  },
  {
    id: "stripe_create_payment_intent",
    simpleIcon: "stripe",
    name: "Create Stripe PaymentIntent with amount and currency",
  },
  {
    id: "stripe_create_customer",
    simpleIcon: "stripe",
    name: "Create a customer in Stripe",
  },
  {
    id: "airtable_list_records",
    simpleIcon: "airtable",
    name: "List records from your Airtable workspace",
  },
  {
    id: "elevenlabs_list_voices",
    simpleIcon: "elevenlabs",
    name: "List voices from ElevenLabs",
  },
  {
    id: "confluence_page_create",
    simpleIcon: "confluence",
    name: "Create a new page in Confluence",
  },
  {
    id: "confluence_page_search",
    simpleIcon: "confluence",
    name: "Search pages in Confluence",
  },
  {
    id: "coupa_list_suppliers",
    logo: "/logos/coupa_colour.png",
    name: "List suppliers from Coupa",
  },
];

function shuffleWithSeed<T>(array: T[], seed: number): T[] {
  const result = [...array];
  let state = seed;
  const random = () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

function getSystemPrompt(id: string, description: string, inputSchema: object): string {
  return `[SYSTEM] IMPORTANT: The user selected the pre-built tool "${id}"

Description: ${description}

Input Schema (read this carefully):
${JSON.stringify(inputSchema)}

Your task:
1. Short answer to the user's decision to use this tool
2. Explain what this tool does (section: "What this tool does")
3. List the required parameters from inputSchema (section: "What I need from you")
4. Ask if the user needs help finding the parameters. If so, provide an hands-on guide how to find them. This includes:
   - Create or find the auth credentials such as the personal API key
   - Find the ID of resources such as the page id, parent id, space id, etc.
   - Find the subdomain
5. ONLY AFTER receiving ALL needed values, call execute_tool with the complete parameters

When you have all values, call execute_tool with this structure:
{
  "id": "${id}",
  "payload": {
    ...all parameters from inputSchema
  }
}

Style:
- Do not use horizontal lines at all (no markdown thematic breaks)
- Use markdown headers and bullets
- Be friendly and conversational`;
}

interface AgentWelcomeToolLibraryProps {
  onDismiss?: () => void;
  onStartPrompt: (
    userPrompt: string,
    systemPrompt?: string,
    options?: { hideUserMessage?: boolean },
  ) => void;
}

export function AgentWelcomeToolLibrary({
  onDismiss,
  onStartPrompt,
}: AgentWelcomeToolLibraryProps) {
  const [popularTools, setPopularTools] = useState<PopularTool[]>([]);
  const config = useConfig();

  useEffect(() => {
    const currentHourSeed = Math.floor(Date.now() / (1000 * 60 * 60));
    const allToolsShuffled = shuffleWithSeed(POPULAR_TOOLS, currentHourSeed);
    const popularToolsReduced = allToolsShuffled.slice(0, 4);
    setPopularTools(popularToolsReduced);
  }, []);

  const handleClick = async (toolId: string) => {
    try {
      const template = loadToolTemplate(toolId);
      if (!template) {
        toast({
          title: "Error",
          description: "Tool template not found",
          variant: "destructive",
        });
        return;
      }

      const client = new SuperglueClient({
        endpoint: config.superglueEndpoint,
        apiKey: tokenRegistry.getToken(),
        apiEndpoint: config.apiEndpoint,
      });

      const prefixedId = `template-${template.id}`;
      await client.upsertWorkflow(prefixedId, {
        instruction: template.instruction,
        steps: template.steps,
        inputSchema: template.inputSchema,
        systemIds: template.systemIds,
        responseSchema: template.responseSchema,
        finalTransform: template.finalTransform,
      });

      onDismiss?.();

      const systemPrompt = getSystemPrompt(
        prefixedId,
        template.description || template.instruction,
        template.inputSchema,
      );
      onStartPrompt(`I want to test the "${prefixedId}" tool.`, systemPrompt, {
        hideUserMessage: true,
      });
    } catch (error: any) {
      console.error("Error setting up tool:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to set up tool",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="relative">
        {onDismiss && (
          <div className="flex justify-end mb-2">
            <button
              onClick={onDismiss}
              className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center",
                "bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20",
                "text-muted-foreground hover:text-foreground",
                "transition-all duration-200",
              )}
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {popularTools.map((tool) => (
            <button
              key={tool.id}
              onClick={() => handleClick(tool.id)}
              className={cn(
                "group relative w-full text-left p-3 rounded-xl transition-all duration-200",
                "bg-gradient-to-br from-white/60 to-white/30 dark:from-white/10 dark:to-white/5",
                "backdrop-blur-sm border border-black/5 dark:border-white/10",
                "hover:border-black/10 dark:hover:border-white/20",
                "hover:shadow-sm",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                    {tool.simpleIcon &&
                      (() => {
                        const icon = getSimpleIcon(tool.simpleIcon);
                        return icon ? (
                          <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill={`#${icon.hex}`}
                            key={tool.simpleIcon}
                          >
                            <path d={icon.path} />
                          </svg>
                        ) : null;
                      })()}
                    {tool.logo && (
                      <img
                        width={18}
                        height={18}
                        src={tool.logo}
                        className="w-[18px] h-[18px] object-contain"
                      />
                    )}
                  </div>
                  <span className="text-sm text-foreground/80 group-hover:text-foreground truncate transition-colors">
                    {tool.name}
                  </span>
                </div>
                <div
                  className={cn(
                    "w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0",
                    "bg-black/5 dark:bg-white/10 group-hover:bg-black/10 dark:group-hover:bg-white/20",
                    "transition-all duration-200 group-hover:translate-x-0.5",
                  )}
                >
                  <ChevronRight className="w-3 h-3 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="mt-3 text-center">
          <a
            href="https://superglue.ai/tools/"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "inline-flex items-center gap-1.5 text-xs",
              "text-muted-foreground/70 hover:text-foreground/80",
              "transition-colors duration-200",
            )}
          >
            Explore more tools in our library
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  );
}
