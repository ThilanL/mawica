import Link from "next/link";
import { Wordmark } from "./Wordmark";

type Props = {
  /** Resume the greeting without leaving the card. */
  onReadAgain: () => void;
};

/**
 * Shared Mawica outro for every standard, premium and cinematic card.
 * Official gradient mark (letters only) + the existing tagline copy — never plain CSS "mawica.".
 */
export function CardEnding({ onReadAgain }: Props) {
  return (
    <div className="cin-end-inner">
      <Wordmark variant="mark" size="ending" surface="dark" priority={false} />
      <Link href="/" className="cin-url">www.mawica.com</Link>
      <p className="cin-send">Send your feelings to others.</p>
      <p className="cin-tag">BRING YOUR WISHES TO LIFE.</p>
      <div className="cin-end-actions">
        <Link href="/create" className="cin-pill cin-pill-primary">Create your own card</Link>
        <button type="button" onClick={onReadAgain} className="cin-pill">Read again</button>
      </div>
    </div>
  );
}
