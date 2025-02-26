'use client'

import { useConfig } from '@/src/app/config-context'
import { useToast } from '@/src/hooks/use-toast'
import { ApiConfig, CacheMode, SuperglueClient } from '@superglue/client'
import { Loader2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { AutoSizer, List } from 'react-virtualized'
import JsonSchemaEditor from './JsonSchemaEditor'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'

interface InteractiveApiPlaygroundProps {
  configId: string
  instruction: string
  onInstructionChange?: (instruction: string) => void
  responseSchema: string
  onResponseSchemaChange: (schema: string) => void
  initialRawResponse?: any
  responseMapping?: any
  onMappedResponse?: (response: any) => void
  onRun?: () => Promise<void>
  isRunning?: boolean
  mappedResponseData?: any
  hideRunButton?: boolean
}

interface CustomRequestOptions {
  cacheMode?: CacheMode;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  webhookUrl?: string;
  responseSchema?: object;
}

export function InteractiveApiPlayground({ 
  configId, 
  instruction, 
  onInstructionChange,
  responseSchema,
  onResponseSchemaChange,
  initialRawResponse,
  responseMapping,
  onMappedResponse,
  onRun,
  isRunning,
  mappedResponseData,
  hideRunButton
}: InteractiveApiPlaygroundProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [rawResponse, setRawResponse] = useState<any>(initialRawResponse || null)
  const [mappedResponse, setMappedResponse] = useState<any>(null)
  const [activeTab, setActiveTab] = useState('raw')
  const { toast } = useToast()
  const superglueConfig = useConfig()
  const [config, setConfig] = useState<ApiConfig | null>(null)

  const fetchConfig = async () => {
    try {
      const superglueClient = new SuperglueClient({
        endpoint: superglueConfig.superglueEndpoint,
        apiKey: superglueConfig.superglueApiKey
      })
      const data = await superglueClient.getApi(configId)
      setConfig(data)
    } catch (error) {
      console.error('Error fetching config:', error)
    }
  }

  // Fetch config on mount
  useEffect(() => {
    if (configId) {
      fetchConfig()
    }
  }, [configId])

  const handleRun = async () => {
    // TODO: deduplicate this with ConfigCreateStepper.tsx
    if (onRun) {
      return onRun()
    }
    setIsLoading(true)
    try {
      const superglueClient = new SuperglueClient({
        endpoint: superglueConfig.superglueEndpoint,
        apiKey: superglueConfig.superglueApiKey
      })

      // 1. First upsert the API config with the new schema and instruction
      await superglueClient.upsertApi(configId, {
        id: configId,
        instruction,
        responseSchema: JSON.parse(responseSchema)
      })

      // 2. Call the API using the config ID and get mapped response
      const mappedResult = await superglueClient.call({
        id: configId,
        options: {
          cacheMode: CacheMode.WRITEONLY
        }
      })

      if (mappedResult.error) {
        throw new Error(mappedResult.error)
      }

      // 3. Set the mapped response
      setMappedResponse(mappedResult.data)
      onMappedResponse?.(mappedResult.data)
      setActiveTab('mapped')
    } catch (error: any) {
      console.error('Error running API:', error)
      toast({
        title: 'Error Running API',
        description: error?.message || 'An error occurred while running the API',
        variant: 'destructive'
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Update mapped response when it comes from props
  useEffect(() => {
    if (mappedResponseData) {
      setMappedResponse(mappedResponseData)
      setActiveTab('mapped')
    }
  }, [mappedResponseData])

  // Memoize the line splitting for each content type
  const rawResponseLines = useMemo(() => {
    return rawResponse ? JSON.stringify(rawResponse, null, 2).split('\n') : ['Response will appear here...']
  }, [rawResponse])

  const mappedResponseLines = useMemo(() => {
    return mappedResponse ? JSON.stringify(mappedResponse, null, 2).split('\n') : ['Output will appear here...']
  }, [mappedResponse])

  const renderRow = (lines: string[]) => ({ index, key, style }: any) => {
    const line = lines[index]
    const indentMatch = line?.match(/^(\s*)/)
    const indentLevel = indentMatch ? indentMatch[0].length : 0
    
    return (
      <div 
        key={key} 
        style={{
          ...style,
          whiteSpace: 'pre',
          paddingLeft: `${indentLevel * 8}px`,
        }} 
        className="font-mono text-xs overflow-hidden text-ellipsis"
      >
        {line?.trimLeft()}
      </div>
    )
  }

  const getLineCount = (lines: string[]) => lines.length

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">
      {/* Left Column */}
      <div className="flex flex-col space-y-4 overflow-hidden h-full">
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <div className="flex-1 min-h-0 bg-background h-full">
            <JsonSchemaEditor
              value={responseSchema}
              onChange={onResponseSchemaChange}
            />
          </div>
        </div>

        {!hideRunButton && (
          <div className="flex justify-end">
            <Button
              onClick={handleRun}
              disabled={isRunning || isLoading}
            >
              {isRunning || isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  ✨ Run
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Right Column */}
      <div className="flex flex-col h-full overflow-hidden rounded-lg">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <Card className="h-full flex flex-col">
            <CardContent className="p-0 h-full flex flex-col bg-secondary">
              <TabsList className="w-full rounded-t-lg rounded-b-none">
                <TabsTrigger value="raw" className="flex-1">Raw API Response</TabsTrigger>
                <TabsTrigger value="mapped" className="flex-1">🍯 Output</TabsTrigger>
                <TabsTrigger value="jsonata" className="flex-1">Response Mapping</TabsTrigger>
              </TabsList>

              <div className="flex-1 min-h-0">
                <TabsContent value="raw" className="m-0 h-full data-[state=active]:flex flex-col">
                  <div className="flex-1 min-h-0 p-4 overflow-hidden">
                    <AutoSizer>
                      {({ height, width }) => (
                        <List
                          width={width}
                          height={height}
                          rowCount={getLineCount(rawResponseLines)}
                          rowHeight={18}
                          rowRenderer={renderRow(rawResponseLines)}
                          overscanRowCount={100}
                          className="overflow-auto"
                        />
                      )}
                    </AutoSizer>
                  </div>
                </TabsContent>

                <TabsContent value="mapped" className="m-0 h-full data-[state=active]:flex flex-col">
                  <div className="flex-1 min-h-0 p-4 overflow-hidden">
                    <AutoSizer>
                      {({ height, width }) => (
                        <List
                          width={width}
                          height={height}
                          rowCount={getLineCount(mappedResponseLines)}
                          rowHeight={18}
                          rowRenderer={renderRow(mappedResponseLines)}
                          overscanRowCount={100}
                          className="overflow-auto"
                        />
                      )}
                    </AutoSizer>
                  </div>
                </TabsContent>

                <TabsContent value="jsonata" className="m-0 h-full data-[state=active]:flex flex-col">
                  <div className="flex-1 min-h-0 p-4 overflow-y-auto">
                    <pre className="text-xs whitespace-pre-wrap leading-[18px]">
                      {responseMapping || 'No JSONata mapping available'}
                    </pre>
                  </div>
                </TabsContent>
              </div>
            </CardContent>
          </Card>
        </Tabs>
      </div>
    </div>
  )
} 