"use client"

import { X } from 'lucide-react'
import { useEffect, useState } from 'react'

const TUTORIAL_CONTENT = {
  title: "Welcome to superglue",
  content: `
    <p class="mb-4">
      superglue translates data from external systems into the exact format your business needs.
    </p>
    <p class="mb-4">
        You create a configuration which automagically maps the data from an external system into an API endpoint you can call.
    </p>
    <h2 class="text-lg font-semibold mb-2">
    Getting Started
    </h2>
    <ul class="list-disc pl-5 space-y-2 mb-4">
        <li>
            <b>Configurations</b> define the API endpoint you want to call with:
        </li>
        <ul class="list-disc pl-5 space-y-2 mb-4">
            <li>
                <b>API endpoint</b>: the url of the API you want to call
            </li>
            <li>
                <b>Instruction</b>: a natural language instruction for the API
            </li>
            <li>
                <b>Schema</b>: the output schema you want to receive via API
            </li>
            <li>
                You can now try to run the configuration by clicking the <b>Run</b> button.
            </li>
        </ul>
        <li>
            <b>Runs</b> shows all API calls made through superglue.
        </li>
        <li>
            <b>API Keys</b> are used by your backend to call superglue.
        </li>
        <li>
            <b>Documentation</b> contains detailed guides and examples.
        </li>
    </ul>
    <p>
      If you have any questions, please get in touch via <a href="mailto:hi@superglue.com?subject=Quick%20Tutorial%20Question"><u>email</u></a>
      or <a href="https://discord.gg/vUKnuhHtfW" target="_blank" rel="noopener noreferrer"><u>Discord</u></a>.
    </p>
  `
}

export function TutorialModal() {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const hasSeenTutorial = localStorage.getItem('hasSeenTutorial')
    console.log('Tutorial check:', { hasSeenTutorial })
    if (!hasSeenTutorial) {
      console.log('Should show tutorial')
      setIsOpen(true)
    }
  }, [])

  const handleClose = (showAgain: boolean) => {
    if (!showAgain) {
      localStorage.setItem('hasSeenTutorial', 'true')
    }
    setIsOpen(false)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 max-h-full">
      <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-xl mx-4 flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold dark:text-white">
              {TUTORIAL_CONTENT.title}
            </h2>
            <button
              onClick={() => handleClose(false)}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6">
          <div 
            className="text-gray-600 dark:text-gray-300"
            dangerouslySetInnerHTML={{ __html: TUTORIAL_CONTENT.content }}
          />
        </div>
        
        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-4">
          <button
            onClick={() => handleClose(true)}
            className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          >
            Show Again Next Time
          </button>
          <button
            onClick={() => handleClose(false)}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  )
} 