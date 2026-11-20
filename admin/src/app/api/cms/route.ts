import { NextResponse } from "next/server";
import { requirePermission, StaffAuthzError } from "@/lib/authz";
import { listCmsDocuments } from "@/modules/staff/cms";

export async function GET() {
  try {
    const session = await requirePermission("cms:read");
    const documents = await listCmsDocuments(session.role);
    return NextResponse.json({ documents });
  } catch (e) {
    if (e instanceof StaffAuthzError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
