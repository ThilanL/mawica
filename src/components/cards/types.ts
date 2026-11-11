import type { AnyTemplateKey } from "@/modules/templates/registry";

export type SceneProps = {
  recipientName: string;
  senderName: string;
  message: string;
  greeting: string;
  /** Changing this restarts the CSS timeline (replay). */
  replayKey: number;
  /** Smaller phone-frame layout (wizard preview) */
  compact?: boolean;
  /** Optional personal photo (premium cinematic card only). */
  media?: CardMedia | null;
};

/** A photo served from our own private media route (or a local object URL while previewing). Never an arbitrary external URL. */
export type CardMedia = { kind: "image"; src: string; width: number; height: number };

export type CardData = {
  templateKey: AnyTemplateKey;
  recipientName: string;
  senderName: string;
  message: string;
  media?: CardMedia | null;
};
