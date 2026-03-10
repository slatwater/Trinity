import { NextResponse } from "next/server";
import { scanProjects, getWorkspaceRoot } from "@/lib/projects";

export async function GET() {
  try {
    const projects = await scanProjects();
    return NextResponse.json({ projects, workspace: getWorkspaceRoot() });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to scan projects: ${error}` },
      { status: 500 }
    );
  }
}
