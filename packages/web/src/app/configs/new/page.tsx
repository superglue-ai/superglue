'use client'

import { ConfigCreateStepper } from '@/src/components/ConfigCreateStepper'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function CreateConfigPage() {
  const router = useRouter()

  return (
    <ConfigCreateStepper 
      mode="create"
    />
  )
}
