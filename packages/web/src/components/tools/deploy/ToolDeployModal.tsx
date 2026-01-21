import { useConfig } from "@/src/app/config-context";
import { cn } from "@/src/lib/general-utils";
import { Tool } from "@superglue/shared";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bot,
  Calendar,
  CheckCircle,
  ChevronRight,
  Code,
  ExternalLink,
  Webhook,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { CodeSnippet } from "../../editors/ReadonlyCodeEditor";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/tabs";

interface ToolDeployModalProps {
  currentTool: Tool;
  payload: Record<string, any>;
  isOpen: boolean;
  onClose: () => void;
}

export function ToolDeployModal({
  currentTool,
  payload,
  isOpen,
  onClose = () => {},
}: ToolDeployModalProps) {
  const superglueConfig = useConfig();
  const [activeTab, setActiveTab] = useState("schedule");
  const [expandedSdk, setExpandedSdk] = useState<string | null>("typescript");

  // JavaScript/TypeScript SDK code
  const typescriptCode = `import { configure, runTool } from '@superglue/client';

configure({
  apiKey: "<YOUR_SUPERGLUE_API_KEY>", // TODO: Replace with your actual superglue API key
  baseUrl: "${superglueConfig.apiEndpoint}/v1"
});

async function main() {
  const result = await runTool("${currentTool.id}", {
    inputs: ${JSON.stringify(payload, null, 2)}
  });
  console.log(result.data);
}

main();`;

  // Python SDK code
  const pythonCode = `from superglue_client import SuperglueClient
from superglue_client.api.tools import run_tool
from superglue_client.models import RunRequest, RunRequestInputs

client = SuperglueClient(
    base_url="${superglueConfig.apiEndpoint}/v1",
    token="<YOUR_SUPERGLUE_API_KEY>"  # TODO: Replace with your actual superglue API key
)

inputs = RunRequestInputs.from_dict(${JSON.stringify(payload, null, 2)})

with client as client:
    result = run_tool.sync(
        "${currentTool.id}",
        client=client,
        body=RunRequest(inputs=inputs)
    )
    print(result)`;

  // cURL command
  const curlCommand = `curl -X POST "${superglueConfig.apiEndpoint}/v1/tools/${currentTool.id}/run" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer <YOUR_SUPERGLUE_API_KEY>" \\
  -d '${JSON.stringify({
    inputs: payload,
  })}'`;

  // Webhook example
  const webhookExample = `import { configure, runTool } from '@superglue/client';

configure({
  apiKey: "<YOUR_SUPERGLUE_API_KEY>", // TODO: Replace with your actual superglue API key
  baseUrl: "${superglueConfig.apiEndpoint}/v1"
});

await runTool("${currentTool.id}", {
  inputs: ${JSON.stringify(payload, null, 2)},
  options: {
    webhookUrl: "https://your-app.com/webhook" // TODO: Replace with your actual webhook
  }
});`;

  // MCP config
  const mcpConfig = `{
  "mcpServers": {
    "superglue": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "${superglueConfig.apiEndpoint.includes("https://api.superglue") ? "https://mcp.superglue.ai" : `${superglueConfig.superglueEndpoint}/mcp`}",
        "--header",
        "Authorization:\${AUTH_HEADER}"
      ],
      "env": {
        "AUTH_HEADER": "Bearer <YOUR_SUPERGLUE_API_KEY>"
      }
    }
  }
}`;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-x-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Deploy your Tool</span>
            <Button variant="ghost" size="icon" className="shrink-0" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex flex-col overflow-hidden gap-4">
          {/* Tool ID section */}
          <div className="space-y-3 flex-shrink-0">
            <p className="text-muted-foreground">
              Your tool is ready to use in production. Choose how you want to deploy it:
            </p>
          </div>

          {/* Tabs */}
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full flex-1 flex flex-col overflow-hidden"
          >
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="sdk" className="gap-2">
                <Code className="h-4 w-4" />
                <span className="hidden sm:inline">SDK/API</span>
              </TabsTrigger>
              <TabsTrigger value="mcp" className="gap-2">
                <Bot className="h-4 w-4" />
                <span className="hidden sm:inline">MCP</span>
              </TabsTrigger>
              <TabsTrigger value="webhook" className="gap-2">
                <Webhook className="h-4 w-4" />
                <span className="hidden sm:inline">Webhooks</span>
              </TabsTrigger>
              <TabsTrigger value="schedule" className="gap-2">
                <Calendar className="h-4 w-4" />
                <span className="hidden sm:inline">Schedule</span>
              </TabsTrigger>
            </TabsList>

            {/* SDK/API Tab */}
            {activeTab === "sdk" && (
              <TabsContent value="sdk" className="mt-4 overflow-y-auto overflow-x-hidden flex-1">
                <div className="space-y-2 mb-4">
                  <p className="text-muted-foreground">
                    For programmatic execution, use our JavaScript or Python SDK, or access the REST
                    API directly via cURL. You'll find your tool-specific code snippets below.
                    Simply replace the placeholder with your superglue API key.
                  </p>
                </div>

                {/* TypeScript / JavaScript */}
                <div className="min-w-0">
                  <button
                    onClick={() =>
                      setExpandedSdk(expandedSdk === "typescript" ? null : "typescript")
                    }
                    className="w-full flex items-center py-3 px-0 hover:!bg-transparent focus:outline-none cursor-pointer"
                  >
                    <ChevronRight
                      className={cn(
                        "h-4 w-4 mr-2 transition-transform",
                        expandedSdk === "typescript" && "rotate-90",
                      )}
                    />
                    <span className="text-sm">JavaScript</span>
                  </button>
                  <AnimatePresence initial={false}>
                    {expandedSdk === "typescript" && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeInOut" }}
                        className="overflow-x-hidden pb-3"
                      >
                        {/* Install */}
                        <div className="mt-3">
                          <div className="text-xs text-muted-foreground mb-2">Install</div>
                          <CodeSnippet code="npm install @superglue/client" language="bash" />
                        </div>

                        {/* Code */}
                        <div className="mt-4">
                          <div className="text-xs text-muted-foreground mb-2">Code</div>
                          <CodeSnippet code={typescriptCode} language="typescript" />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Python */}
                <div className="min-w-0">
                  <button
                    onClick={() => setExpandedSdk(expandedSdk === "python" ? null : "python")}
                    className="w-full flex items-center py-3 px-0 hover:!bg-transparent focus:outline-none cursor-pointer"
                  >
                    <ChevronRight
                      className={cn(
                        "h-4 w-4 mr-2 transition-transform",
                        expandedSdk === "python" && "rotate-90",
                      )}
                    />
                    <span className="text-sm">Python</span>
                  </button>
                  <AnimatePresence initial={false}>
                    {expandedSdk === "python" && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeInOut" }}
                        className="overflow-x-hidden pb-3"
                      >
                        {/* Install */}
                        <div className="mt-3">
                          <div className="text-xs text-muted-foreground mb-2">Install</div>
                          <CodeSnippet code="pip install superglue-client" language="bash" />
                        </div>

                        {/* Code */}
                        <div className="mt-4">
                          <div className="text-xs text-muted-foreground mb-2">Code</div>
                          <CodeSnippet code={pythonCode} language="python" />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* cURL */}
                <div className="min-w-0">
                  <button
                    onClick={() => setExpandedSdk(expandedSdk === "curl" ? null : "curl")}
                    className="w-full flex items-center py-3 px-0 hover:!bg-transparent focus:outline-none cursor-pointer"
                  >
                    <ChevronRight
                      className={cn(
                        "h-4 w-4 mr-2 transition-transform",
                        expandedSdk === "curl" && "rotate-90",
                      )}
                    />
                    <span className="text-sm">cURL</span>
                  </button>
                  <AnimatePresence initial={false}>
                    {expandedSdk === "curl" && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeInOut" }}
                        className="overflow-x-hidden pb-3"
                      >
                        <CodeSnippet code={curlCommand} language="bash" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="text-sm text-muted-foreground mt-5">
                  <a
                    href="https://docs.superglue.cloud/sdk/overview"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:underline"
                  >
                    Learn more about the SDK
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </TabsContent>
            )}

            {/* Webhooks Tab */}
            {activeTab === "webhook" && (
              <TabsContent
                value="webhook"
                className="flex flex-col gap-4 mt-4 overflow-y-auto flex-1"
              >
                <Card className="border-destructive/50 bg-destructive/10 p-4">
                  <p className="text-sm">
                    This is an enterprise feature.{" "}
                    <a
                      href="https://cal.com/superglue/superglue-demo"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-destructive"
                    >
                      Get in touch with us
                    </a>{" "}
                    to enable it.
                  </p>
                </Card>
              </TabsContent>
            )}
            {/* Schedule Tab */}
            {activeTab === "schedule" && (
              <TabsContent
                value="schedule"
                className="flex flex-col gap-6 mt-4 overflow-y-auto flex-1"
              >
                <Card className="border-destructive/50 bg-destructive/10 p-4">
                  <p className="text-sm">
                    This is an enterprise feature.{" "}
                    <a
                      href="https://cal.com/superglue/superglue-demo"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-destructive"
                    >
                      Get in touch with us
                    </a>{" "}
                    to enable it.
                  </p>
                </Card>
              </TabsContent>
            )}

            {/* MCP Tab */}
            {activeTab === "mcp" && (
              <TabsContent value="mcp" className="flex flex-col gap-4 mt-4 overflow-y-auto flex-1">
                <div className="space-y-2">
                  <p className="text-muted-foreground">
                    Make this tool available to Claude, Cursor, or any MCP-compatible agent. Simply
                    replace the placeholder with your superglue API key.
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <div className="text-sm font-medium mb-2">
                      1. Add superglue MCP server to your config
                    </div>
                    <CodeSnippet code={mcpConfig} language="json" />
                  </div>

                  <div>
                    <div className="text-sm font-medium mb-2">2. Use in your AI agent</div>
                    <CodeSnippet
                      code={`Please execute the superglue tool "${currentTool.id}"`}
                      language="bash"
                    />
                  </div>
                </div>

                <div className="text-sm text-muted-foreground mt-2">
                  <a
                    href="https://docs.superglue.cloud/mcp/using-the-mcp"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:underline"
                  >
                    Learn more about using your tools via MCP
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </TabsContent>
            )}
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
