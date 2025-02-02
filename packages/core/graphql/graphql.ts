import fs from 'fs';
import { listExtractsResolver, listRunsResolver, listTransformsResolver } from './resolvers/list.js';
import { getTransformResolver, getExtractResolver, getApiResolver, getRunResolver } from './resolvers/get.js';
import { callResolver } from './resolvers/call.js';
import { deleteApiResolver, deleteExtractResolver, deleteTransformResolver } from './resolvers/delete.js';
import { listApisResolver } from './resolvers/list.js';
import { JSONResolver, JSONSchemaResolver, JSONataResolver } from './resolvers/scalars.js';
import { extractResolver } from './resolvers/extract.js';
import { transformResolver } from './resolvers/transform.js';
import { upsertTransformResolver, upsertExtractResolver, upsertApiResolver } from './resolvers/upsert.js';

export const resolvers = {
    Query: {
        listRuns: listRunsResolver,
        getRun: getRunResolver,  
        listApis: listApisResolver,
        getApi: getApiResolver,
        listTransforms: listTransformsResolver,
        getTransform: getTransformResolver,
        listExtracts: listExtractsResolver,
        getExtract: getExtractResolver
    },
    Mutation: {
        call: callResolver,
        extract: extractResolver,
        transform: transformResolver,
        upsertApi: upsertApiResolver,
        deleteApi: deleteApiResolver,
        upsertExtraction: upsertExtractResolver,
        deleteExtraction: deleteExtractResolver,
        upsertTransformation: upsertTransformResolver,
        deleteTransformation: deleteTransformResolver,
    },
    JSON: JSONResolver,
    JSONSchema: JSONSchemaResolver,
    JSONata: JSONataResolver,
    ConfigType: {
        __resolveType(obj: any, context: any, info: any) {
            // Get the parent field name from the path
            const parentField = info.path.prev.key;
            
            switch (parentField) {
                case 'call':
                    return 'ApiConfig';
                case 'extract':
                    return 'ExtractConfig';
                case 'transform':
                    return 'TransformConfig';
                default:
                    return 'ApiConfig';
            }
        }
    }    
  };
  export const typeDefs = fs.readFileSync('../../api.graphql', 'utf8');
  