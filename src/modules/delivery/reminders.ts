/**
 * Sender reminders: DESIGN ONLY, nothing is sent or scheduled. A reminder goes to the SENDER (never the recipient) shortly before a LINK card
 * becomes available, to prompt them to share the link. It is separate from delivery and from any recipient email.
 */
export function planSenderReminder(input: { deliverAtUtc: Date; leadHours: number; enabled: boolean; now: Date }): Date | null {
  if (!input.enabled || input.leadHours < 1) return null;
  const at = new Date(input.deliverAtUtc.getTime() - input.leadHours * 3_600_000);
  return at.getTime() > input.now.getTime() ? at : null; // no reminder for a time already past
}
