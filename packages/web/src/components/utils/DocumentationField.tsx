'use client'

import { Badge } from '@/src/components/ui/badge'
import { Button } from '@/src/components/ui/button'
import { URLField } from '@/src/components/utils/URLField'
import { FileQuestion, FileText, Link, Upload } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

interface DocumentationFieldProps {
  url: string
  content?: string
  onUrlChange: (url: string) => void
  onContentChange?: (content: string) => void
  className?: string
  placeholder?: string
  onFileUpload?: (extractedText: string) => void
  onFileRemove?: () => void
  hasUploadedFile?: boolean
}

export function DocumentationField({
  url,
  content = '',
  onUrlChange,
  onContentChange,
  className,
  placeholder = "https://docs.example.com/api",
  onFileUpload,
  onFileRemove,
  hasUploadedFile = false
}: DocumentationFieldProps) {
  const [localUrl, setLocalUrl] = useState(url)
  const [docFile, setDocFile] = useState<File | null>(null)
  const [urlError, setUrlError] = useState(false)

  // Extract filename from file:// URL for display
  const getFileNameFromUrl = (fileUrl: string): string | null => {
    if (fileUrl.startsWith('file://')) {
      return fileUrl.replace('file://', '')
    }
    return null
  }

  useEffect(() => {
    setLocalUrl(url)
  }, [url])

  const isValidUrl = (urlString: string): boolean => {
    if (!urlString) return true // Empty is valid
    if (urlString.startsWith('file://')) return true // File uploads are valid
    try {
      new URL(urlString)
      return true
    } catch {
      return false
    }
  }

  const activeType = hasUploadedFile ? 'file' : (url ? 'url' : content ? 'content' : 'empty')

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
      if (onContentChange) onContentChange(text)
      // Set file:// pattern for URL
      onUrlChange(`file://${file.name}`)
      if (typeof onFileUpload === 'function') onFileUpload(text);
    } catch (error) {
      console.error('Error reading file:', error)
    }
  }

  const handleRemoveFile = () => {
    setDocFile(null)
    if (onContentChange) onContentChange('')
    onUrlChange('')
    setLocalUrl('')
    setUrlError(false)
    // Reset the file input so it can be used again
    const fileInput = document.getElementById('doc-file-upload') as HTMLInputElement
    if (fileInput) {
      fileInput.value = ''
    }
    // Notify parent component that file was removed
    if (onFileRemove) {
      onFileRemove()
    }
  }

  const handleUrlChange = useCallback((urlHost: string, urlPath: string, queryParams: Record<string, string>) => {
    const fullUrl = urlHost + (urlPath || '')
    setLocalUrl(fullUrl)

    // Check if URL is valid
    const isValid = isValidUrl(fullUrl) || fullUrl === ''
    setUrlError(fullUrl !== '' && !isValid)

    // Only propagate valid URLs or empty string
    if (isValid) {
      onUrlChange(fullUrl)
    }
    // If invalid, don't propagate the change but keep local state for display
  }, [onUrlChange, isValidUrl])

  const handleBlur = useCallback(() => {
    // On blur, ensure we have a valid URL or empty string
    if (!isValidUrl(localUrl) && localUrl !== '') {
      setLocalUrl(url) // Revert to last valid URL
      setUrlError(false)
    }
  }, [localUrl, url, isValidUrl])

  return (
    <div className={className}>
      {hasUploadedFile ? (
        // Show file info when file is uploaded
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <div className="flex items-center gap-2 p-3 border rounded-md bg-muted/50">
              <Upload className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium">{docFile?.name || getFileNameFromUrl(url) || 'Uploaded file'}</span>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={handleRemoveFile}
          >
            Remove
          </Button>
        </div>
      ) : (
        // Show URL field when no file is uploaded
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <URLField
              url={localUrl}
              onUrlChange={handleUrlChange}
              placeholder={placeholder}
              error={urlError}
            />
            <Badge variant="outline" className="absolute right-2 top-1/2 -translate-y-1/2 bg-background border">
              {activeType === 'url' ? (
                <><Link className="h-3 w-3 mr-1" /> URL</>
              ) : activeType === 'content' ? (
                <><FileText className="h-3 w-3 mr-1" /> Manual Content</>
              ) : (
                <><FileQuestion className="h-3 w-3 mr-1" /> None</>
              )}
            </Badge>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => document.getElementById('doc-file-upload')?.click()}
          >
            Upload
          </Button>
        </div>
      )}

      <input
        type="file"
        id="doc-file-upload"
        hidden
        onChange={handleDocFileUpload}
        accept=".pdf,.txt,.md,.doc,.docx"
      />

      {urlError && !hasUploadedFile && (
        <p className="text-sm text-destructive mt-1">Please enter a valid URL or upload a file</p>
      )}
    </div>
  )
}