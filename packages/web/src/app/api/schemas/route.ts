import { NextRequest, NextResponse } from 'next/server';
import { generateSchema } from '@superglue/core/utils/schema';

type RequestBody = {
  instruction: string;
  responseData: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: RequestBody = await request.json();

    if (!body.instruction || !body.responseData) {
      return NextResponse.json({ message: 'Missing required fields' }, { status: 400 });
    }
    const schema = await generateSchema(body.instruction, body.responseData, {});
    return NextResponse.json(schema, { status: 201 });
  } catch (error) {
    return NextResponse.json({ message: 'Error processing request' }, { status: 500 });
  }
}
