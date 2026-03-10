import { NextRequest, NextResponse } from "next/server";
import { clearSessionHistory } from "@/lib/claude";

export async function DELETE(req: NextRequest) {
  const { sessionId } = await req.json();
  if (sessionId) {
    clearSessionHistory(sessionId);
  }
  return NextResponse.json({ ok: true });
}
