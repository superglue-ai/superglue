import type { AuthenticatedFastifyRequest, RouteHandler } from './types.js';
import { registerApiModule } from './registry.js';
import { FileReference, FileStatus } from '@superglue/shared';

const createFileReference: RouteHandler = async (request, reply) => {
  try {
    const authReq = request as AuthenticatedFastifyRequest;
    const body = request.body as { file: FileReference };
    
    if (!body.file) {
      return reply.code(400).send({ success: false, error: 'Missing file data' });
    }

    const created = await authReq.datastore.createFileReference({ 
      file: body.file,
      orgId: authReq.authInfo.orgId
    });
    
    return reply.code(201).send({ success: true, data: created });
  } catch (error) {
    return reply.code(500).send({ success: false, error: String(error) });
  }
};

const getFileReference: RouteHandler = async (request, reply) => {
  try {
    const authReq = request as AuthenticatedFastifyRequest;
    const { id } = request.params as { id: string };

    const file = await authReq.datastore.getFileReference({ id, orgId: authReq.authInfo.orgId });
    
    if (!file) {
      return reply.code(404).send({ success: false, error: 'File reference not found' });
    }

    return reply.code(200).send({ success: true, data: file });
  } catch (error) {
    return reply.code(500).send({ success: false, error: String(error) });
  }
};

const updateFileReference: RouteHandler = async (request, reply) => {
  try {
    const authReq = request as AuthenticatedFastifyRequest;
    const { id } = request.params as { id: string };
    const body = request.body as { updates: Partial<FileReference> };

    if (!body.updates) {
      return reply.code(400).send({ success: false, error: 'Missing updates data' });
    }

    const updated = await authReq.datastore.updateFileReference({
      id,
      updates: body.updates,
      orgId: authReq.authInfo.orgId
    });

    return reply.code(200).send({ success: true, data: updated });
  } catch (error) {
    if (String(error).includes('not found')) {
      return reply.code(404).send({ success: false, error: String(error) });
    }
    return reply.code(500).send({ success: false, error: String(error) });
  }
};

const listFileReferences: RouteHandler = async (request, reply) => {
  try {
    const authReq = request as AuthenticatedFastifyRequest;
    const query = request.query as {
      limit?: string;
      offset?: string;
      status?: FileStatus;
      fileIds?: string;
    };

    const limit = query.limit ? parseInt(query.limit, 10) || 10 : 10;
    const offset = query.offset ? parseInt(query.offset, 10) || 0 : 0;
    const fileIds = query.fileIds ? query.fileIds.split(',') : undefined;

    const result = await authReq.datastore.listFileReferences({
      limit,
      offset,
      status: query.status,
      fileIds,
      orgId: authReq.authInfo.orgId
    });

    return reply.code(200).send({ 
      success: true, 
      items: result.items,
      total: result.total 
    });
  } catch (error) {
    return reply.code(500).send({ success: false, error: String(error) });
  }
};

const deleteFileReference: RouteHandler = async (request, reply) => {
  try {
    const authReq = request as AuthenticatedFastifyRequest;
    const { id } = request.params as { id: string };

    const deleted = await authReq.datastore.deleteFileReference({ id, orgId: authReq.authInfo.orgId });
    
    if (!deleted) {
      return reply.code(404).send({ success: false, error: 'File reference not found' });
    }

    return reply.code(200).send({ success: true });
  } catch (error) {
    return reply.code(500).send({ success: false, error: String(error) });
  }
};

const processFileReference: RouteHandler = async (request, reply) => {
  try {
    const authReq = request as AuthenticatedFastifyRequest;
    const body = request.body as {
      bucket: string;
      key: string;
      region?: string;
    };

    if (!body.bucket || !body.key) {
      return reply.code(400).send({ 
        success: false, 
        error: 'Missing required fields: bucket and key' 
      });
    }

    // Extract file ID from the key (filename before extension)
    const filename = body.key.split('/').pop() || body.key;
    const fileId = filename.split('.')[0];

    if (!fileId) {
      return reply.code(400).send({ 
        success: false, 
        error: 'Could not extract file ID from key' 
      });
    }

    // Check if file reference exists
    const fileRef = await authReq.datastore.getFileReference({ 
      id: fileId, 
      orgId: authReq.authInfo.orgId 
    });

    if (!fileRef) {
      return reply.code(404).send({ 
        success: false, 
        error: `File reference not found: ${fileId}` 
      });
    }

    // Update file status to PROCESSING
    await authReq.datastore.updateFileReference({
      id: fileId,
      updates: { status: 'PROCESSING' as FileStatus },
      orgId: authReq.authInfo.orgId
    });

    // TODO: Implement async file processing logic
    // This would typically:
    // 1. Download file from S3
    // 2. Process the file content
    // 3. Update file reference status to COMPLETED or FAILED
    // 4. Store processed results
    
    return reply.code(202).send({ 
      success: true, 
      message: 'File processing started',
      fileId,
      bucket: body.bucket,
      key: body.key
    });
  } catch (error) {
    return reply.code(500).send({ success: false, error: String(error) });
  }
};


registerApiModule({
  name: 'file-references',
  routes: [
    {
      method: 'POST',
      path: '/file-references',
      handler: createFileReference
    },
    {
      method: 'GET',
      path: '/file-references/:id',
      handler: getFileReference
    },
    {
      method: 'PATCH',
      path: '/file-references/:id',
      handler: updateFileReference
    },
    {
      method: 'GET',
      path: '/file-references',
      handler: listFileReferences
    },
    {
      method: 'DELETE',
      path: '/file-references/:id',
      handler: deleteFileReference
    },
    {
      method: 'POST',
      path: '/file-references/process',
      handler: processFileReference
    }
  ]
});

