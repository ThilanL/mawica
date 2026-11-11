import { authorize, errorResponse, json, readJson, zodErrors } from "@/modules/scheduling/http";
import { createRecipientSchema } from "@/modules/scheduling/schema";
import { createRecipient, listRecipients } from "@/modules/scheduling/service";

/** The signed-in user's own saved recipients (name and time zone only; never an address list). */
export async function GET(request: Request) {
  const a = await authorize(request, { mutating: false, bucket: "recipients", limit: 240 });
  if ("response" in a) return a.response;
  try { return json({ recipients: await listRecipients(a.user.id) }); } catch (e) { return errorResponse(e); }
}

export async function POST(request: Request) {
  const a = await authorize(request, { mutating: true, bucket: "recipients-add", limit: 60 });
  if ("response" in a) return a.response;
  const b = await readJson(request, 2048);
  if ("response" in b) return b.response;
  const parsed = createRecipientSchema.safeParse(b.body);
  if (!parsed.success) return json({ errors: zodErrors(parsed.error) }, 400);
  try { return json({ recipient: await createRecipient(a.user.id, parsed.data) }, 201); } catch (e) { return errorResponse(e); }
}
