import { HelpCircle } from "lucide-react"
import { Tooltip, TooltipContent } from "../ui/tooltip"
import { TooltipProvider } from "../ui/tooltip"
import { TooltipTrigger } from "../ui/tooltip"

export const inputErrorStyles = "!border-destructive !border-[1px] focus:!ring-0 focus:!ring-offset-0"

export const parseCredentialsHelper = (simpleCreds: string) : Record<string, any> => {
  const creds = simpleCreds?.trim() || ""
  if(!creds) {
    return {}
  }

  if (creds.startsWith('{')) {
    return JSON.parse(creds)
  }

  if(creds.startsWith('Bearer ')) {
    return { apiKey: creds.replace('Bearer ', '') }
  }

  if(creds.startsWith('Basic ')) {
    return { apiKey: creds.replace('Basic ', '') }
  }

  return { apiKey: creds }
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
