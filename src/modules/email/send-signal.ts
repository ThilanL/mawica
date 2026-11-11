import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Better Auth catches (and only logs) errors thrown from its sendVerificationOTP hook, so a failed email would still
 * look like success to the client. The route wrapper runs the auth handler inside this request-scoped store; the hook
 * flags failure here and the wrapper turns it into a generic 503. The flag depends on the provider only, never on whether
 * the address has an account, so it adds no enumeration signal.
 */
const store = new AsyncLocalStorage<{ failed: boolean }>();
export const trackEmailSend = async <T>(fn: () => Promise<T>): Promise<{ result: T; failed: boolean }> => {
  const s = { failed: false };
  const result = await store.run(s, fn);
  return { result, failed: s.failed };
};
export const markEmailSendFailed = () => { const s = store.getStore(); if (s) s.failed = true; };
