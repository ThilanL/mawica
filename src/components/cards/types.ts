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
};

export type CardData = {
  templateKey: AnyTemplateKey;
  recipientName: string;
  senderName: string;
  message: string;
};
