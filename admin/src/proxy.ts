import { NextResponse, type NextRequest } from "next/server";

/** Admin app has no public card proxy; pass-through only. */
export function proxy(_req: NextRequest) {
  return NextResponse.next();
}
