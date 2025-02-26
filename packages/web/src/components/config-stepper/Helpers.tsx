import { HelpCircle } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../assistant-ui/assistant"

export const inputErrorStyles = "!border-destructive !border-[1px] focus:!ring-0 focus:!ring-offset-0"

export const parseCredentialsHelper = (simpleCreds: string, advancedCreds: JSON) : Record<string, any> => {
  if (simpleCreds?.trim()) {
    if(simpleCreds.includes('Bearer ')) {
      return { apiKey: simpleCreds.replace('Bearer ', '') }
    }
    if(simpleCreds.includes('Basic ')) {
      return { apiKey: simpleCreds.replace('Basic ', '') }
    }
    return { apiKey: simpleCreds }
  } else if (advancedCreds) {
    const advancedCredsStr = JSON.stringify(advancedCreds)
    if (advancedCredsStr === '{}' || advancedCredsStr === '""' || advancedCredsStr === JSON.stringify({username: '', password: ''})) {
      return {}
    }
    return JSON.parse(advancedCredsStr)
  }
  return {}
}

export function HelpTooltip({ text }: { text: string }) {
  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip defaultOpen={false}>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-full hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring p-0.5"
          >
            <HelpCircle className="h-4 w-4 text-muted-foreground" />
            <span className="sr-only">Help</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">
          <p className="max-w-xs text-sm">{text}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
