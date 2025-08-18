---
title: 'FTP/SFTP Integration'
description: 'Learn how to connect and manage files on FTP, FTPS, and SFTP servers in Superglue workflows'
---

# FTP/SFTP Integration

Superglue provides native support for FTP, FTPS (FTP over SSL/TLS), and SFTP (SSH File Transfer Protocol) servers, allowing you to manage files directly within your workflows without setting up a separate integration.

## Connection Protocols

### FTP (File Transfer Protocol)
Standard unencrypted file transfer:
```json
{
  "urlHost": "ftp://username:password@ftp.example.com:21",
  "urlPath": "/base/path"
}
```

### FTPS (FTP Secure)
FTP over SSL/TLS for encrypted transfers:
```json
{
  "urlHost": "ftps://username:password@ftp.example.com:21",
  "urlPath": "/base/path"
}
```

### SFTP (SSH File Transfer Protocol)
Secure file transfer over SSH:
```json
{
  "urlHost": "sftp://username:password@sftp.example.com:22",
  "urlPath": "/base/path"
}
```

## Authentication Methods

### 1. Password Authentication
Include credentials in the connection URL:
```
ftp://myuser:mypassword@ftp.example.com:21
```

### 2. Using Variables
Use Superglue variables for secure credential management:
```
sftp://<<integrationId_ftpUser>>:<<integrationId_ftpPassword>>@<<integrationId_ftpHost>>:<<integrationId_ftpPort>>
```

### 3. SSH Key Authentication (SFTP only)
For SFTP connections with SSH keys, provide credentials separately:
```javascript
{
  "urlHost": "sftp://<<integrationId_ftpUser>>:<<integrationId_ftpPassword>>@<<integrationId_ftpHost>>:<<integrationId_ftpPort>>",
  "credentials": {
    "username": "<<integrationId_ftpUser>>",
    "privateKey": "<<integrationId_sshPrivateKey>>",
    "passphrase": "<<integrationId_sshPassphrase>>"
  }
}
```

## Supported Operations

All operations return JSON responses (files are not saved locally).

### 1. List Directory Contents

List files and directories:
```json
{
  "body": {
    "operation": "list",
    "path": "/documents"
  }
}
```

**Response:**
```json
[
  {
    "name": "report.pdf",
    "size": 102400,
    "type": "file",
    "modifyTime": "2024-01-15T10:30:00.000Z",
    "permissions": "rw-r--r--"
  },
  {
    "name": "archives",
    "size": 0,
    "type": "directory",
    "modifyTime": "2024-01-10T08:00:00.000Z",
    "permissions": "rwxr-xr-x"
  }
]
```

### 2. Get File Content

Download and return file content:
```json
{
  "body": {
    "operation": "get",
    "path": "/data/config.json"
  }
}
```

**Note:** JSON files are automatically parsed and returned as objects. Other files return as strings.

### 3. Upload Content

Upload data to a file:
```json
{
  "body": {
    "operation": "put",
    "path": "/uploads/data.txt",
    "content": "File content here"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Uploaded content to /uploads/data.txt",
  "size": 17
}
```

### 4. Delete File

Remove a file:
```json
{
  "body": {
    "operation": "delete",
    "path": "/temp/old-file.txt"
  }
}
```

### 5. Rename/Move File

Rename or move a file:
```json
{
  "body": {
    "operation": "rename",
    "path": "/old-name.txt",
    "newPath": "/new-name.txt"
  }
}
```

### 6. Create Directory

Create a new directory:
```json
{
  "body": {
    "operation": "mkdir",
    "path": "/new-folder"
  }
}
```

### 7. Remove Directory

Delete an empty directory:
```json
{
  "body": {
    "operation": "rmdir",
    "path": "/empty-folder"
  }
}
```

### 8. Check File Existence

Check if a file or directory exists:
```json
{
  "body": {
    "operation": "exists",
    "path": "/important-file.txt"
  }
}
```

**Response:**
```json
{
  "exists": true,
  "path": "/important-file.txt"
}
```

### 9. Get File Statistics

Get detailed file metadata:
```json
{
  "body": {
    "operation": "stat",
    "path": "/document.pdf"
  }
}
```

