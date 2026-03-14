import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";

const HISTORY_FILE = path.join(os.homedir(), ".trinity", "evolvelab", "history.json");

function ensureDir() {
  fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
}

function readHistory(): Record<string, unknown>[] {
  try {
    return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function writeHistory(data: Record<string, unknown>[]) {
  ensureDir();
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2), "utf-8");
}

export async function GET() {
  return NextResponse.json(readHistory());
}

export async function POST(req: NextRequest) {
  const entry = await req.json();
  const history = readHistory();
  history.unshift(entry);
  writeHistory(history);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  const history = readHistory().filter((e) => e.id !== id);
  writeHistory(history);
  return NextResponse.json({ ok: true });
}
