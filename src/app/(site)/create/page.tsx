import type { Metadata } from "next";
import { CreateWizard } from "@/components/create/CreateWizard";

export const metadata: Metadata = { title: "Create a card | mawica.", description: "Choose a card, add a name and a message, then share it by link, WhatsApp or QR code.", alternates: { canonical: "/create" } };

export default function CreatePage() {
  return <CreateWizard />;
}