**Response:**
```json
{
  "exists": true,
  "path": "/document.pdf",
  "name": "document.pdf",
  "size": 204800,
  "type": "file",
  "modifyTime": "2024-01-15T14:30:00.000Z",
  "permissions": "rw-r--r--"
}
```

## Workflow Examples

### Example 1: Download and Process JSON Configuration

```javascript
// Step configuration
{
  "id": "getConfig",
  "urlHost": "ftp://<<integrationId_ftpUser>>:<<integrationId_ftpPassword>>@ftp.example.com:21",
  "urlPath": "/configs",
  "body": {
    "operation": "get",
    "path": "/production/settings.json"
  },
  "instruction": "Download the production configuration file"
}

// The JSON will be automatically parsed and available as:
// sourceData.getConfig.apiKey
// sourceData.getConfig.endpoints.production
```

### Example 2: Backup Files with Timestamp

```javascript
{
  "id": "backupFile",
  "urlHost": "sftp://<<integrationId_ftpUser>>:<<integrationId_ftpPassword>>@<<integrationId_ftpHost>>:<<integrationId_ftpPort>>",
  "body": {
    "operation": "rename",
    "path": "/daily-report.csv",
    "newPath": "<<(sourceData) => `/archive/report-${new Date().toISOString().split('T')[0]}.csv`>>"
  },
  "instruction": "Move daily report to archive with date stamp"
}
```

### Example 3: Process Multiple Files in Loop

```javascript
// Step 1: List files to process
{
  "id": "listFiles",
  "urlHost": "sftp://<<integrationId_ftpUser>>:<<integrationId_ftpPassword>>@<<integrationId_ftpHost>>:<<integrationId_ftpPort>>",
  "body": {
    "operation": "list",
    "path": "/incoming"
  },
  "instruction": "Get list of files to process"
}

// Step 2: Process each file
{
  "id": "processFiles",
  "executionMode": "LOOP",
  "loopSelector": "(sourceData) => sourceData.listFiles.filter(f => f.type === 'file' && f.name.endsWith('.csv'))",
  "urlHost": "sftp://<<integrationId_ftpUser>>:<<integrationId_ftpPassword>>@<<integrationId_ftpHost>>:<<integrationId_ftpPort>>",
  "body": {
    "operation": "get",
    "path": "/incoming/<<(sourceData) => sourceData.currentItem.name>>"
  },
  "instruction": "Download each CSV file for processing"
}
```

### Example 4: Upload Generated Report

```javascript
{
  "id": "uploadReport",
  "urlHost": "ftps://<<integrationId_ftpUser>>:<<integrationId_ftpPassword>>@<<integrationId_ftpHost>>:<<integrationId_ftpPort>>",
  "urlPath": "/reports",
  "body": {
    "operation": "put",
    "path": "/<<(sourceData) => `${new Date().getFullYear()}/monthly-report.json`>>",
    "content": "<<(sourceData) => JSON.stringify(sourceData.generateReport, null, 2)>>"
  },
  "instruction": "Upload the generated report to the secure FTP server"
}
```

### Example 5: Clean Up Old Files

```javascript
// Step 1: List all files
{
  "id": "listOldFiles",
  "urlHost": "ftp://<<integrationId_ftpUser>>:<<integrationId_ftpPassword>>@<<integrationId_ftpHost>>:<<integrationId_ftpPort>>",
  "body": {
    "operation": "list",
    "path": "/temp"
  },
  "instruction": "List all files in temp directory"
}

// Step 2: Delete old files
{
  "id": "deleteOldFiles",
  "executionMode": "LOOP",
  "loopSelector": "(sourceData) => {
    const cutoffDate = new Date(Date.now() - 30*24*60*60*1000);
    return sourceData.listOldFiles.filter(f => 
      f.type === 'file' && 
      new Date(f.modifyTime) < cutoffDate
    );
  }",
  "urlHost": "ftp://<<integrationId_ftpUser>>:<<integrationId_ftpPassword>>@<<integrationId_ftpHost>>:<<integrationId_ftpPort>>",
  "body": {
    "operation": "delete",
    "path": "/temp/<<(sourceData) => sourceData.currentItem.name>>"
  },
  "instruction": "Delete files older than 30 days"
}
```

