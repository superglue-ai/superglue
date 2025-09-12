'use client'

import { useConfig } from '@/src/app/config-context';
import { useToast } from '@/src/hooks/use-toast';
import { findArraysOfObjects, parseCredentialsHelper } from '@/src/lib/client-utils';
import { cn, inputErrorStyles } from '@/src/lib/utils';
import { ApiConfig, AuthType, CacheMode, ExtractConfig, SuperglueClient, TransformConfig } from '@superglue/client';
import { Copy, Download, Loader2, Terminal, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Textarea } from '../ui/textarea';
import { HelpTooltip } from '../utils/HelpTooltip';
import { API_CREATE_STEPS, StepIndicator, type StepperStep } from '../utils/StepIndicator';
import { InteractiveExtractPlayground } from './InteractiveExtractPlayground';

interface ExtractCreateStepperProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  extractId?: string // not used, but if we later want to edit through this flow
  mode?: 'create' | 'edit'
}

export function ExtractCreateStepper({ open, onOpenChange, extractId: initialExtractId, mode = 'create' }: ExtractCreateStepperProps) {
  const [step, setStep] = useState<StepperStep>('basic')
  const [isAutofilling, setIsAutofilling] = useState(false)
  const { toast } = useToast()
  const router = useRouter()
  const superglueConfig = useConfig()

  const [extractId, setExtractId] = useState<string>(initialExtractId || '')
  const [file, setFile] = useState<File | null>(null)
  const [initialRawResponse, setInitialRawResponse] = useState<any>(null)
  const [hasMappedResponse, setHasMappedResponse] = useState(false)
  const [mappedResponseData, setMappedResponseData] = useState<any>(null)
  const [responseMapping, setResponseMapping] = useState<any>(null)
  const [isRunning, setIsRunning] = useState(false)

  const [formData, setFormData] = useState({
    urlHost: '',
    urlPath: '',
    instruction: '',
    documentationUrl: '',
    inputPayload: '{}',
    auth: {
      type: AuthType.HEADER,
      value: '',
      advancedConfig: '{}'
    },
    responseSchema: '{}'
  })

  const [validationErrors, setValidationErrors] = useState<Record<string, boolean>>({})

  // Add new state for drag and drop
  const [isDragging, setIsDragging] = useState(false)

  const [activeSourceTab, setActiveSourceTab] = useState<'upload' | 'url'>('upload')

  const handleChange = (field: string) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | string
  ) => {
    const value = typeof e === 'string' ? e : e.target.value
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))

    // Reset hasMappedResponse and mappedResponseData when schema or instruction changes
    if (field === 'responseSchema' || field === 'instruction') {
      setHasMappedResponse(false)
      setMappedResponseData(null)
    }
  }

  const handleAuthChange = (value: string) => {
    setFormData(prev => ({
      ...prev,
      auth: {
        ...prev.auth,
        value
      }
    }))
  }

  const handleNext = async () => {
    if (step === 'basic') {
      const errors: Record<string, boolean> = {}
      if (activeSourceTab === 'url' && !formData.urlHost) {
        errors.urlHost = true
      }
      if (activeSourceTab === 'upload' && !file) {
        errors.file = true
      }
      if (!formData.instruction) {
        errors.instruction = true
      }
      if (Object.keys(errors).length > 0) {
        setValidationErrors(errors)
        // Find first error field and scroll to it
        const firstErrorField = Object.keys(errors)[0]
        const errorElement = document.getElementById(firstErrorField)
        if (errorElement) {
          errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
          errorElement.focus()
        }
        return
      }
      setValidationErrors({})

      if (file) {
        try {
          setIsAutofilling(true)
          await fetchFromFile()
          setIsAutofilling(false)
          setStep('try_and_output')
          return
        } catch (error: any) {
          setIsAutofilling(false)
          toast({
            title: 'Extraction Failed',
            description: error?.message || 'An error occurred while configuring the Extraction',
            variant: 'destructive'
          })
          return
        }
      }

      // If URL is selected, fetch from config
      if (activeSourceTab === 'url') {
        setIsAutofilling(true)
        try {
          await fetchFromConfig()
        } catch (error: any) {
          console.error('Error during autofill:', error)
          toast({
            title: 'Autofill Failed',
            description: error?.message || 'An error occurred while configuring the API',
            variant: 'destructive'
          })
          return
        } finally {
          setIsAutofilling(false)
        }
      }
    }

    if (step === 'try_and_output') {
      // Save the configuration with the updated schema
      try {
        const superglueClient = new SuperglueClient({
          endpoint: superglueConfig.superglueEndpoint,
          apiKey: superglueConfig.superglueApiKey
        })

        const savedConfig = await superglueClient.upsertExtraction(extractId, {
          id: extractId,
          urlHost: formData.urlHost,
          instruction: formData.instruction,
          documentationUrl: formData.documentationUrl || undefined,
        } as ExtractConfig)

        const savedTransformation = await superglueClient.upsertTransformation(extractId, {
          id: extractId,
          responseSchema: JSON.parse(formData.responseSchema),
        } as TransformConfig)

        if (!savedConfig || !savedTransformation) {
          throw new Error('Failed to save configuration')
        }
      } catch (error: any) {
        console.error('Error saving config:', error)
        toast({
          title: 'Error Saving Configuration',
          description: error?.message || 'An error occurred while saving the configuration',
          variant: 'destructive'
        })
        return
      }
    }

    const steps: StepperStep[] = ['basic', 'try_and_output', 'success']
    const currentIndex = steps.indexOf(step)
    if (currentIndex < steps.length - 1) {
      setStep(steps[currentIndex + 1])
    }
  }

  const handleBack = () => {
    const steps: StepperStep[] = ['basic', 'try_and_output', 'success']
    const currentIndex = steps.indexOf(step)
    if (currentIndex > 0) {
      setStep(steps[currentIndex - 1])
    }
  }

  const handleClose = () => {
    if (mode === 'create') {
      router.push('/configs')
    } else {
      router.push(`/configs/${extractId}/edit`)
    }
    onOpenChange(false)
  }

  const getCurlCommand = () => {
    if (file) {
      const extractCommand = `# First command: Extract data and store in JSON
curl -s -X POST "${superglueConfig.superglueEndpoint}" \\
  -H "Authorization: Bearer ${superglueConfig.superglueApiKey}" \\
  -F 'operations={"query":"mutation($file: Upload!) { extract(input: { file: $file }, options: { timeout: 30000 }) { id success data error } }", "variables": { "file": null }}' \\
  -F 'map={"0": ["variables.file"]}' \\
  -F '0=@${file.name}' | \\
jq '.data.extract.data' > extracted_data.json`

      const transformCommand = `# Second command: Transform the extracted data
curl -s -X POST "${superglueConfig.superglueEndpoint}" \\
  -H "Authorization: Bearer ${superglueConfig.superglueApiKey}" \\
  -H "Content-Type: application/json" \\
  -d @<(jq -n --argjson data "$(cat extracted_data.json)" '{
    "query": "mutation($data: JSON!) { transform(input: { id: \\"${extractId}\\" }, data: $data) { data } }",
    "variables": {
      "data": $data
    }
  }')`

      return `${extractCommand}\n\n${transformCommand}`
    }

    // Regular API endpoint curl commands
    let payload = {}
    try {
      payload = JSON.parse(formData.inputPayload)
    } catch (e) {
      console.warn('Invalid input payload JSON')
    }
    const credentials = parseCredentialsHelper(formData.auth.value)
    const extractCommand = `# First command: Extract data and store in JSON
curl -s -X POST "${superglueConfig.superglueEndpoint}" \\
  -H "Authorization: Bearer ${superglueConfig.superglueApiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "query": "mutation($payload: JSON, $credentials: JSON) { extract(input: { id: \\"${extractId}\\" }, payload: $payload, credentials: $credentials) { data } }",
    "variables": {
      "payload": ${JSON.stringify(payload, null, 2)},
      "credentials": ${JSON.stringify(credentials, null, 2)}
    }
  }' | jq '.data.extract.data' > extracted_data.json`

    const transformCommand = `# Second command: Transform the extracted data
curl -s -X POST "${superglueConfig.superglueEndpoint}" \\
  -H "Authorization: Bearer ${superglueConfig.superglueApiKey}" \\
  -H "Content-Type: application/json" \\
  -d @<(jq -n --argjson data "$(cat extracted_data.json)" '{
    "query": "mutation($data: JSON!) { transform(input: { id: \\"${extractId}\\" }, data: $data) { data } }",
    "variables": {
      "data": $data
    }
  }')`

    return `${extractCommand}\n\n${transformCommand}`
  }

  const getSdkCode = () => {
    const credentials = parseCredentialsHelper(formData.auth.value)
    return `npm install @superglue/client

// in your app:
import { SuperglueClient } from "@superglue/client";
const superglue = new SuperglueClient({
  apiKey: "${superglueConfig.superglueApiKey}"
});

const extractResult = await superglue.extract({ 
  id: "${extractId}",
  payload: ${formData.inputPayload},
  credentials: ${JSON.stringify(credentials)}
});
const transformResult = await superglue.transform({
  id: "${extractId}",
  data: extractResult.data
});
if (transformResult?.success) {
  console.log('Transformed Data:', transformResult.data);
} else {
  console.error('Transformation Error:', transformResult.error);
}

`
  }
  const fetchFromConfig = async () => {
    const superglueClient = new SuperglueClient({
      endpoint: superglueConfig.superglueEndpoint,
      apiKey: superglueConfig.superglueApiKey
    })
    // Call autofill endpoint
    const response = await superglueClient.extract({
      endpoint: {
        id: formData.urlHost?.replace(/^(https?|postgres(ql)?|ftp(s)?|sftp|file):\/\//, '').replace(/\//g, '') + '-' + Math.floor(1000 + Math.random() * 9000),
        urlHost: formData.urlHost,
        ...(formData.urlPath ? { urlPath: formData.urlPath } : {}),
        ...(formData.documentationUrl ? { documentationUrl: formData.documentationUrl } : {}),
        instruction: formData.instruction,
        authentication: formData.auth.value ? AuthType.HEADER : AuthType.NONE
      },
      payload: JSON.parse(formData.inputPayload),
      credentials: parseCredentialsHelper(formData.auth.value),
      options: {
        cacheMode: CacheMode.DISABLED
      }
    })

    if (response.error) {
      throw new Error(response.error)
    }

    // Store the raw response for the try step
    setInitialRawResponse(response.data)

    // Generate schema based on the raw response
    const generatedSchema = await superglueClient.generateSchema(formData.instruction, JSON.stringify(response.data))
    if (generatedSchema) {
      setFormData(prev => ({
        ...prev,
        responseSchema: JSON.stringify(generatedSchema, null, 2)
      }))
    }

    // Apply the returned config
    const config = response.config as ApiConfig
    if (config) {
      const id = formData.urlHost.replace(/^(https?|postgres(ql)?|ftp(s)?|sftp|file):\/\//, '').replace(/\//g, '') + '-' + Math.floor(1000 + Math.random() * 9000)
      setExtractId(id)

      // Save the configuration with the generated schema
      const savedConfig = await superglueClient.upsertApi(id, {
        id,
        ...config,
        responseSchema: generatedSchema,
        createdAt: new Date(),
        updatedAt: new Date()
      } as ApiConfig)

      if (!savedConfig) {
        throw new Error('Failed to save configuration')
      }
    }
  }
  const fetchFromFile = async () => {
    const superglueClient = new SuperglueClient({
      endpoint: superglueConfig.superglueEndpoint,
      apiKey: superglueConfig.superglueApiKey
    })

    const response = await superglueClient.extract({
      file: file
    })

    if (response.error) {
      throw new Error(response.error)
    }
    setInitialRawResponse(response.data)
    setExtractId(response.config.id)

    const generatedSchema = await superglueClient.generateSchema(formData.instruction, JSON.stringify(response.data))
    if (generatedSchema) {
      setFormData(prev => ({
        ...prev,
        responseSchema: JSON.stringify(generatedSchema, null, 2)
      }))
    }
  }

  // Update handleMappedResponse to store the response data
  const handleMappedResponse = (response: any) => {
    setMappedResponseData(response)
    setHasMappedResponse(!!response && typeof response === 'object')
  }

  const handleRun = async () => {
    // TODO: dedupe this InteractiveApiPlayground
    setIsRunning(true)
    try {
      const superglueClient = new SuperglueClient({
        endpoint: superglueConfig.superglueEndpoint,
        apiKey: superglueConfig.superglueApiKey
      })

      // 1. First upsert the API config with the new schema and instruction
      await superglueClient.upsertExtraction(extractId, {
        id: extractId,
        instruction: formData.instruction,
      })

      let mappedData = initialRawResponse;
      let responseMapping = null;
      if (formData.responseSchema && Object.keys(JSON.parse(formData.responseSchema)).length > 0) {
        await superglueClient.upsertTransformation(extractId, {
          responseSchema: JSON.parse(formData.responseSchema),
          instruction: formData.instruction
        });

        const mappedResult = await superglueClient.transform({
          id: extractId,
          data: initialRawResponse
        });

        if (mappedResult.error) {
          throw new Error(mappedResult.error);
        }
        mappedData = mappedResult.data;
        responseMapping = (mappedResult.config as TransformConfig).responseMapping;
      }

      setInitialRawResponse(initialRawResponse);
      setMappedResponseData(mappedData);
      setResponseMapping(responseMapping);
      setHasMappedResponse(true);

    } catch (error: any) {
      console.error('Error running API:', error)
      toast({
        title: 'Error Running API',
        description: error?.message || 'An error occurred while running the API',
        variant: 'destructive'
      })
    } finally {
      setIsRunning(false)
    }
  }

  // Add drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const file = e.dataTransfer.files[0]
    if (!file) return
    setFile(file)
    setValidationErrors({})
  }


  // Update handleFileUpload to use processFile
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFile(file)
    setValidationErrors({})
  }

  // Add this helper function near the top with other functions
  const downloadData = (data: Record<string, any>, format: 'json' | 'csv') => {
    if (format === 'json') {
      const content = JSON.stringify(data, null, 2);
      const blob = new Blob([content], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `superglue_extract_${extractId}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } else {
      const objects = findArraysOfObjects(data);
      Object.keys(objects).forEach(key => {
        const items = objects[key];
        const replacer = (key: string, value: any) => value === null ? '' : value;
        const header = Object.keys(items[0] || {});
        const csv = [
          header.join(','),
          ...items.map(row => header.map(field =>
            JSON.stringify(row[field], replacer)).join(','))
        ].join('\r\n');

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `superglue_extract_${extractId}_${key}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="h-[100vh] w-[100vw] max-w-[100vw] p-3 sm:p-6 lg:p-12 gap-0 rounded-none border-none flex flex-col"
        onPointerDownOutside={e => e.preventDefault()}
      >
        <div className="flex-none mb-4">
          <DialogHeader>
            <div className="flex flex-col lg:flex-row items-center justify-between gap-4 mb-4">
              <DialogTitle>
                {step === 'success' ? 'Configuration Complete!' : 'Create New Document Configuration'}
              </DialogTitle>
              {!step.includes('success') && (
                <Button
                  variant="outline"
                  className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-200/50 hover:border-blue-300/50 text-blue-600 hover:text-blue-700 text-sm px-4 py-1 h-8 rounded-full animate-pulse shrink-0"
                  onClick={() => window.open('https://cal.com/superglue/onboarding', '_blank')}
                >
                  ✨ Get help from our team
                </Button>
              )}
            </div>
          </DialogHeader>

          <StepIndicator currentStep={step} steps={API_CREATE_STEPS} />
        </div>

        <div className="flex-1 overflow-y-auto px-1 min-h-0">
          {step === 'basic' && (
            <div className="space-y-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Label htmlFor="instruction">What do you want to get from this source?</Label>
                  <HelpTooltip text="Describe what data you want to extract from this source in plain English" />
                </div>
                <Textarea
                  id="instruction"
                  value={formData.instruction}
                  autoFocus
                  onChange={(e) => {
                    handleChange('instruction')(e)
                    if (e.target.value) {
                      setValidationErrors(prev => ({ ...prev, instruction: false }))
                    }
                  }}
                  placeholder="E.g. 'Get all products with price and name'"
                  className={cn(
                    "h-24",
                    validationErrors.instruction && inputErrorStyles,
                    validationErrors.instruction && "focus:!border-destructive"
                  )}
                  required
                />
                {validationErrors.instruction && (
                  <p className="text-sm text-destructive mt-1">Instruction is required</p>
                )}
              </div>

              <Tabs
                defaultValue="upload"
                className="w-full"
                value={activeSourceTab}
                onValueChange={(value) => setActiveSourceTab(value as 'upload' | 'url')}
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="upload">Upload File</TabsTrigger>
                  <TabsTrigger value="url">Configure from URL</TabsTrigger>
                </TabsList>

                <TabsContent value="upload">
                  <div
                    className={cn(
                      "relative rounded-lg border-2 border-dashed p-8",
                      isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25",
                      file ? "border-blue-500/30 bg-blue-500/5 ring-1 ring-blue-500/20" : "",
                      "transition-all duration-200 ease-in-out",
                      validationErrors.file && "border-destructive"
                    )}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                  >
                    <div className="flex flex-col items-center gap-3 text-center">
                      {file ? (
                        <>
                          <div className="flex items-center gap-3 bg-blue-500/10 px-4 py-2 rounded-full">
                            <Upload className="h-5 w-5 text-blue-500" />
                            <span className="text-blue-700 font-medium">{file.name}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-muted-foreground hover:text-destructive transition-colors"
                              onClick={() => setFile(null)}
                            >
                              Remove
                            </Button>
                          </div>
                        </>
                      ) : (
                        <>
                          <Upload className="h-8 w-8 text-muted-foreground/60" />
                          <div>
                            <Button
                              variant="ghost"
                              className={cn(
                                "text-primary font-medium hover:text-primary/80",
                                validationErrors.file && "text-destructive"
                              )}
                              onClick={() => document.getElementById('file-upload')?.click()}
                            >
                              Upload File
                            </Button>
                            <input
                              type="file"
                              id="file-upload"
                              className="hidden"
                              onChange={handleFileUpload}
                            />
                            <p className="text-sm text-muted-foreground mt-1">or drag and drop your file here</p>
                          </div>
                        </>
                      )}
                    </div>
                    {isDragging && (
                      <div className="absolute inset-0 bg-primary/5 backdrop-blur-[1px] flex items-center justify-center rounded-lg border-2 border-primary transition-all duration-200">
                        <p className="text-sm font-medium text-primary">Drop file here</p>
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="url" className="space-y-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Label htmlFor="urlHost">API Endpoint Domain</Label>
                      <HelpTooltip text="The base URL of the API (e.g., https://api.example.com)." />
                    </div>
                    <Input
                      id="urlHost"
                      value={formData.urlHost}
                      onChange={(e) => {
                        handleChange('urlHost')(e)
                        if (e.target.value) {
                          setValidationErrors(prev => ({ ...prev, urlHost: false }))
                        }
                      }}
                      placeholder="https://api.example.com"
                      required
                      className={cn(
                        validationErrors.urlHost && inputErrorStyles,
                        validationErrors.urlHost && "focus:!border-destructive"
                      )}
                    />
                    {validationErrors.urlHost && (
                      <p className="text-sm text-destructive mt-1">API endpoint is required</p>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Label htmlFor="urlPath">API Endpoint Path (Optional)</Label>
                      <HelpTooltip text="Additional path after the domain (e.g., /v1/apis). If you leave this blank, superglue will figure out the path automatically." />
                    </div>
                    <Input
                      id="urlPath"
                      value={formData.urlPath}
                      onChange={handleChange('urlPath')}
                      placeholder="/v1/apis"
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <Label htmlFor="auth">API Key or Token for Target API (Optional)</Label>
                      <HelpTooltip text="Enter API key/token here, superglue figures out where to put it. Do not include prefixes like Bearer or Basic in the field." />
                    </div>
                    <Input
                      id="auth"
                      value={formData.auth.value}
                      onChange={(e) => handleAuthChange(e.target.value)}
                      placeholder="Enter your API key or token"
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Label htmlFor="documentationUrl">API Documentation (Optional)</Label>
                      <HelpTooltip text="Link to the API's documentation if available" />
                    </div>
                    <Input
                      id="documentationUrl"
                      value={formData.documentationUrl}
                      onChange={handleChange('documentationUrl')}
                      placeholder="https://docs.example.com"
                    />
                  </div>
                  <div>
                    <div className="flex gap-2 items-stretch">
                      <div className="flex-1">
                        <Button
                          variant="outline"
                          onClick={() => setFormData(prev => ({
                            ...prev,
                            inputPayload: prev.inputPayload === '{}' ?
                              JSON.stringify({
                                query: "",
                                filters: {}
                              }, null, 2) :
                              '{}'
                          }))}
                          className="w-full h-full"
                        >
                          {formData.inputPayload === '{}' ? 'Add Request Variables (Optional)' : 'Remove Request Variables'}
                        </Button>
                      </div>
                    </div>

                    {formData.inputPayload !== '{}' && (
                      <div className="mt-3">
                        <div className="flex items-center gap-2 mb-1">
                          <Label>Request Variables</Label>
                          <HelpTooltip text="Add variables to be used in the API call. E.g. IDs that can change for each request." />
                        </div>
                        <Textarea
                          value={formData.inputPayload}
                          onChange={handleChange('inputPayload')}
                          placeholder="Enter JSON payload structure"
                          className="font-mono h-32"
                        />
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}

          {step === 'try_and_output' && (
            <div className="space-y-2 h-full">
              <InteractiveExtractPlayground
                configId={extractId}
                instruction={formData.instruction}
                onInstructionChange={handleChange('instruction')}
                responseSchema={formData.responseSchema}
                onResponseSchemaChange={handleChange('responseSchema')}
                initialRawResponse={initialRawResponse}
                responseMapping={responseMapping}
                onMappedResponse={handleMappedResponse}
                onRun={handleRun}
                isRunning={isRunning}
                mappedResponseData={mappedResponseData}
                hideRunButton={true}
                hideInstruction={true}
                file={file}
              />
            </div>
          )}

          {step === 'success' && (
            <div className="space-y-4 h-full">
              <p className="text-m font-medium">Done!</p>
              <p className="text-sm font-medium">Your extraction is complete. You can now download the results or use the code examples below.</p>

              <Tabs defaultValue="download" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="download">Download Result</TabsTrigger>
                  <TabsTrigger value="curl">cURL</TabsTrigger>
                  <TabsTrigger value="sdk">TypeScript SDK</TabsTrigger>
                </TabsList>

                <TabsContent value="download">
                  <div className="rounded-md bg-muted p-4">
                    <div className="flex items-start space-x-2">
                      <Upload className="mt-0.5 h-5 w-5 text-muted-foreground shrink-0" />
                      <div className="space-y-3 w-full">
                        <p className="text-sm font-medium">Download the extracted data in your preferred format:</p>
                        <div className="flex gap-3">
                          <Button
                            variant="outline"
                            onClick={() => downloadData(mappedResponseData, 'json')}
                            className="flex-1 bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-200/50 hover:border-blue-300/50 text-blue-600 hover:text-blue-700"
                          >
                            <div className="flex items-center justify-center gap-2">
                              <Terminal className="h-4 w-4" />
                              Download JSON
                            </div>
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => downloadData(mappedResponseData, 'csv')}
                            className="flex-1 bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-200/50 hover:border-green-300/50 text-green-600 hover:text-green-700"
                          >
                            <div className="flex items-center justify-center gap-2">
                              <Download className="h-4 w-4" />
                              Download CSV
                            </div>
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="curl">
                  <div className="rounded-md bg-muted p-4">
                    <div className="flex items-start space-x-2">
                      <Terminal className="mt-0.5 h-5 w-5 text-muted-foreground shrink-0" />
                      <div className="space-y-1 w-full">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium">Try the endpoint locally with curl: </p>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            onClick={() => {
                              navigator.clipboard.writeText(getCurlCommand());
                            }}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="relative">
                          <pre className="rounded-lg bg-secondary p-4 text-sm overflow-x-auto whitespace-pre-wrap break-all">
                            <code>{getCurlCommand()}</code>
                          </pre>
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="sdk">
                  <div className="rounded-md bg-muted p-4">
                    <div className="flex items-start space-x-2">
                      <Terminal className="mt-0.5 h-5 w-5 text-muted-foreground shrink-0" />
                      <div className="space-y-1 w-full">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium">Or use the TypeScript SDK in your application: </p>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            onClick={() => {
                              navigator.clipboard.writeText(getSdkCode());
                            }}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="relative">
                          <pre className="rounded-lg bg-secondary p-4 text-sm overflow-x-auto whitespace-pre-wrap break-all">
                            <code>{getSdkCode()}</code>
                          </pre>
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>

        <div className="flex-none mt-2 sm:mt-4 flex flex-col lg:flex-row gap-2 justify-between">
          {step === 'success' ? (
            <>
              <Button
                variant="outline"
                onClick={handleBack}
              >
                Back
              </Button>
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    router.push('/configs')
                    onOpenChange(false)
                  }}
                >
                  Done
                </Button>
              </div>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={handleBack}
                disabled={step === 'basic'}
              >
                Back
              </Button>
              <Button
                onClick={step === 'try_and_output' && !mappedResponseData ? handleRun : handleNext}
                disabled={isAutofilling || (step === 'try_and_output' && !mappedResponseData && isRunning)}
              >
                {isAutofilling ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {step as StepperStep === 'basic' ? 'superglue extracts file...' : 'Configuring...'}
                  </>
                ) : (
                  step === 'try_and_output' ?
                    (isRunning ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Running...
                      </>
                    ) : (!mappedResponseData ? (
                      <>
                        ✨ Run
                      </>
                    ) : 'Complete')) :
                    'Next'
                )}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}