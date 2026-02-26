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

function EnterpriseBanner({ feature }: { feature: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/50 p-4">
      <Info className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
      <div>
        <p className="text-sm font-medium">{feature} is an Enterprise feature</p>
        <p className="text-sm text-muted-foreground mt-1">
          Upgrade to superglue Enterprise to use {feature.toLowerCase()}s. Visit{" "}
          <a
            href="https://superglue.cloud"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            superglue.ai
          </a>{" "}
          to learn more.
        </p>
      </div>
    </div>
  );
}

export function ToolDeployModal({
  currentTool,
  payload,
  isOpen,
  onClose = () => {},
}: ToolDeployModalProps) {
  const [activeTab, setActiveTab] = useState("sdk");

  const snippets = useToolCodeSnippets(currentTool.id, payload);

  useEffect(() => {
    if (isOpen) {
      setActiveTab("sdk");
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
          <div className="space-y-3 flex-shrink-0">
            <p className="text-muted-foreground">
              Your tool is ready to use in production. Choose how you want to deploy it:
            </p>
          </div>

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

            {activeTab === "schedule" && (
              <TabsContent
                value="schedule"
                className="flex flex-col gap-6 mt-4 overflow-y-auto flex-1"
              >
                <EnterpriseBanner feature="Scheduling" />
              </TabsContent>
            )}

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

            {activeTab === "webhook" && (
              <TabsContent
                value="webhook"
                className="flex flex-col gap-6 mt-4 overflow-y-auto flex-1"
              >
                <div className="space-y-3">
                  <div>
                    <h3 className="text-sm font-medium mb-1">Trigger via Webhook</h3>
                    <p className="text-muted-foreground text-sm">
                      Trigger this tool from external services like Stripe, GitHub, or any system
                      that can send HTTP POST requests. The request body becomes the tool's input.
                    </p>
                  </div>

                  <div>
                    <div className="text-xs text-muted-foreground mb-2">Webhook URL</div>
                    <CodeSnippet code={snippets.webhookUrl} language="bash" />
                  </div>

                  <div>
                    <div className="text-xs text-muted-foreground mb-2">Example</div>
                    <CodeSnippet code={snippets.webhookCurl} language="bash" />
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Create an API key at{" "}
                    <a href="/api-keys" className="underline hover:text-foreground">
                      API Keys
                    </a>{" "}
                    and configure this URL in your external service's webhook settings.
                  </p>
                </div>

                <hr className="border-border" />

                <div className="space-y-3">
                  <div>
                    <h3 className="text-sm font-medium mb-1">Notify on Completion</h3>
                    <p className="text-muted-foreground text-sm">
                      Get notified when your tool execution completes. Specify a webhook URL when
                      executing the tool, and superglue will POST the results to that endpoint.
                    </p>
                  </div>

                  <CodeSnippet code={snippets.outgoingWebhookExample} language="javascript" />
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
