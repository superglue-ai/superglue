import { Tool } from "@superglue/shared";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Calendar, CheckCircle, Code, ExternalLink, Webhook, X } from "lucide-react";
import { useEffect, useState } from "react";
import { CodeSnippet } from "../../editors/ReadonlyCodeEditor";
import { Button } from "../../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/tabs";
import { SdkAccordion } from "./SdkAccordion";
import ToolSchedulesList from "./ToolSchedulesList";
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
  const [scheduleSuccess, setScheduleSuccess] = useState(false);

  const snippets = useToolCodeSnippets(currentTool.id, payload);

  useEffect(() => {
    if (isOpen) {
      setScheduleSuccess(false);
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

                <AnimatePresence initial={false}>
                  {scheduleSuccess && (
                    <motion.div
                      key="success"
                      initial={{ opacity: 0, height: 0, overflow: "hidden" }}
                      animate={{ opacity: 1, height: "auto", overflow: "visible" }}
                      exit={{ opacity: 0, height: 0, overflow: "hidden" }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                    >
                      <div className="flex items-center gap-2 rounded-md border bg-muted text-muted-foreground text-base px-3 py-2">
                        <CheckCircle className="h-4 w-4 text-foreground text-green-600" />
                        <span>Schedule created successfully.</span>
                      </div>
                    </motion.div>
                  )}
                  {!scheduleSuccess && (
                    <motion.div
                      key="form"
                      initial={{ opacity: 1 }}
                      exit={{ opacity: 0, height: 0, overflow: "hidden" }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                    >
                      <ToolSchedulesList toolId={currentTool.id} />
                    </motion.div>
                  )}
                </AnimatePresence>

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
                {/* Incoming Webhooks Section */}
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

                {/* Outgoing Webhooks Section */}
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
