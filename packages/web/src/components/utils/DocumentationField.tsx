'use client'

import { Badge } from '@/src/components/ui/badge'
import { Button } from '@/src/components/ui/button'
import { Input } from '@/src/components/ui/input'
import { FileQuestion, FileText, Link, Upload } from 'lucide-react'
import { useCallback, useState } from 'react'

interface DocumentationFieldProps {
  url: string
  content: string
  onUrlChange: (url: string) => void
  onContentChange: (content: string) => void
  className?: string
  onFileUpload?: (extractedText: string) => void
  hasUploadedFile?: boolean
}

export function DocumentationField({
  url,
  content,
  onUrlChange,
  onContentChange,
  className,
  onFileUpload,
  hasUploadedFile = false
}: DocumentationFieldProps) {
  const [docFile, setDocFile] = useState<File | null>(null)
  const activeType = url ? 'url' : content ? (hasUploadedFile ? 'file' : 'content') : 'empty'

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
      if (typeof onFileUpload === 'function') onFileUpload(text);
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
    if (hasUploadedFile) return

    // Quick check before regex for better performance
    if (value.startsWith('http://') || value.startsWith('https://')) {
      onUrlChange(value)
      if (content) onContentChange('')
    } else {
      onContentChange(value)
      if (url) onUrlChange('')
    }
  }, [content, url, hasUploadedFile, onUrlChange, onContentChange]);

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Input
            value={displayValue}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder="Enter URL or documentation content..."
            className={`pr-20 ${hasUploadedFile ? 'bg-muted cursor-not-allowed' : ''}`}
            title={content?.length > 200 ? content : undefined}
            readOnly={hasUploadedFile}
          />
          <Badge variant="outline" className="absolute right-2 top-1/2 -translate-y-1/2">
            {hasUploadedFile ? (
              <><Upload className="h-3 w-3 mr-1 text-green-600" /> File Uploaded</>
            ) : activeType === 'url' ? (
              <><Link className="h-3 w-3 mr-1" /> URL</>
            ) : activeType === 'content' ? (
              <><FileText className="h-3 w-3 mr-1" /> Manual Content</>
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