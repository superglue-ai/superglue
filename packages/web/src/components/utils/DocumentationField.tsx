'use client'

import { useState, useCallback, useEffect } from 'react'
import { Button } from '@/src/components/ui/button'
import { Input } from '@/src/components/ui/input'
import { Upload, Link, FileText, FileQuestion } from 'lucide-react'
import { Badge } from '@/src/components/ui/badge'

interface DocumentationFieldProps {
  url: string
  content: string
  onUrlChange: (url: string) => void
  onContentChange: (content: string) => void
  className?: string
}

export function DocumentationField({
  url,
  content,
  onUrlChange,
  onContentChange,
  className
}: DocumentationFieldProps) {
  const [docFile, setDocFile] = useState<File | null>(null)
  const activeType = url ? 'url' : content ? (docFile ? 'file' : 'content') : 'empty'
  
  // Derived state for display purposes only
  const displayValue = url || (content ? (
    content.length > 200 ? content.substring(0, 200) + '...' : content
  ) : '')

  const handleDocFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    try {
      let text = ''
      if (file.type === 'application/pdf') {
        // For PDFs, use pdf.js
        const pdfjsLib = await import('pdfjs-dist');
        // Update worker path to use .mjs extension
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
        
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item: any) => item.str).join(' ');
          fullText += pageText + '\n';
        }
        text = fullText;
      } else {
        // For text files (.txt, .md, etc)
        text = await file.text();
      }
      setDocFile(file)
      onContentChange(text)
      onUrlChange('')
    } catch (error) {
      console.error('Error reading file:', error)
      // You might want to add user-facing error handling here
      // e.g., setDocFile(null); onContentChange(''); // Clear state
      // alert('Failed to read PDF. Please try another file.');
    }
  }

  // Optimize input change handling
  const handleInputChange = useCallback((value: string) => {
    // Don't allow changes if a file is uploaded
    if (docFile) return
    
    // Quick check before regex for better performance
    if (value.startsWith('http://') || value.startsWith('https://')) {
      onUrlChange(value)
      if (content) onContentChange('')
    } else {
      onContentChange(value)
      if (url) onUrlChange('')
    }
  }, [content, url, docFile, onUrlChange, onContentChange]);

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Input
            value={displayValue}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder="Enter URL or documentation content..."
            className={`pr-20 ${docFile ? 'bg-muted cursor-not-allowed' : ''}`}
            title={content?.length > 200 ? content : undefined}
            readOnly={docFile !== null}
          />
          <Badge variant="outline" className="absolute right-2 top-1/2 -translate-y-1/2">
            {activeType === 'url' ? (
              <><Link className="h-3 w-3 mr-1" /> URL</>
            ) : activeType === 'file' ? (
              <><Upload className="h-3 w-3 mr-1" /> File</>
            ) : activeType === 'content' ? (
              <><FileText className="h-3 w-3 mr-1" /> Content</>
            ) : (
              <><FileQuestion className="h-3 w-3 mr-1" /> None</>
            )}
          </Badge>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => document.getElementById('doc-file-upload')?.click()}
        >
          Upload
        </Button>
        
        {(url || content) && (
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
            onClick={() => {
              onContentChange('')
              onUrlChange('')
              setDocFile(null)
            }}
          >
            Clear
          </Button>
        )}
            
        <input
          type="file"
          id="doc-file-upload"
          hidden
          onChange={handleDocFileUpload}
        />
      </div>
    </div>
  )
}