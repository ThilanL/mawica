import type { Metadata } from "next";
import { CreateWizard } from "@/components/create/CreateWizard";

export const metadata: Metadata = { title: "Create a card | mawica." };

export default function CreatePage() {
  return <CreateWizard />;
}
