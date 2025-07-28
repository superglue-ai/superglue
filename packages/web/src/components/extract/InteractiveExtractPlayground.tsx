'use client'

import { useConfig } from '@/src/app/config-context'
import { findArraysOfObjects } from '@/src/lib/client-utils'
import { ExtractConfig, SuperglueClient } from '@superglue/client'
import { Loader2 } from "lucide-react"
import { useEffect, useState } from 'react'
import { AutoSizer, MultiGrid } from 'react-virtualized'
import 'react-virtualized/styles.css'
import JsonSchemaEditor from '@/src/components/utils/JsonSchemaEditor'
import { Button } from '@/src/components/ui/button'
import { Card, CardContent } from '@/src/components/ui/card'
import { Input } from '@/src/components/ui/input'
import { Label } from '@/src/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/components/ui/tabs'

interface InteractiveExtractPlaygroundProps {
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
  hideInstruction?: boolean
  file?: File
}

function VirtualizedTable({ data, columns }: { data: any[], columns: string[] }) {
  // Handle case where data is array of primitives
  const processedData = data.map(item => 
    typeof item === 'object' ? item : { value: item }
  );
  const processedColumns = columns.length ? columns : ['value'];
  
  const COLUMN_WIDTH = Math.max(200, 600 / processedColumns.length);
  const ROW_HEIGHT = 32;
  
  const cellRenderer = ({ columnIndex, key, rowIndex, style }: any) => {
    const isHeader = rowIndex === 0;
    const rawContent = isHeader 
      ? processedColumns[columnIndex]
      : processedData[rowIndex - 1][processedColumns[columnIndex]];
    
    const content = typeof rawContent === 'object'
      ? JSON.stringify(rawContent)
      : String(rawContent);

    return (
      <div
        key={key}
        style={{
          ...style,
          overflow: 'hidden'
        }}
        className={`
          border-r border-b border-slate-300 p-2 flex items-center
          ${isHeader ? 'bg-secondary font-medium' : rowIndex % 2 ? 'bg-muted/50' : ''}
          ${columnIndex === processedColumns.length - 1 ? 'border-r-0' : ''}
          text-xs
        `}
        title={content}
      >
        <div className="truncate w-full">
          {content}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full h-full border border-slate-300">
      <AutoSizer>
        {({ width, height }) => (
          <MultiGrid
            cellRenderer={cellRenderer}
            columnWidth={COLUMN_WIDTH}
            columnCount={processedColumns.length}
            fixedRowCount={1}
            height={height}
            rowHeight={ROW_HEIGHT}
            rowCount={processedData.length + 1}
            width={width}
            overscanRowCount={5}
            overscanColumnCount={2}
            styleBottomLeftGrid={{
              borderTop: '2px solid #e2e8f0'
            }}
            styleTopLeftGrid={{
              borderBottom: '2px solid #e2e8f0'
            }}
            styleTopRightGrid={{
              borderBottom: '2px solid #e2e8f0'
            }}
          />
        )}
      </AutoSizer>
    </div>
  );
}

export function InteractiveExtractPlayground({ 
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
  hideRunButton,
  hideInstruction,
  file
}: InteractiveExtractPlaygroundProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [rawResponse, setRawResponse] = useState<Record<string, any[]>>(findArraysOfObjects(initialRawResponse) || {})
  const [mappedResponse, setMappedResponse] = useState<Record<string, any[]>>(mappedResponseData || {})
  const [activeTab, setActiveTab] = useState('raw')
  const superglueConfig = useConfig()
  const [config, setConfig] = useState<ExtractConfig | null>(null)

  const fetchConfig = async () => {
    try {
      const superglueClient = new SuperglueClient({
        endpoint: superglueConfig.superglueEndpoint,
        apiKey: superglueConfig.superglueApiKey
      })
      const data = await superglueClient.getExtract(configId)
      setConfig(data)
    } catch (error) {
      console.error('Error fetching config:', error)
    }
  }


  const handleRun = async () => {
    // TODO: deduplicate this with ConfigCreateStepper.tsx
    if (onRun) {
      return onRun()
    }
  }

  // Update mapped response when it comes from props
  useEffect(() => {
    if (mappedResponseData) {
      const mappedResponse = findArraysOfObjects(mappedResponseData)
      setMappedResponse(mappedResponse)
      setActiveTab('mapped')
    }
  }, [mappedResponseData])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">
      {/* Left Column */}
      <div className="flex flex-col space-y-4 overflow-hidden">
        {!hideInstruction && (
          <div>
            <Label>Instruction</Label>
            <Input
              value={instruction}
              onChange={(e) => onInstructionChange?.(e.target.value)}
              placeholder="E.g. 'Get all products with price and name'"
              disabled={!onInstructionChange}
            />
          </div>
        )}

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
                <TabsTrigger value="raw" className="flex-1">Raw Document</TabsTrigger>
                <TabsTrigger value="mapped" className="flex-1">🍯 Output</TabsTrigger>
                <TabsTrigger value="jsonata" className="flex-1">Response Mapping</TabsTrigger>
              </TabsList>

              <div className="flex-1 min-h-0">
                <TabsContent value="raw" className="m-0 h-full data-[state=active]:flex flex-col">
                  <div className="flex-1 min-h-0 p-4 overflow-y-auto">
                    {rawResponse ? (
                      Object.keys(rawResponse).length > 1 ? (
                        <Tabs defaultValue={Object.keys(rawResponse)[0]} className="w-full h-full">
                          <TabsList>
                            {Object.keys(rawResponse).map(key => (
                              <TabsTrigger key={key} value={key}>{key}</TabsTrigger>
                            ))}
                          </TabsList>
                          {Object.entries(rawResponse).map(([key, array]) => (
                            <TabsContent key={key} value={key} className="h-[calc(100%-40px)]">
                              {array?.length > 0 ? (
                                <VirtualizedTable 
                                  data={array} 
                                  columns={Object.keys(array[0])}
                                />
                              ) : (
                                <div className="text-xs">No data available</div>
                              )}
                            </TabsContent>
                          ))}
                        </Tabs>
                      ) : (
                        Object.values(rawResponse)[0]?.length > 0 ? (
                          <VirtualizedTable 
                            data={Object.values(rawResponse)[0]} 
                            columns={Object.keys(Object.values(rawResponse)[0][0])}
                          />
                        ) : (
                          <div className="text-xs">No data available</div>
                        )
                      )
                    ) : (
                      <div className="text-xs">Document will appear here...</div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="mapped" className="m-0 h-full data-[state=active]:flex flex-col">
                  <div className="flex-1 min-h-0 p-4 overflow-y-auto">
                    {mappedResponse ? (
                      Object.keys(mappedResponse).length > 1 ? (
                        <Tabs defaultValue={Object.keys(mappedResponse)[0]} className="w-full h-full">
                          <TabsList className="w-full">
                            {Object.keys(mappedResponse).map((key) => (
                              <TabsTrigger key={key} value={key} className="flex-1">{key}</TabsTrigger>
                            ))}
                          </TabsList>
                          {Object.entries(mappedResponse).map(([key, array]) => (
                            <TabsContent key={key} value={key} className="h-[calc(100%-40px)]">
                              {Array.isArray(array) && array.length > 0 ? (
                                <VirtualizedTable 
                                  data={array} 
                                  columns={typeof array[0] === 'object' ? Object.keys(array[0]) : []}
                                />
                              ) : (
                                <div className="text-xs">Output will appear here...</div>
                              )}
                            </TabsContent>
                          ))}
                        </Tabs>
                      ) : (
                        Object.values(mappedResponse)[0]?.length > 0 ? (
                          <VirtualizedTable 
                            data={Object.values(mappedResponse)[0]} 
                            columns={typeof Object.values(mappedResponse)[0][0] === 'object' 
                              ? Object.keys(Object.values(mappedResponse)[0][0]) 
                              : []}
                          />
                        ) : (
                          <div className="text-xs">Output will appear here...</div>
                        )
                      )
                    ) : (
                      <div className="text-xs">Output will appear here...</div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="jsonata" className="m-0 h-full data-[state=active]:flex flex-col">
                  <div className="flex-1 min-h-0 p-4 overflow-y-auto">
                    <pre className="text-xs whitespace-pre-wrap">
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