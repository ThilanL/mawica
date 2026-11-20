/** Limits for CMS marketing media (independent of customer CardMedia). */
export const CMS_MEDIA_LIMITS = {
  maxImageBytes: 12 * 1024 * 1024,
  maxVideoBytes: 40 * 1024 * 1024,
  maxInputPixels: 40_000_000,
  maxEdge: 2400,
  thumbEdge: 480,
  titleMax: 160,
  altMax: 300,
} as const;
