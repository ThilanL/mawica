import { brandOg, OG_SIZE } from "@/lib/og";

export const alt = "A card made for you on mawica.";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return brandOg("card");
}
