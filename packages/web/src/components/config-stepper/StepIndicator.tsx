import { cn } from '@/src/lib/utils'
import { Check } from 'lucide-react'

export type StepperStep = 'basic' | 'try_and_output' | 'success'

interface StepConfig {
  id: StepperStep
  title: string
}

export const STEPS: StepConfig[] = [
  {
    id: 'basic',
    title: 'Basic Info'
  },
  {
    id: 'try_and_output',
    title: 'Try It!'
  },
  {
    id: 'success',
    title: 'Complete'
  }
]

interface StepIndicatorProps {
  currentStep: StepperStep
}

export function StepIndicator({ currentStep }: StepIndicatorProps) {
  const currentIndex = STEPS.findIndex(s => s.id === currentStep)

  return (
    <div className="py-3">
      <div className="relative">
        {/* Progress bar background */}
        <div className="absolute top-4 left-0 w-full h-0.5 bg-muted" />
        
        {/* Active progress bar */}
        <div 
          className="absolute top-4 left-0 h-0.5 bg-primary transition-all duration-500 ease-in-out"
          style={{ width: `${(currentIndex / (STEPS.length - 1)) * 100}%` }}
        />

        {/* Steps */}
        <div className="relative grid grid-cols-3 w-full">
          {STEPS.map((step, index) => {
            const isActive = index === currentIndex
            const isCompleted = index < currentIndex

            return (
              <div
                key={step.id}
                className="flex flex-col items-center"
              >
                <div className="flex flex-col items-center gap-1.5">
                  <div
                    className={cn(
                      'w-7 h-7 rounded-full border-2 flex items-center justify-center text-sm font-medium transition-colors',
                      isCompleted && 'border-primary bg-primary text-primary-foreground',
                      isActive && 'border-primary bg-background text-foreground',
                      !isCompleted && !isActive && 'border-muted bg-muted/50 text-muted-foreground'
                    )}
                  >
                    {isCompleted ? (
                      <Check className="h-4 w-3.5" />
                    ) : (
                      index + 1
                    )}
                  </div>
                  <span
                    className={cn(
                      'text-xs font-medium text-center px-1',
                      (isActive || isCompleted) ? 'text-foreground' : 'text-muted-foreground'
                    )}
                  >
                    {step.title}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
} 