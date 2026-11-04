import type { Metadata } from "next";
import { ComingSoon } from "@/components/ui/ComingSoon";

export const metadata: Metadata = { title: "Create a card | mawica." };

export default function CreatePage() {
  return <ComingSoon title="Card creation is on its way" body="We're putting the finishing touches on the card creator. Personalised cards you can share by link, WhatsApp or QR code will be available here soon." />;
}
