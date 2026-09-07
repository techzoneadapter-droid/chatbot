import { NextResponse } from "next/server";
import { listActivityLogs } from "@/lib/admin-data";

export async function GET() {
  return NextResponse.json({ logs: await listActivityLogs() });
}
