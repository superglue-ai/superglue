import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const limit = parseInt(searchParams.get('limit') || '10', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  try {
    const data = { limit, offset, message: "Fetched runs successfully" };
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ message: 'Error fetching runs' }, { status: 500 });
  }
}
