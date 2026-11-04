import type { Metadata } from "next";
import { LegalPage, Todo } from "@/components/ui/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Use | mawica.",
  description: "The rules for creating and sharing cards on mawica.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Use" updated="5 November 2026 (draft)">
      <section>
        <h2>Using mawica.</h2>
        <p>mawica. lets you create and share personalised digital greeting cards for free. By using the service you agree to these terms. The service is operated by <Todo>legal entity name</Todo>.</p>
      </section>
      <section>
        <h2>Your content</h2>
        <p>You are responsible for what you write. You confirm you have the right to share it and that it does not break the law or these rules. You grant us a limited licence to store and display your card to people who have its link, for as long as the card exists.</p>
      </section>
      <section>
        <h2>Not allowed</h2>
        <ul>
          <li>Harassment, threats, hate, or content that sexualises or endangers children.</li>
          <li>Scams, phishing, malware, spam or unsolicited commercial messages.</li>
          <li>Other people&rsquo;s private or sensitive information without permission.</li>
          <li>Content that infringes others&rsquo; rights, or anything unlawful.</li>
          <li>Automated or bulk creation of cards, or attempts to bypass limits or disrupt the service.</li>
        </ul>
      </section>
      <section>
        <h2>Reporting and removal</h2>
        <p>Anyone can report a card with the &ldquo;Report this card&rdquo; link. We may remove any card, without notice, if it breaks these terms or the law, and may limit or block abusive use. Removal takes effect immediately. <Todo>Owner to confirm review process and response time</Todo>. To request removal of a card, email <Todo>contact email</Todo> with its link.</p>
      </section>
      <section>
        <h2>Limits</h2>
        <p>To keep the service fair, the number of cards one connection can create is limited. We may change or end the service, including the free offer, and cards may be removed or become unavailable. The service is provided &ldquo;as is&rdquo;. <Todo>Legal review: warranties, limitation of liability and consumer-law carve-outs for Australia (Australian Consumer Law) and Sri Lanka</Todo>.</p>
      </section>
      <section>
        <h2>Intellectual property</h2>
        <p>The mawica. name, logo, designs and software belong to <Todo>legal entity name</Todo>. You keep ownership of your message.</p>
      </section>
      <section>
        <h2>Governing law</h2>
        <p><Todo>Governing law and jurisdiction, per legal advice</Todo>.</p>
      </section>
      <section>
        <h2>Contact</h2>
        <p><Todo>contact email</Todo>. See also our <a href="/privacy">Privacy Policy</a>.</p>
      </section>
    </LegalPage>
  );
}
