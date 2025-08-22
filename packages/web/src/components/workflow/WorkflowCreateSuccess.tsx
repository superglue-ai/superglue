import { useConfig } from '@/src/app/config-context'
import { getSDKCode } from '@superglue/shared/templates'
import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../ui/button'

type Workflow = any // Replace with your actual Workflow type

interface WorkflowCreateSuccessProps {
  currentWorkflow: Workflow
  payload: Record<string, any>
  credentials?: Record<string, string>
}

export function WorkflowCreateSuccess({
  currentWorkflow,
  payload,
  credentials
}: WorkflowCreateSuccessProps) {
  const superglueConfig = useConfig();
  const [sdkCopied, setSdkCopied] = useState(false)
  const [curlCopied, setCurlCopied] = useState(false)

  const sdkCode = getSDKCode({
    apiKey: superglueConfig.superglueApiKey,
    endpoint: superglueConfig.superglueEndpoint,
    workflowId: currentWorkflow.id,
    payload,
    credentials: credentials || {},
  })

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
        id: currentWorkflow.id,
      },
      payload: payload,
    },
  })}'`

  return (
    <div className="space-y-4 mt-6">
      <div className="rounded-md bg-muted p-4">
        <div className="flex items-start space-x-2">
          <div className="space-y-1 w-full">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium">Using the SDK</h3>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 flex-none"
                onClick={() => {
                  navigator.clipboard.writeText(sdkCode.typescript)
                  setSdkCopied(true)
                  setTimeout(() => setSdkCopied(false), 1000)
                }}
              >
                {sdkCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <div className="bg-secondary rounded-md overflow-hidden">
              <pre className="font-mono text-sm p-4 overflow-x-auto">
                <code>{sdkCode.typescript}</code>
              </pre>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-md bg-muted p-4">
        <div className="flex items-start space-x-2">
          <div className="space-y-1 w-full">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium">Using cURL</h3>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 flex-none"
                onClick={() => {
                  navigator.clipboard.writeText(curlCommand)
                  setCurlCopied(true)
                  setTimeout(() => setCurlCopied(false), 1000)
                }}
              >
                {curlCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <div className="bg-secondary rounded-md overflow-hidden">
              <pre className="font-mono text-sm p-4 overflow-x-auto">
                <code>{curlCommand}</code>
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 