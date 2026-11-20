import { redirect } from "next/navigation";
import { entraConfigured, devAuthEnabled } from "@/lib/env";
import { readStaffSession } from "@/lib/session";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await readStaffSession()) redirect("/");
  const sp = await searchParams;
  const entra = entraConfigured();
  const dev = devAuthEnabled();

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-12">
      <p className="text-sm font-semibold tracking-wide text-[var(--admin-muted)]">mawica admin</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Staff sign in</h1>
      <p className="mt-3 text-[var(--admin-muted)]">
        Access is limited to allowlisted Microsoft Entra identities. Consumer accounts cannot sign in here.
      </p>

      {sp.error ? (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {decodeURIComponent(sp.error)}
        </p>
      ) : null}

      <div className="mt-8 space-y-3">
        {entra ? (
          <a
            href="/api/auth/entra/start"
            className="flex w-full items-center justify-center rounded-full bg-[var(--admin-accent)] px-5 py-3 text-sm font-semibold text-[#fff8f4]"
          >
            Continue with Microsoft Entra ID
          </a>
        ) : (
          <p className="rounded-xl border border-[var(--admin-line)] bg-[var(--admin-card)] px-4 py-3 text-sm text-[var(--admin-muted)]">
            Entra ID is not configured. Set <code>ADMIN_ENTRA_*</code> environment variables for staff SSO.
          </p>
        )}

        {dev ? (
          <form action="/api/auth/dev" method="post">
            <button
              type="submit"
              className="flex w-full items-center justify-center rounded-full border border-[var(--admin-line)] bg-[var(--admin-card)] px-5 py-3 text-sm font-semibold"
            >
              Local development sign-in
            </button>
          </form>
        ) : null}
      </div>
    </main>
  );
}
