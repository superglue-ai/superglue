import { Tool } from "@superglue/shared";
import { Bot, Calendar, Code, ExternalLink, Info, Webhook, X } from "lucide-react";
import { useEffect, useState } from "react";
import { CodeSnippet } from "../../editors/ReadonlyCodeEditor";
import { Button } from "../../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/tabs";
import { SdkAccordion } from "./SdkAccordion";
import { useToolCodeSnippets } from "./useToolCodeSnippets";

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
  const [activeTab, setActiveTab] = useState("schedule");

  const snippets = useToolCodeSnippets(currentTool.id, payload);

  useEffect(() => {
    if (isOpen) {
      setActiveTab("schedule");
    }
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-x-hidden flex flex-col">
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
              <TabsTrigger value="schedule" className="gap-2">
                <Calendar className="h-4 w-4" />
                <span className="hidden sm:inline">Schedule</span>
              </TabsTrigger>
              <TabsTrigger value="sdk" className="gap-2">
                <Code className="h-4 w-4" />
                <span className="hidden sm:inline">SDK/API</span>
              </TabsTrigger>
              <TabsTrigger value="webhook" className="gap-2">
                <Webhook className="h-4 w-4" />
                <span className="hidden sm:inline">Webhooks</span>
              </TabsTrigger>
              <TabsTrigger value="mcp" className="gap-2">
                <Bot className="h-4 w-4" />
                <span className="hidden sm:inline">MCP</span>
              </TabsTrigger>
            </TabsList>

            {/* Schedule Tab */}
            {activeTab === "schedule" && (
              <TabsContent
                value="schedule"
                className="flex flex-col gap-6 mt-4 overflow-y-auto flex-1"
              >
                <div className="space-y-2">
                  <p className="text-muted-foreground">
                    Automate your workflow by scheduling it to run at specific times or intervals.
                  </p>
                </div>

                <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/50 p-4">
                  <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-blue-900 dark:text-blue-100">
                      Enterprise Feature
                    </p>
                    <p className="text-blue-700 dark:text-blue-300 mt-1">
                      Scheduled execution is available on our Enterprise plan.{" "}
                      <a
                        href="https://cal.com/superglue/superglue-demo"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-blue-900 dark:hover:text-blue-100 inline-flex items-center gap-1"
                      >
                        Book a demo
                        <ExternalLink className="h-3 w-3" />
                      </a>{" "}
                      to learn more.
                    </p>
                  </div>
                </div>

                <div className="text-sm text-muted-foreground ">
                  <a
                    href="https://docs.superglue.cloud/guides/deploying-a-tool#scheduled-execution"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:underline"
                  >
                    Learn more about scheduling tools
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </TabsContent>
            )}

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

                <SdkAccordion
                  typescriptCode={snippets.typescriptCode}
                  pythonCode={snippets.pythonCode}
                  curlCommand={snippets.curlCommand}
                  variant="modal"
                  defaultExpanded="typescript"
                />
              </TabsContent>
            )}

            {/* Webhooks Tab */}
            {activeTab === "webhook" && (
              <TabsContent
                value="webhook"
                className="flex flex-col gap-6 mt-4 overflow-y-auto flex-1"
              >
                <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/50 p-4">
                  <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-blue-900 dark:text-blue-100">
                      Enterprise Feature
                    </p>
                    <p className="text-blue-700 dark:text-blue-300 mt-1">
                      Webhooks are available on our Enterprise plan.{" "}
                      <a
                        href="https://cal.com/superglue/superglue-demo"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-blue-900 dark:hover:text-blue-100 inline-flex items-center gap-1"
                      >
                        Book a demo
                        <ExternalLink className="h-3 w-3" />
                      </a>{" "}
                      to learn more.
                    </p>
                  </div>
                </div>

                <div className="text-sm text-muted-foreground">
                  <a
                    href="https://docs.superglue.cloud/api/overview#webhooks"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:underline"
                  >
                    Learn more about webhooks in superglue
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
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
                    <CodeSnippet code={snippets.mcpConfig} language="json" />
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