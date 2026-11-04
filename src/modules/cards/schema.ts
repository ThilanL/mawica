import { z } from "zod";
import { TEMPLATE_KEYS } from "@/modules/templates/registry";

export const LIMITS = { name: 40, message: 500 } as const;

// Strip control chars (keeps \n in messages), collapse odd whitespace, trim.
const clean = (multiline: boolean) => (s: string) =>
  s
    .normalize("NFC")
    .replace(multiline ? /[\u0000-\u0009\u000B-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩]/g : /[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩]/g, "")
    .replace(multiline ? /\n{3,}/g : /\s+/g, multiline ? "\n\n" : " ")
    .trim();

const name = (label: string) =>
  z.string({ error: `${label} is required` }).transform(clean(false)).pipe(z.string().min(1, `${label} is required`).max(LIMITS.name, `${label} must be ${LIMITS.name} characters or fewer`));

export const createCardSchema = z.object({
  templateKey: z.enum(TEMPLATE_KEYS, { error: "Choose a card" }),
  recipientName: name("Recipient name"),
  senderName: name("Your name"),
  message: z
    .string({ error: "Message is required" })
    .transform(clean(true))
    .pipe(z.string().min(1, "Message is required").max(LIMITS.message, `Message must be ${LIMITS.message} characters or fewer`)),
  /** Honeypot: real users never fill this */
  website: z.string().max(200).optional().default(""),
});

export type CreateCardInput = z.infer<typeof createCardSchema>;

export const reportSchema = z.object({
  reason: z.enum(["INAPPROPRIATE", "HARASSMENT", "SPAM", "OTHER"], { error: "Choose a reason" }),
  details: z.string().transform((s) => s.replace(/[\u0000-\u001F\u007F-\u009F]/g, " ").trim()).pipe(z.string().max(300)).optional(),
});

export const SLUG_RE = /^[2-9a-hjkmnp-z]{12}$/;
