import { Hero } from "@/components/landing/Hero";
import { CardPreviews } from "@/components/landing/CardPreviews";
import { MeetLumi } from "@/components/landing/MeetLumi";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { RecipientShowcase } from "@/components/landing/RecipientShowcase";
import { Benefits } from "@/components/landing/Benefits";
import { FinalCta } from "@/components/landing/FinalCta";

export default function Home() {
  return (
    <>
      <Hero />
      <CardPreviews />
      <MeetLumi />
      <HowItWorks />
      <RecipientShowcase />
      <Benefits />
      <FinalCta />
    </>
  );
}
