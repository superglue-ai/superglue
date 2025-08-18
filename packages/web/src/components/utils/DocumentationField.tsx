'use client'

import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import * as JSZip from 'jszip';
import { FileQuestion, FileText, Link, Upload } from 'lucide-react';
import * as mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';
import { useCallback, useEffect, useState } from 'react';
import { cn } from '../../lib/utils';
import { Input } from '../ui/input';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

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

  const processFile = async (file: File | Blob, fileName: string): Promise<string> => {
    const fileType = file.type
    const lowerFileName = fileName.toLowerCase()
    
    // Check both MIME type and file extension for PDF detection
    if (fileType === 'application/pdf' || lowerFileName.endsWith('.pdf')) {
      // Extract text from PDF and convert to markdown
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      
      let markdownContent = '';
      const numPages = pdf.numPages;
      
      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        
        // Get viewport to understand page dimensions
        const viewport = page.getViewport({ scale: 1.0 });
        const pageHeight = viewport.height;
        
        // Extract text items with position and style info
        const textItems = textContent.items as any[];
        const enrichedItems = textItems.map(item => ({
          text: item.str,
          x: Math.round(item.transform[4]),
          y: Math.round(item.transform[5]),
          width: item.width,
          height: item.height,
          fontSize: Math.round(Math.sqrt(item.transform[0] * item.transform[0] + item.transform[1] * item.transform[1])),
          fontName: item.fontName || ''
        }));
        
        // Group items by lines
        const lines: {
          y: number;
          items: typeof enrichedItems;
          avgFontSize: number;
          isBold: boolean;
          minX: number;
          maxX: number;
        }[] = [];
        
        enrichedItems.forEach(item => {
          if (!item.text.trim()) return;
          
          // Find line at this Y position (with tolerance)
          let line = lines.find(l => Math.abs(l.y - item.y) < 3);
          
          if (!line) {
            line = {
              y: item.y,
              items: [],
              avgFontSize: 0,
              isBold: false,
              minX: item.x,
              maxX: item.x + item.width
            };
            lines.push(line);
          }
          
          line.items.push(item);
          line.minX = Math.min(line.minX, item.x);
          line.maxX = Math.max(line.maxX, item.x + item.width);
        });
        
        // Calculate average font size and detect bold for each line
        lines.forEach(line => {
          const totalSize = line.items.reduce((sum, item) => sum + item.fontSize, 0);
          line.avgFontSize = totalSize / line.items.length;
          line.isBold = line.items.some(item => 
            item.fontName.toLowerCase().includes('bold') || 
            item.fontName.toLowerCase().includes('heavy')
          );
        });
        
        // Sort lines by Y position (top to bottom)
        lines.sort((a, b) => b.y - a.y);
        
        // Detect tables by finding aligned columns
        const detectTable = (startIdx: number): { rows: string[][], endIdx: number } | null => {
          const potentialRows: typeof lines[0][] = [];
          const columnPositions: number[] = [];
          
          // Look for multiple lines with similar X positions
          for (let i = startIdx; i < lines.length; i++) {
            const line = lines[i];
            if (line.items.length < 2) continue; // Need at least 2 items for a table row
            
            // Sort items by X position
            const sortedItems = [...line.items].sort((a, b) => a.x - b.x);
            
            // Extract column positions
            const lineColumns = sortedItems.map(item => item.x);
            
            if (columnPositions.length === 0) {
              columnPositions.push(...lineColumns);
              potentialRows.push(line);
            } else {
              // Check if this line aligns with existing columns
              let matches = 0;
              for (const pos of lineColumns) {
                if (columnPositions.some(col => Math.abs(col - pos) < 10)) {
                  matches++;
                }
              }
              
              if (matches >= lineColumns.length * 0.5) {
                potentialRows.push(line);
              } else {
                break; // End of table
              }
            }
            
            // Stop if gap is too large
            if (i > startIdx && Math.abs(line.y - lines[i-1].y) > 50) {
              break;
            }
          }
          
          if (potentialRows.length >= 2) {
            // Convert to table rows
            const rows = potentialRows.map(line => {
              const sortedItems = [...line.items].sort((a, b) => a.x - b.x);
              const cells: string[] = [];
              
              // Group items into cells based on large gaps
              let currentCell = '';
              let lastX = 0;
              
              sortedItems.forEach((item, idx) => {
                if (idx > 0 && item.x - lastX > 20) {
                  cells.push(currentCell.trim());
                  currentCell = item.text;
                } else {
                  currentCell += (currentCell ? ' ' : '') + item.text;
                }
                lastX = item.x + item.width;
              });
              
              if (currentCell) {
                cells.push(currentCell.trim());
              }
              
              return cells;
            });
            
            return { 
              rows, 
              endIdx: startIdx + potentialRows.length - 1 
            };
          }
          
          return null;
        };
        
        // Find average font size across the page
        const allFontSizes = lines.map(l => l.avgFontSize).filter(s => s > 0);
        const avgPageFontSize = allFontSizes.length > 0 
          ? allFontSizes.reduce((a, b) => a + b, 0) / allFontSizes.length 
          : 12;
        
        // Convert to markdown
        let pageContent = ``;
        let prevY = null;
        let i = 0;
        
        while (i < lines.length) {
          const line = lines[i];
          const text = line.items.map(item => item.text).join(' ').trim();
          
          if (!text) {
            i++;
            continue;
          }
          
          // Check for table
          const tableResult = detectTable(i);
          if (tableResult) {
            // Format as markdown table
            const { rows } = tableResult;
            if (rows.length > 0) {
              // First row as header
              pageContent += '| ' + rows[0].join(' | ') + ' |\n';
              pageContent += '|' + rows[0].map(() => ' --- ').join('|') + '|\n';
              
              // Rest as data rows
              for (let j = 1; j < rows.length; j++) {
                pageContent += '| ' + rows[j].join(' | ') + ' |\n';
              }
              pageContent += '\n';
            }
            
            i = tableResult.endIdx + 1;
            prevY = line.y;
            continue;
          }
          
          // Add paragraph breaks for larger gaps
          if (prevY !== null && prevY - line.y > 25) {
            pageContent += '\n';
          }
          
          // Improved heading detection
          let isHeading = false;
          let headingLevel = 3;
          
          // Check font size relative to average
          const sizeRatio = line.avgFontSize / avgPageFontSize;
          if (sizeRatio > 1.5) {
            isHeading = true;
            headingLevel = 1;
          } else if (sizeRatio > 1.3) {
            isHeading = true;
            headingLevel = 2;
          } else if (sizeRatio > 1.15 || line.isBold) {
            isHeading = true;
            headingLevel = 3;
          }
          
          // Additional heading patterns
          if (!isHeading && text.length < 80) {
            // Numbered sections (1., 1.1, etc.)
            if (/^\d+(\.\d+)*\.?\s+[A-Z]/.test(text)) {
              isHeading = true;
              headingLevel = text.split('.').length + 1; // More dots = deeper level
            }
            // All caps (but not single words)
            else if (text === text.toUpperCase() && text.split(' ').length > 1) {
              isHeading = true;
              headingLevel = 3;
            }
            // Lines ending with colon (often section headers)
            else if (text.endsWith(':') && text.length < 50) {
              isHeading = true;
              headingLevel = 4;
            }
          }
          
          // Apply heading or normal text
          if (isHeading) {
            const prefix = '#'.repeat(Math.min(headingLevel + 2, 6)); // Offset by 2 since page is H2
            pageContent += `${prefix} ${text}\n\n`;
          } else {
            pageContent += `${text}\n`;
          }
          
          prevY = line.y;
          i++;
        }
        
        markdownContent += pageContent + '\n---\n\n';
      }
      
      return markdownContent.trim();
    } else if (fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
               lowerFileName.endsWith('.docx')) {
      // For DOCX files, use mammoth
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      return result.value;
    } else if (fileType === 'application/zip' || 
               fileType === 'application/x-zip-compressed' || 
               lowerFileName.endsWith('.zip')) {
      // For ZIP files, extract text from files inside
      const arrayBuffer = await file.arrayBuffer();
      const zip = new (JSZip as any)();
      const loadedZip = await zip.loadAsync(arrayBuffer);
      
      let combinedText = '';
      
      const files = Object.entries(loadedZip.files) as [string, any][];
      for (const [zipFileName, zipEntry] of files) {
        // Skip directories
        if (zipEntry.dir) continue;
        
        // Skip macOS metadata files
        if (zipFileName.startsWith('__MACOSX/') || zipFileName.startsWith('._')) continue;
        
        try {
          // Get the file as a blob
          const blob = await zipEntry.async('blob');
          
          // Determine MIME type from filename since blob won't have it
          let mimeType = 'text/plain';
          const lowerZipFileName = zipFileName.toLowerCase();
          if (lowerZipFileName.endsWith('.pdf')) {
            mimeType = 'application/pdf';
          } else if (lowerZipFileName.endsWith('.docx')) {
            mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
          } else if (lowerZipFileName.endsWith('.doc')) {
            mimeType = 'application/msword';
          }
          
          // Create a new blob with the correct MIME type
          const typedBlob = new Blob([blob], { type: mimeType });
          
          const content = await processFile(typedBlob, zipFileName);
          
          if (content && content.trim()) {
            combinedText += `\n--- ${zipFileName} ---\n${content}\n`;
          }
        } catch (error) {
          console.warn(`Could not extract text from ${zipFileName}:`, error);
        }
      }
      
      return combinedText || `ZIP file contains ${Object.keys(loadedZip.files).length} files but no extractable text files were found.`;
    } else {
      // For text files (.txt, .md, etc)
      return await file.text();
    }
  }

  const handleDocFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const text = await processFile(file, file.name)
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
    onUrlChange(fullUrl)
  }, [onUrlChange])

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
            <Input
              value={localUrl}
              onChange={(e) => handleUrlChange(e.target.value, '', {} )}
              onBlur={() => {}}
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