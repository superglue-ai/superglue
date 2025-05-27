import { toast } from '@/src/hooks/use-toast'
import { Button } from '../ui/button'
import { Copy, Check } from 'lucide-react'
import { useConfig } from '@/src/app/config-context'
import { useState } from 'react'

type Workflow = any // Replace with your actual Workflow type
type SystemInput = any // Replace with your actual SystemInput type

interface WorkflowCreateSuccessProps {
  currentWorkflow: Workflow
  credentials: Record<string, string>
  payload: Record<string, any>
}

export function WorkflowCreateSuccess({
  currentWorkflow,
  credentials,
  payload
}: WorkflowCreateSuccessProps) {
  const superglueConfig = useConfig();
  const [sdkCopied, setSdkCopied] = useState(false)
  const [curlCopied, setCurlCopied] = useState(false)
  
  const sdkCode = `const client = new SuperglueClient({
  apiKey: "${superglueConfig.superglueApiKey}"
});

const result = await client.executeWorkflow({
  id: "${currentWorkflow.id}",
  payload: ${JSON.stringify(payload, null, 2)},
  credentials: ${JSON.stringify(credentials, null, 2)}
});`

  const curlCommand = `curl -X POST "${superglueConfig.superglueEndpoint}/graphql" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${superglueConfig.superglueApiKey}" \\
  -d '${JSON.stringify({
    query: `mutation ExecuteWorkflow($input: WorkflowInputRequest!, $payload: JSON, $credentials: JSON) { 
  executeWorkflow(input: $input, payload: $payload, credentials: $credentials) { 
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
      credentials: credentials,
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
                    navigator.clipboard.writeText(sdkCode)
                    setSdkCopied(true)
                    setTimeout(() => setSdkCopied(false), 1000)
                  }}
                >
                  {sdkCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <div className="bg-secondary rounded-md overflow-hidden">
                <pre className="font-mono text-sm p-4 overflow-x-auto">
                  <code>{sdkCode}</code>
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