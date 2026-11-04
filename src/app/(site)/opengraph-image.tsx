import { brandOg, OG_SIZE } from "@/lib/og";

export const alt = "mawica. Bring your wishes to life.";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return brandOg("site");
}
