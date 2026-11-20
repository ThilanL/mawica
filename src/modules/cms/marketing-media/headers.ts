export type MarketingFileMeta = {
  bytes: Buffer;
  contentType: string;
  byteSize: number;
  etag: string;
  updatedAt: string;
};

/** Public CDN headers: cacheable with ETag revalidation so replace-in-place invalidates clients. */
export function marketingDeliveryHeaders(
  file: MarketingFileMeta,
  req: Request,
): { status: 200 | 304; headers: Record<string, string>; body?: Buffer } {
  const headers: Record<string, string> = {
    "Content-Type": file.contentType,
    ETag: file.etag,
    "Last-Modified": new Date(file.updatedAt).toUTCString(),
    // Not immutable: same URL can change on replace. Clients/CDNs must revalidate via ETag.
    "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400, must-revalidate",
    "X-Content-Type-Options": "nosniff",
  };
  const inm = req.headers.get("if-none-match");
  if (inm && inm.split(",").some((t) => t.trim() === file.etag)) {
    return { status: 304, headers };
  }
  headers["Content-Length"] = String(file.byteSize);
  return { status: 200, headers, body: file.bytes };
}
