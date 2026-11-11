import { authorize, errorResponse, json, readJson, zodErrors } from "@/modules/scheduling/http";
import { createScheduleSchema } from "@/modules/scheduling/schema";
import { createSchedule, listSchedules } from "@/modules/scheduling/service";
import { IDEMPOTENCY_KEY_RE } from "@/modules/wallet/publish";
import { walletSummary } from "@/modules/wallet/wallet";

/** The signed-in user's own scheduled cards. The owner comes from the session; there is no id or filter parameter to forge. */
export async function GET(request: Request) {
  const a = await authorize(request, { mutating: false, bucket: "list", limit: 240 });
  if ("response" in a) return a.response;
  try { return json({ schedules: await listSchedules(a.user.id) }); } catch (e) { return errorResponse(e); }
}

/** Schedule a card: reserves its credits and creates the private SCHEDULED card + delivery in one transaction. */
export async function POST(request: Request) {
  const a = await authorize(request, { mutating: true, bucket: "create", limit: 60 });
  if ("response" in a) return a.response;
  const key = request.headers.get("idempotency-key");
  if (!key || !IDEMPOTENCY_KEY_RE.test(key)) return json({ error: "A valid Idempotency-Key header is required." }, 400);
  const b = await readJson(request, 8192);
  if ("response" in b) return b.response;
  const parsed = createScheduleSchema.safeParse(b.body);
  if (!parsed.success) return json({ errors: zodErrors(parsed.error) }, 400);
  try {
    const out = await createSchedule(parsed.data, a.user, { idempotencyKey: key });
    const w = await walletSummary(a.user);
    return json({ schedule: out.schedule, wallet: { cardsRemaining: w.sends.remaining, premiumRemaining: w.premium.remaining } }, out.replay ? 200 : 201);
  } catch (e) { return errorResponse(e); }
}
