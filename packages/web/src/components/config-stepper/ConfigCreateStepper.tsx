'use client'

import { useConfig } from '@/src/app/config-context'
import { useToast } from '@/src/hooks/use-toast'
import { cleanApiDomain, cn } from '@/src/lib/utils'
import { ApiConfig, AuthType, CacheMode, SuperglueClient } from '@superglue/client'
import { Copy, Loader2, Terminal } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { InteractiveApiPlayground } from '../InteractiveApiPlayground'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import { HelpTooltip, inputErrorStyles, parseCredentialsHelper } from './Helpers'
import { StepIndicator, type StepperStep } from './StepIndicator'

interface ConfigCreateStepperProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  configId?: string // not used, but if we later want to edit through this flow
  mode?: 'create' | 'edit'
}


export function ConfigCreateStepper({ open, onOpenChange, configId: initialConfigId, mode = 'create' }: ConfigCreateStepperProps) {
  const [step, setStep] = useState<StepperStep>('basic')
  const [isAutofilling, setIsAutofilling] = useState(false)
  const { toast } = useToast()
  const router = useRouter()
  const superglueConfig = useConfig()

  const [configId, setConfigId] = useState<string>(initialConfigId || '')
  const [initialRawResponse, setInitialRawResponse] = useState<any>(null)
  const [hasMappedResponse, setHasMappedResponse] = useState(false)
  const [mappedResponseData, setMappedResponseData] = useState<any>(null)
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

  const handleUrlBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const url = e.target.value
    try {
      const urlObj = new URL(url)
      const cleanedHost = cleanApiDomain(`${urlObj.protocol}//${urlObj.host}`)
      const path = urlObj.pathname === '/' ? '' : urlObj.pathname
      
      setFormData(prev => ({
        ...prev,
        urlHost: cleanedHost,
        ...(path ? { urlPath: path } : {})
      }))
    } catch {
      // If URL parsing fails, just use existing cleanApiDomain
      const cleanedUrl = cleanApiDomain(url)
      setFormData(prev => ({
        ...prev,
        urlHost: cleanedUrl
      }))
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
      
      if (!formData.urlHost) {
        errors.urlHost = true
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
    }

    if (step === 'auth') {
      setIsAutofilling(true)
      try {
        const superglueClient = new SuperglueClient({
          endpoint: superglueConfig.superglueEndpoint,
          apiKey: superglueConfig.superglueApiKey
        })

        // Call autofill endpoint
        const response = await superglueClient.call({
          endpoint: {
            urlHost: formData.urlHost,
            ...(formData.urlPath ? { urlPath: formData.urlPath } : {}),
            ...(formData.documentationUrl ? { documentationUrl: formData.documentationUrl } : {}),
            instruction: formData.instruction,
            authentication: formData.auth.value ? AuthType.HEADER : AuthType.NONE
          },
          payload: JSON.parse(formData.inputPayload),
          credentials: parseCredentialsHelper(formData.auth.value, JSON.parse(formData.auth.advancedConfig)),
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
          const id = formData.urlHost.replace(/^https?:\/\//, '').replace(/\//g, '') + '-' + Math.floor(1000 + Math.random() * 9000)
          setConfigId(id)

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

    if (step === 'try_and_output') {
      // Save the configuration with the updated schema
      try {
        const superglueClient = new SuperglueClient({
          endpoint: superglueConfig.superglueEndpoint,
          apiKey: superglueConfig.superglueApiKey
        })

        const savedConfig = await superglueClient.upsertApi(configId, {
          id: configId,
          urlHost: formData.urlHost,
          instruction: formData.instruction,
          documentationUrl: formData.documentationUrl || undefined,
          // authentication: formData.auth.value ? AuthType.HEADER : AuthType.NONE,
          // headers: {},
          // TODO: enable headers
          // headers: formData.auth.value ? { 'Authorization': formData.auth.value } : undefined,
          responseSchema: JSON.parse(formData.responseSchema),
          createdAt: new Date(),
          updatedAt: new Date()
        } as ApiConfig)

        if (!savedConfig) {
          throw new Error('Failed to save configuration')
        }

        // TODO: show some notification to the user that something has been saved
        // toast({
        //   title: 'Configuration Saved',
        //   description: 'Your API configuration has been saved with the updated schema.',
        // })
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

    const steps: StepperStep[] = ['basic', 'auth', 'try_and_output', 'success']
    const currentIndex = steps.indexOf(step)
    if (currentIndex < steps.length - 1) {
      setStep(steps[currentIndex + 1])
    }
  }

  const handleBack = () => {
    const steps: StepperStep[] = ['basic', 'auth', 'try_and_output', 'success']
    const currentIndex = steps.indexOf(step)
    if (currentIndex > 0) {
      setStep(steps[currentIndex - 1])
    }
  }

  const handleClose = () => {
    if (mode === 'create') {
      router.push('/configs')
    } else {
      router.push(`/configs/${configId}/edit`)
    }
    onOpenChange(false)
  }

  const getCurlCommand = () => {
    let payload = {}
    try {
      payload = JSON.parse(formData.inputPayload)
    } catch (e) {
      console.warn('Invalid input payload JSON')
    }

    const credentials = parseCredentialsHelper(formData.auth.value, JSON.parse(formData.auth.advancedConfig))

    const graphqlQuery = {
      query: `mutation { call(input: { id: "${configId}" }, payload: ${JSON.stringify(payload)}, credentials: ${JSON.stringify(credentials)}) { data } }`
    }
    const command = `curl -X POST "${superglueConfig.superglueEndpoint}/graphql" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${superglueConfig.superglueApiKey}" \\
  -d '${JSON.stringify(graphqlQuery)}'`
    
    return command
  }

  const getSdkCode = () => {
    const credentials = parseCredentialsHelper(formData.auth.value, JSON.parse(formData.auth.advancedConfig))
    return `npm install @superglue/client

// in your app:
import { SuperglueClient } from "@superglue/client";
const superglue = new SuperglueClient({
  apiKey: "${superglueConfig.superglueApiKey}"
});

// Transform any API response with a single call
const result = await superglue.call({ 
  id: "${configId}",
  payload: ${formData.inputPayload},
  credentials: ${JSON.stringify(credentials)}
})`
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
      await superglueClient.upsertApi(configId, {
        id: configId,
        instruction: formData.instruction,
        responseSchema: JSON.parse(formData.responseSchema)
      })

      // 2. Call the API using the config ID and get mapped response
      const mappedResult = await superglueClient.call({
        id: configId,
        payload: JSON.parse(formData.inputPayload),
        credentials: parseCredentialsHelper(formData.auth.value, JSON.parse(formData.auth.advancedConfig))
      })

      if (mappedResult.error) {
        throw new Error(mappedResult.error)
      }

      // 3. Set the mapped response
      const mappedData = mappedResult.data
      setMappedResponseData(mappedData)
      setHasMappedResponse(true)
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

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent 
        className="h-[100vh] w-[100vw] max-w-[100vw] p-12 gap-0 rounded-none border-none"
        onPointerDownOutside={e => e.preventDefault()}
      >
        <DialogHeader>
          <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
            <DialogTitle>
              {step === 'success' ? 'Configuration Complete!' : 'Create New API Configuration'}
            </DialogTitle>
            {!step.includes('success') && (
              <Button
                variant="outline"
                className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-200/50 hover:border-blue-300/50 text-blue-600 hover:text-blue-700 text-sm px-4 py-1 h-8 rounded-full animate-pulse shrink-0"
                onClick={() => window.open('https://cal.com/teamindex/onboarding', '_blank')}
              >
                ✨ Get help from our team
              </Button>
            )}
          </div>
        </DialogHeader>

        <StepIndicator currentStep={step} />

        <div className="mt-4 flex-1 overflow-y-auto px-1">
          {step === 'basic' && (
            <div className="space-y-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Label htmlFor="instruction">What do you want to get from this API?</Label>
                  <HelpTooltip text="Describe what data you want to extract from this API in plain English" />
                </div>
                <Textarea
                  id="instruction"
                  value={formData.instruction}
                  onChange={(e) => {
                    handleChange('instruction')(e)
                    if (e.target.value) {
                      setValidationErrors(prev => ({ ...prev, instruction: false }))
                    }
                  }}
                  placeholder="E.g. 'Get all products with price and name'"
                  autoFocus
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
                  onBlur={handleUrlBlur}
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
                  className="w-full"
                >
                  {formData.inputPayload === '{}' ? 'Add Request Variables (Optional)' : 'Remove Request Variables'}
                </Button>

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
            </div>
          )}

          {step === 'auth' && (
            <div className="space-y-6">
              {formData.auth.advancedConfig === '{}' ? (
                <div className="space-y-4 h-full">
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
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label>Advanced Authentication Configuration</Label>
                    <HelpTooltip text="Configure more complex auth which needs multiple fields like user/password." />
                  </div>
                  <Textarea
                    value={formData.auth.advancedConfig}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      auth: {
                        ...prev.auth,
                        advancedConfig: e.target.value
                      }
                    }))}
                    placeholder="Enter JSON configuration"
                    className="font-mono h-48"
                  />
                </div>
              )}
              
              <div className="space-y-4 h-full">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                </div>

                <Button
                  variant="outline"
                  onClick={() => setFormData(prev => ({
                    ...prev,
                    auth: {
                      ...prev.auth,
                      value: '', // Clear the simple auth value when switching
                      advancedConfig: prev.auth.advancedConfig === '{}' ? 
                        JSON.stringify({
                          username: '',
                          password: '',
                          // Uncomment fields below if needed:
                          // bearer_token: "",
                          // api_key: "",
                          // custom_headers: {}
                        }, null, 2) : 
                        '{}'
                    }
                  }))}
                  className="w-full"
                >
                  {formData.auth.advancedConfig === '{}' ? 'Switch to Advanced Authentication' : 'Switch back to Simple Authentication'}
                </Button>
              </div>
            </div>
          )}

          {step === 'try_and_output' && configId && (
            <div className="space-y-2 h-full">
              <InteractiveApiPlayground 
                configId={configId}
                instruction={formData.instruction}
                onInstructionChange={handleChange('instruction')}
                responseSchema={formData.responseSchema}
                onResponseSchemaChange={handleChange('responseSchema')}
                initialRawResponse={initialRawResponse}
                onMappedResponse={handleMappedResponse}
                onRun={handleRun}
                isRunning={isRunning}
                mappedResponseData={mappedResponseData}
                hideRunButton={true}
              />
            </div>
          )}

          {step === 'success' && (
            <div className="space-y-4 h-full">
              <p className="text-m font-medium">Done! superglue has configured the API endpoint. You can now use it from your application</p>
              <p className="text-sm font-medium">When you call your superglue API, the call is directly proxied to the targeted endpoint without any AI inbewteen. Thus, API calls remain predicable and fast with ms latency. We provide a TypeScript client SDK for easy integration in your application.</p>
              <div className="rounded-md bg-muted p-4">
                <div className="flex items-start space-x-2">
                  <Terminal className="mt-0.5 h-5 w-5 text-muted-foreground" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Try the endpoint locally with curl: </p>
                    <div className="relative flex items-start gap-2">
                      <pre className="flex-1 rounded-lg bg-secondary p-4 text-sm">
                        <code>{getCurlCommand()}</code>
                      </pre>
                      <Button
                        variant="ghost" 
                        size="icon"
                        className="h-8 w-8 flex-none mt-2"
                        onClick={() => {
                          navigator.clipboard.writeText(getCurlCommand());
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="rounded-md bg-muted p-4">
                <div className="flex items-start space-x-2">
                  <Terminal className="mt-0.5 h-5 w-5 text-muted-foreground" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Or use the TypeScript SDK in your application: </p>
                    <div className="relative flex items-start gap-2">
                      <pre className="flex-1 rounded-lg bg-secondary p-4 text-sm">
                        <code>{getSdkCode()}</code>
                      </pre>
                      <Button
                        variant="ghost" 
                        size="icon"
                        className="h-8 w-8 flex-none"
                        onClick={() => {
                          navigator.clipboard.writeText(getSdkCode());
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>


            </div>
          )}
        </div>

        <div className="mt-4 flex flex-col lg:flex-row gap-2 justify-between">
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
                  variant="outline"
                  onClick={() => {
                    router.push(`/configs/${configId}/edit`)
                    onOpenChange(false)
                  }}
                >
                  Advanced Edit
                </Button>
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
                    {step as StepperStep === 'auth' ? 'superglue automagically configures API...' : 'Configuring...'}
                  </>
                ) : (
                  step === 'try_and_output' ? 
                    (isRunning ? 'Running...' : (!mappedResponseData ? 'Run' : 'Complete')) : 
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
