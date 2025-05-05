'use client'

import { ExtractCreateStepper } from '@/src/components/extract/ExtractCreateStepper'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function CreateConfigPage() {
  const [showCreateStepper, setShowCreateStepper] = useState(true)
  const router = useRouter()

  return (
    <ExtractCreateStepper 
      open={showCreateStepper} 
      onOpenChange={setShowCreateStepper}
      mode="create"
    />
  )
}
