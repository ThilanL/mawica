import { authorize, errorResponse, json, readJson, zodErrors } from "@/modules/scheduling/http";
import { rescheduleSchema } from "@/modules/scheduling/schema";
import { cancelSchedule, rescheduleSchedule } from "@/modules/scheduling/service";

type Ctx = { params: Promise<{ id: string }> };

/** Change the delivery time. Needs the schedule's current `version` so concurrent edits cannot overwrite each other. */
export async function PATCH(request: Request, ctx: Ctx) {
  const a = await authorize(request, { mutating: true, bucket: "mutate", limit: 120 });
  if ("response" in a) return a.response;
  const b = await readJson(request, 2048);
  if ("response" in b) return b.response;
  const parsed = rescheduleSchema.safeParse(b.body);
  if (!parsed.success) return json({ errors: zodErrors(parsed.error) }, 400);
  try { return json(await rescheduleSchedule(a.user, (await ctx.params).id, parsed.data)); } catch (e) { return errorResponse(e); }
}

/** Cancel (idempotent). Credits are released under the wallet's rule. A schedule already in delivery cannot be cancelled (409). */
export async function DELETE(request: Request, ctx: Ctx) {
  const a = await authorize(request, { mutating: true, bucket: "mutate", limit: 120 });
  if ("response" in a) return a.response;
  try { return json(await cancelSchedule(a.user, (await ctx.params).id)); } catch (e) { return errorResponse(e); }
}
