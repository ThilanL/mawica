import type { TemplateKey } from "@/modules/templates/registry";

export type SceneProps = {
  recipientName: string;
  senderName: string;
  message: string;
  greeting: string;
  /** Changing this restarts the CSS timeline (replay). */
  replayKey: number;
  /** Smaller phone-frame layout (wizard preview) */
  compact?: boolean;
};

export type CardData = {
  templateKey: TemplateKey;
  recipientName: string;
  senderName: string;
  message: string;
};
