import { useConfig } from '@/src/app/config-context';
import { tokenRegistry } from '@/src/lib/token-registry';
import { getSDKCode } from '@superglue/shared/templates';
import { Bot, Calendar, Check, Code, Copy, ExternalLink, Webhook } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import ToolScheduleModal from './ToolScheduleModal';

type Tool = any // Replace with your actual Tool type

interface ToolCreateSuccessProps {
  currentTool: Tool
  payload: Record<string, any>
  credentials?: Record<string, string>
  onViewTool?: () => void
  onViewAllTools?: () => void
}

export function ToolCreateSuccess({
  currentTool,
  payload,
  credentials,
  onViewTool,
  onViewAllTools
}: ToolCreateSuccessProps) {
  const superglueConfig = useConfig();
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('schedule')

  // SDK code snippets
  const sdkCode = getSDKCode({
    apiKey: tokenRegistry.getToken(),
    endpoint: superglueConfig.superglueEndpoint,
    workflowId: currentTool.id,
    payload,
    credentials: credentials || {},
  })

  // cURL command
  const curlCommand = `curl -X POST "${superglueConfig.superglueEndpoint}/graphql" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer <YOUR_SUPERGLUE_API_KEY>" \\
  -d '${JSON.stringify({
    query: `mutation ExecuteWorkflow($input: WorkflowInputRequest!, $payload: JSON) { 
  executeWorkflow(input: $input, payload: $payload) { 
    data 
    error 
    success 
  } 
}`,
    variables: {
      input: {
        id: currentTool.id,
      },
      payload: payload,
    },
  }, null, 2)}'`

  // Webhook example
  const webhookExample = `const client = new SuperglueClient({
  apiKey: "<YOUR_SUPERGLUE_API_KEY>",
  endpoint: "${superglueConfig.superglueEndpoint}"
});

const result = await client.executeWorkflow({
  id: "${currentTool.id}",
  payload: ${JSON.stringify(payload, null, 2)},
  options: {
    webhookUrl: "https://your-app.com/webhook"
  }
});`

  // MCP config
  const mcpConfig = `{
  "mcpServers": {
    "superglue": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://mcp.superglue.ai",
        "--header",
        "Authorization:\${AUTH_HEADER}"
      ],
      "env": {
        "AUTH_HEADER": "Bearer <YOUR_SUPERGLUE_API_KEY>"
      }
    }
  }
}`

  // Copy handlers
  const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({})
  
  const handleCopy = (key: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedStates({ ...copiedStates, [key]: true })
    setTimeout(() => {
      setCopiedStates({ ...copiedStates, [key]: false })
    }, 1000)
  }

  const CopyButton = ({ copyKey, text }: { copyKey: string; text: string }) => (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 flex-none"
      onClick={() => handleCopy(copyKey, text)}
    >
      {copiedStates[copyKey] ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
    </Button>
  )

  return (
    <div className="space-y-6">
      {/* Hero section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Check className="h-6 w-6 text-green-600" />
          <h2 className="text-2xl font-semibold">Tool Created Successfully!</h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-muted-foreground">Tool ID:</span>
          <span className="font-mono text-base bg-muted px-3 py-1 rounded">
            {currentTool.id}
          </span>
        </div>
        <p className="text-muted-foreground">
          Your tool is ready to use in production. Choose how you want to deploy it:
        </p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
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
        <TabsContent value="schedule" className="space-y-4 mt-4">
          <div className="space-y-2">
            <h3 className="text-lg font-medium">Schedule Automated Runs</h3>
            <p className="text-sm text-muted-foreground">
              Set up recurring execution on superglue's infrastructure. No code needed.
            </p>
          </div>

          <div className="border rounded-lg p-6 bg-muted/50 space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">Run this tool automatically:</p>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>Every 5 minutes, hourly, daily, or custom schedule</li>
                <li>With timezone support</li>
                <li>Optional webhook notifications on completion</li>
                <li>Built-in retry and error handling</li>
              </ul>
            </div>

            <Button 
              onClick={() => setScheduleModalOpen(true)}
              size="lg"
              className="w-full sm:w-auto"
            >
              <Calendar className="h-4 w-4 mr-2" />
              Create Schedule
            </Button>
          </div>

          <div className="text-sm text-muted-foreground">
            <a 
              href="https://docs.superglue.cloud/guides/scheduling"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:underline"
            >
              Learn more about scheduling
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </TabsContent>

        {/* SDK/API Tab */}
        <TabsContent value="sdk" className="space-y-4 mt-4">
          <div className="space-y-2">
            <h3 className="text-lg font-medium">Call from Your Application</h3>
            <p className="text-sm text-muted-foreground">
              Execute this tool programmatically from any codebase or service.
            </p>
          </div>

          {/* TypeScript */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">TypeScript / JavaScript</h4>
              <CopyButton copyKey="typescript" text={sdkCode.typescript} />
            </div>
            <div className="bg-secondary rounded-md overflow-hidden">
              <pre className="font-mono text-xs p-4 overflow-x-auto">
                <code>{sdkCode.typescript}</code>
              </pre>
            </div>
          </div>

          {/* Python */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">Python</h4>
              <CopyButton copyKey="python" text={sdkCode.python} />
            </div>
            <div className="bg-secondary rounded-md overflow-hidden">
              <pre className="font-mono text-xs p-4 overflow-x-auto">
                <code>{sdkCode.python}</code>
              </pre>
            </div>
          </div>

          {/* cURL */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">cURL / GraphQL</h4>
              <CopyButton copyKey="curl" text={curlCommand} />
            </div>
            <div className="bg-secondary rounded-md overflow-hidden">
              <pre className="font-mono text-xs p-4 overflow-x-auto">
                <code>{curlCommand}</code>
              </pre>
            </div>
          </div>

          <div className="text-sm text-muted-foreground">
            <a 
              href="https://docs.superglue.cloud/agent-builders/sdk-integration"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:underline"
            >
              View full SDK documentation
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </TabsContent>

        {/* Webhooks Tab */}
        <TabsContent value="webhook" className="space-y-4 mt-4">
          <div className="space-y-2">
            <h3 className="text-lg font-medium">Send Results to Your Webhook</h3>
            <p className="text-sm text-muted-foreground">
              Get notified when tool executions complete. Perfect for triggering downstream workflows.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">Example with Webhook URL</h4>
              <CopyButton copyKey="webhook" text={webhookExample} />
            </div>
            <div className="bg-secondary rounded-md overflow-hidden">
              <pre className="font-mono text-xs p-4 overflow-x-auto">
                <code>{webhookExample}</code>
              </pre>
            </div>
          </div>

          <div className="border rounded-lg p-4 bg-muted/50 space-y-2">
            <p className="text-sm font-medium">Webhook Behavior:</p>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Automatically POSTed on completion (success or failure)</li>
              <li>Async - doesn't delay tool execution</li>
              <li>Auto-retries 3 times with 10s delay</li>
              <li>10s timeout per request</li>
            </ul>
          </div>

          <div className="text-sm text-muted-foreground">
            <a 
              href="https://docs.superglue.cloud/guides/webhooks"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:underline"
            >
              Learn more about webhooks
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </TabsContent>

        {/* MCP Tab */}
        <TabsContent value="mcp" className="space-y-4 mt-4">
          <div className="space-y-2">
            <h3 className="text-lg font-medium">Deploy to Your AI Agent</h3>
            <p className="text-sm text-muted-foreground">
              Make this tool available to Claude, Cursor, or any MCP-compatible agent.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium">1. Add superglue MCP server to your config</h4>
                <CopyButton copyKey="mcpConfig" text={mcpConfig} />
              </div>
              <div className="bg-secondary rounded-md overflow-hidden">
                <pre className="font-mono text-xs p-4 overflow-x-auto">
                  <code>{mcpConfig}</code>
                </pre>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Add this to your <code className="bg-muted px-1 py-0.5 rounded">mcp.json</code> file
              </p>
            </div>

            <div className="border rounded-lg p-4 bg-muted/50 space-y-2">
              <p className="text-sm font-medium">2. Use in your AI agent</p>
              <p className="text-sm text-muted-foreground font-mono">
                "Execute superglue tool {currentTool.id}"
              </p>
            </div>
          </div>

          <div className="text-sm text-muted-foreground">
            <a 
              href="https://docs.superglue.cloud/mcp/mcp-guide"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:underline"
            >
              View MCP setup guide
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </TabsContent>
      </Tabs>

      {/* Action buttons */}
      {(onViewTool || onViewAllTools) && (
        <div className="flex gap-2 pt-4 border-t">
          {onViewTool && (
            <Button variant="outline" onClick={onViewTool}>
              View Tool Details
            </Button>
          )}
          {onViewAllTools && (
            <Button variant="outline" onClick={onViewAllTools}>
              View All Tools
            </Button>
          )}
        </div>
      )}

      {/* Schedule Modal */}
      <ToolScheduleModal
        toolId={currentTool.id}
        isOpen={scheduleModalOpen}
        onClose={() => setScheduleModalOpen(false)}
        onSave={() => {
          setScheduleModalOpen(false)
        }}
      />
    </div>
  )
} 