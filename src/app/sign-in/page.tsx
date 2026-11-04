import type { Metadata } from "next";
import { ComingSoon } from "@/components/ui/ComingSoon";

export const metadata: Metadata = { title: "Sign in | mawica." };

export default function SignInPage() {
  return <ComingSoon title="Accounts are coming" body="Accounts are not available yet. You'll be able to create and share cards without one." />;
}
