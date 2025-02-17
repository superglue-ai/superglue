'use client'

import React from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { Button } from "@/src/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/src/components/ui/accordion";
import { composeUrl } from '@/src/lib/utils';
import { ApiConfig } from '@superglue/client';
import { useConfig } from '@/src/app/config-context';
import { SuperglueClient } from '@superglue/client';

const ApiConfigDetail = ({ id, onClose }: { id?: string; onClose?: () => void }) => {
  const router = useRouter();
  const params = useParams();
  id = id ?? params.id as string;
  const [config, setConfig] = React.useState<ApiConfig | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const superglueConfig = useConfig();

  React.useEffect(() => {
    if (id) {
      const fetchConfig = async () => {
        try {
          setLoading(true);
          const superglueClient = new SuperglueClient({
            endpoint: superglueConfig.superglueEndpoint,
            apiKey: superglueConfig.superglueApiKey
          })      
          const foundConfig = await superglueClient.getApi(id);
          if (!foundConfig) {
            throw new Error('Configuration not found');
          }
          const transformedConfig = {
            ...foundConfig,
            headers: foundConfig.headers,
            createdAt: foundConfig.createdAt || new Date().toISOString(),
            updatedAt: foundConfig.updatedAt || new Date().toISOString(),
          };
          
          setConfig(transformedConfig as ApiConfig);
        } catch (error) {
          console.error('Error fetching config:', error);
          setError(error instanceof Error ? error.message : 'An error occurred');
        } finally {
          setLoading(false);
        }
      };

      fetchConfig();
    }
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (error || !config) {
    return (
      <div className="flex flex-col items-center justify-center h-48">
        <p className="text-red-500 mb-4">{error || 'Configuration not found'}</p>
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </div>
    );
  }

  return (
    <div className="max-h-full overflow-y-auto my-4">
      <div className="space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-xl font-semibold mb-2">API Configuration Details</h2>
            <p className="text-sm text-gray-500">ID: {config.id}</p>
          </div>
          <Button variant="outline" onClick={() => router.push(`/configs/${config.id}/edit`)}>
            Edit
          </Button>
        </div>

        <div className="space-y-6">
          <div>
            <h3 className="text-base font-semibold mb-4">Basic Information</h3>
            <dl className="space-y-4">
              <div>
                <dt className="font-medium text-gray-500">URL</dt>
                <dd className="mt-1">{composeUrl(config.urlHost, config.urlPath)}</dd>
              </div>
              <div>
                <dt className="font-medium text-gray-500">Method</dt>
                <dd className="mt-1">{config.method}</dd>
              </div>
              <div>
                <dt className="font-medium text-gray-500">Instruction</dt>
                <dd className="mt-1">{config.instruction}</dd>
              </div>
            </dl>
          </div>

          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="authentication">
              <AccordionTrigger>Authentication</AccordionTrigger>
              <AccordionContent>
                <dl className="grid grid-cols-2 gap-4">
                  <div>
                    <dt className="font-medium text-gray-500">Type</dt>
                    <dd className="mt-1">{config.authentication || 'None'}</dd>
                  </div>
                </dl>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="request">
              <AccordionTrigger>Request Details</AccordionTrigger>
              <AccordionContent>
                <dl className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <dt className="font-medium text-gray-500">Headers</dt>
                    <dd className="mt-1">
                      {config.headers?.length ? (
                        <pre className="bg-gray-900 p-2 rounded">
                          {JSON.stringify(config.headers ?? {}, null, 2)}
                        </pre>
                      ) : (
                        'No headers specified'
                      )}
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="font-medium text-gray-500">Query Parameters</dt>
                    <dd className="mt-1">
                      <pre className="bg-gray-900 p-2 rounded">
                        {JSON.stringify(config.queryParams, null, 2)}
                      </pre>
                    </dd>
                  </div>
                  {config.body && (
                    <div className="col-span-2">
                      <dt className="font-medium text-gray-500">Request Body</dt>
                      <dd className="mt-1">
                        <pre className="bg-gray-900 p-2 rounded">{config.body}</pre>
                      </dd>
                    </div>
                  )}
                </dl>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="response">
              <AccordionTrigger>Response Configuration</AccordionTrigger>
              <AccordionContent>
                <dl className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <dt className="font-medium text-gray-500">Response Schema</dt>
                    <dd className="mt-1">
                      <pre className="bg-gray-900 p-2 rounded">
                        {JSON.stringify(config.responseSchema, null, 2)}
                      </pre>
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="font-medium text-gray-500">Response Mapping</dt>
                    <dd className="mt-1">
                      <pre className="bg-gray-900 p-2 rounded">
                        {config.responseMapping}
                      </pre>
                    </dd>
                  </div>
                </dl>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="pagination">
              <AccordionTrigger>Pagination</AccordionTrigger>
              <AccordionContent>
                <dl className="grid grid-cols-2 gap-4">
                  <div>
                    <dt className="font-medium text-gray-500">Type</dt>
                    <dd className="mt-1">{config.pagination?.type || 'Disabled'}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-gray-500">Page Size</dt>
                    <dd className="mt-1">{config.pagination?.pageSize || 'N/A'}</dd>
                  </div>
                </dl>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          {config.documentationUrl && (
            <div>
              <h3 className="text-base font-semibold mb-4">Documentation</h3>
              <a
                href={config.documentationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline flex items-center"
              >
                View Documentation
                <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ApiConfigDetail;