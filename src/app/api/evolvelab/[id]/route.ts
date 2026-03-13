import { NextRequest, NextResponse } from "next/server";

const BACKEND = "http://localhost:4000";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const upstream = await fetch(`${BACKEND}/api/evolvelab/${id}`, {
    method: "DELETE",
  });
  const data = await upstream.json();
  return NextResponse.json(data, { status: upstream.status });
}
