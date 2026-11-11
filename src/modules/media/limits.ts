/** Limits for personal photos (Phase 2E). Enforced on the server; the database repeats the size, dimension and type limits as CHECK constraints. */
export const MEDIA_LIMITS = {
  /** Largest file we will read from a client. Anything bigger is refused before decoding. */
  maxUploadBytes: 8 * 1024 * 1024,
  /** Decoder bound: refuses decompression bombs (a tiny file that expands to a huge bitmap). */
  maxInputPixels: 40_000_000,
  /** The stored image is scaled to fit inside this square. */
  maxEdge: 1280,
  minEdge: 16,
  /** Target stored size; the encoder lowers quality (then size) until it fits. */
  targetBytes: 500 * 1024,
  /** Never stored above this (also a database CHECK). */
  hardMaxBytes: 600 * 1024,
  /** Uploads not yet attached to a card, per account. */
  maxPendingPerUser: 6,
  maxUploadsPerHour: 8,
  maxUploadsPerDay: 20,
  maxUploadsPerIpPerDay: 40,
  maxUploadsGlobalPerDay: 2000,
  /** Unattached uploads older than this are deleted. */
  orphanTtlHours: 24,
} as const;

/** The video policy for the MVP is fixed here so the missing infrastructure is explicit: not enabled until a safe transcoder exists. */
export const VIDEO_POLICY = {
  enabled: false,
  maxSeconds: 5,
  maxHeight: 720,
  targetBytes: { min: 1 * 1024 * 1024, max: 2 * 1024 * 1024 },
  blocker: "needs a server-side transcoder (ffmpeg + ffprobe) running in an isolated worker; neither is installed or configured",
} as const;
