import { NextRequest, NextResponse } from 'next/server';
import { createDataStore } from '@superglue/core/datastore/datastore';
import { Integration } from '@superglue/client';

const dataStore = createDataStore({ type: 'file' });

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const instruction = searchParams.get('instruction');

  try {
    if (!instruction) {
      return NextResponse.json(
        { error: "The 'instruction' query parameter is required." },
        { status: 400 }
      );
    }

    const { items: allIntegrations } = await dataStore.listIntegrations();

    if (!allIntegrations || allIntegrations.length === 0) {
      return NextResponse.json([]);
    }

    const relevantIntegrations = await selectRelevantIntegrations(
      instruction,
      allIntegrations as Integration[]
    );

    return NextResponse.json(relevantIntegrations);
  } catch (error) {
    console.error('Error processing request:', error);
    return NextResponse.json(
      { error: 'An internal server error occurred.' },
      { status: 500 }
    );
  }
}

async function selectRelevantIntegrations(
  instruction: string,
  integrations: Integration[]
): Promise<Integration[]> {
  const lowercasedInstruction = instruction.toLowerCase();

  return integrations.filter(integration => {
    const searchableText = [
      integration.name || '',
      integration.type || '',
      integration.documentation || '',
      integration.specificInstructions || '',
    ].join(' ').toLowerCase();

    return searchableText.includes(lowercasedInstruction);
  });
}
