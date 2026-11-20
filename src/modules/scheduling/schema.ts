import { z } from "zod";
import { createCardSchema } from "@/modules/cards/schema";
import { LOCAL_DATE_RE, LOCAL_TIME_RE } from "./time";

const cleanName = (s: string) => s.normalize("NFC").replace(/[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩]/g, "").replace(/\s+/g, " ").trim();

export const scheduleWhenSchema = z.object({
  localDate: z.string().regex(LOCAL_DATE_RE, "Choose a date"),
  localTime: z.string().regex(LOCAL_TIME_RE, "Choose a time"),
  timeZone: z.string().min(1).max(64),
  /** Only needed (and only accepted) when the local time occurs twice at a daylight-saving change. */
  ambiguity: z.enum(["earlier", "later"]).optional(),
}).strict();

export const createScheduleSchema = createCardSchema.pick({ templateKey: true, recipientName: true, senderName: true, message: true, musicTrackId: true }).extend({
  /** A photo the owner uploaded earlier (premium cinematic card only). */
  mediaId: z.uuid().optional(),
  /** An existing saved recipient of THIS account. */
  recipientId: z.uuid().optional(),
  /** When no recipientId is given, remember the card's recipient (name + time zone only) for next time. */
  saveRecipient: z.boolean().optional().default(true),
  /** Optional and unused until email delivery exists; requires the sender's attestation below. */
  recipientEmail: z.string().max(254).transform((s) => s.normalize("NFKC").trim().toLowerCase()).pipe(z.email()).optional(),
  senderAttestsPermission: z.boolean().optional(),
  channel: z.enum(["LINK", "EMAIL"]).optional().default("LINK"),
  schedule: scheduleWhenSchema,
}).strict().refine((v) => !v.recipientEmail || v.senderAttestsPermission === true, { message: "Confirm you have permission to contact this person", path: ["senderAttestsPermission"] });
export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;

export const rescheduleSchema = scheduleWhenSchema.extend({ version: z.number().int().min(0).max(1_000_000) }).strict();
export type RescheduleInput = z.infer<typeof rescheduleSchema>;

export const createRecipientSchema = z.object({
  name: z.string().transform(cleanName).pipe(z.string().min(1, "Enter a name").max(40, "Name must be 40 characters or fewer")),
  timeZone: z.string().min(1).max(64).default("UTC"),
  email: z.string().max(254).transform((s) => s.normalize("NFKC").trim().toLowerCase()).pipe(z.email()).optional(),
  senderAttestsPermission: z.boolean().optional(),
}).strict().refine((v) => !v.email || v.senderAttestsPermission === true, { message: "Confirm you have permission to contact this person", path: ["senderAttestsPermission"] });
export type CreateRecipientInput = z.infer<typeof createRecipientSchema>;

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