## Common Patterns

### 1. Directory Synchronization

Check for new files and process them:
```javascript
// Check if file exists before downloading
{
  "body": {
    "operation": "exists",
    "path": "/daily/<<(sourceData) => sourceData.expectedFileName>>"
  }
}
```

### 2. JSON Data Exchange

Upload JSON data from previous steps:
```javascript
{
  "body": {
    "operation": "put",
    "path": "/data/output.json",
    "content": "<<(sourceData) => JSON.stringify({
      timestamp: new Date().toISOString(),
      results: sourceData.processedData,
      status: 'complete'
    })>>"
  }
}
```

### 3. File Migration

Move files between directories:
```javascript
{
  "body": {
    "operation": "rename",
    "path": "/inbox/<<fileName>>",
    "newPath": "/processed/<<fileName>>"
  }
}
```

### 4. Conditional File Operations

Upload only if conditions are met:
```javascript
{
  "body": {
    "operation": "<<(sourceData) => sourceData.shouldUpload ? 'put' : 'exists'>>",
    "path": "/reports/latest.csv",
    "content": "<<(sourceData) => sourceData.shouldUpload ? sourceData.reportContent : undefined>>"
  }
}
```

## Error Handling

The FTP/SFTP integration includes automatic retry logic and detailed error messages:

### Common Errors and Solutions

1. **"Missing 'operation' field in request body"**
   - Ensure your body includes an `operation` field

2. **"Unsupported operation: 'download'"**
   - Use 'get' instead. Supported operations: list, get, put, delete, rename, mkdir, rmdir, exists, stat

3. **"path required for get operation"**
   - The operation requires a `path` field in the body

4. **"Connection refused"**
   - Verify the server address, port, and that the FTP/SFTP service is running

5. **"Authentication failed"**
   - Check credentials and authentication method (password vs SSH key)

6. **"No such file or directory"**
   - Verify the file path and that it exists on the server

## Performance Considerations

1. **File Size Limits**: Large files are loaded into memory; consider chunking for very large files
2. **Connection Reuse**: Each operation creates a new connection
3. **Concurrent Operations**: Use LOOP mode cautiously with many files
4. **Timeout Settings**: Default timeout is 30 seconds, configurable via options

## Security Best Practices

1. **Use SFTP or FTPS**: Prefer encrypted protocols over plain FTP
2. **Secure Credentials**: Never hardcode credentials; use Superglue variables
3. **SSH Keys**: For SFTP, prefer SSH key authentication over passwords
4. **Validate Paths**: Sanitize file paths to prevent directory traversal
5. **Limit Permissions**: Use accounts with minimal required permissions
6. **Verify SSL Certificates**: For production FTPS, enable certificate validation

## Path Handling

### Absolute vs Relative Paths

- Paths starting with `/` are absolute from the FTP root
- Paths without `/` are relative to the `urlPath` base directory
- Use variables for dynamic paths: `"/data/<<folder>>/<<filename>>"`

### Path Variables

```javascript
{
  "body": {
    "operation": "get",
    "path": "/<<(sourceData) => sourceData.year>>/<<(sourceData) => sourceData.month>>/report.pdf"
  }
}
```

## Integration with Other Steps

FTP/SFTP results integrate seamlessly with other workflow steps:

```javascript
// Parse CSV content from FTP
"<<(sourceData) => {
  const csv = sourceData.downloadFile;
  return csv.split('\n').map(row => row.split(','));
}>>"

// Filter file list
"<<(sourceData) => sourceData.listFiles
  .filter(f => f.type === 'file' && f.size > 0)
  .map(f => f.name)
>>"

// Check multiple files exist
"<<(sourceData) => sourceData.checkFile1.exists && sourceData.checkFile2.exists>>"
```

## Response Formats

### File Listing
Returns an array of file/directory objects with metadata

### Get Operation
- JSON files: Parsed and returned as objects
- Text files: Returned as strings
- Binary files: Returned as base64-encoded strings

### Other Operations
Return success status and relevant information about the operation

## Limitations

- No built-in support for recursive directory operations
- Files are processed in memory (consider size limitations)
- No streaming support for very large files
- Directory removal only works on empty directories