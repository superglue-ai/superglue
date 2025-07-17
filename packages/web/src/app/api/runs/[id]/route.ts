import { NextResponse } from 'next/server';

type RouteContext = {
  params: {
    id: string;
  }
}

export async function GET(request: Request, { params }: RouteContext) {
  const { id } = params;

  try {
    const data = { id, message: `Fetched run ${id} successfully` };
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ message: 'Error fetching run' }, { status: 500 });
  }
}
