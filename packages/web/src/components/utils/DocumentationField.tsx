'use client'

import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import { FileChip } from '@/src/components/ui/FileChip';
import { FileQuestion, FileText, Link, Upload } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { processFile, sanitizeFileName, formatBytes, MAX_TOTAL_FILE_SIZE_DOCUMENTATION, type UploadedFileInfo } from '@/src/lib/file-utils';
import { cn } from '@/src/lib/general-utils';
import { Input } from '@/src/components/ui/input';
import { useToast } from '@/src/hooks/use-toast';

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
  content,
  onUrlChange,
  onContentChange,
  className,
  placeholder = "https://docs.example.com/api",
  onFileUpload,
  onFileRemove,
  hasUploadedFile = false
}: DocumentationFieldProps) {
  const [localUrl, setLocalUrl] = useState(url)
  const [docFile, setDocFile] = useState<UploadedFileInfo | null>(null)
  const [urlError, setUrlError] = useState(false)
  const { toast } = useToast()

  // Parse multiple files from file:// URL format
  const parseFileUrls = (fileUrl: string): UploadedFileInfo[] => {
    if (!fileUrl.startsWith('file://')) return []
    
    const filesString = fileUrl.replace('file://', '')
    const filenames = filesString.split(',').map(f => f.trim()).filter(Boolean)
    
    // Limit to 5 files for display
    return filenames.slice(0, 5).map(filename => ({
      name: filename,
      size: null,
      key: filename,
      status: 'ready' as const
    }))
  }

  const displayFiles = hasUploadedFile ? (docFile ? [docFile] : parseFileUrls(url)) : []

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

  const handleDocFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Check file size limit
    if (file.size > MAX_TOTAL_FILE_SIZE_DOCUMENTATION) {
      toast({
        title: 'File too large',
        description: `Documentation files cannot exceed ${formatBytes(MAX_TOTAL_FILE_SIZE_DOCUMENTATION)}. Current file: ${formatBytes(file.size)}`,
        variant: 'destructive'
      })
      // Reset file input
      e.target.value = ''
      return
    }

    const fileInfo: UploadedFileInfo = {
      name: file.name,
      size: file.size,
      key: sanitizeFileName(file.name, { removeExtension: false, lowercase: false }),
      status: 'processing'
    }
    setDocFile(fileInfo)

    try {
      const text = await processFile(file, file.name)
      setDocFile({ ...fileInfo, status: 'ready' })
      if (onContentChange) onContentChange(text)
      onUrlChange(`file://${fileInfo.key}`)
      if (typeof onFileUpload === 'function') onFileUpload(text);
    } catch (error: any) {
      console.error('Error reading file:', error)
      setDocFile({ ...fileInfo, status: 'error', error: error.message })
      toast({
        title: 'Failed to process file',
        description: error.message,
        variant: 'destructive'
      })
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
    onUrlChange(fullUrl)
  }, [onUrlChange])

  return (
    <div className={className}>
      {hasUploadedFile && displayFiles.length > 0 ? (
        <div className="space-y-2">
          {displayFiles.map((file, idx) => (
            <FileChip
              key={file.key}
              file={file}
              onRemove={idx === 0 ? handleRemoveFile : undefined}
              size="large"
              rounded="sm"
              showOriginalName={true}
              showSize={file.size > 0}
            />
          ))}
          {url.startsWith('file://') && url.replace('file://', '').split(',').length > 5 && (
            <p className="text-xs text-muted-foreground pl-2">
              + {url.replace('file://', '').split(',').length - 5} more file(s)
            </p>
          )}
        </div>
      ) : (
        // Show URL field when no file is uploaded
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Input
              value={localUrl}
              onChange={(e) => handleUrlChange(e.target.value, '', {})}
              onBlur={() => { }}
              placeholder={placeholder}
              className={cn(
                "pr-28",
                urlError && "border-destructive focus-visible:ring-destructive"
              )}
              required={true}
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
        accept="*"
      />

      {urlError && !hasUploadedFile && (
        <p className="text-sm text-destructive mt-1">Please enter a valid URL or upload a file</p>
      )}
    </div>
  )
}