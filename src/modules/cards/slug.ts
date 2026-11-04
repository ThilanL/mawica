import { customAlphabet } from "nanoid";

// Unambiguous lowercase alphanumerics (no 0/1/i/l/o): 32^12 ≈ 1.1e18 combinations.
const alphabet = "23456789abcdefghjkmnpqrstuvwxyz";
export const newSlug = customAlphabet(alphabet, 12);
