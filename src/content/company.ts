/**
 * Public company details for the About page. Empty values are hidden on the page, never shown as placeholders.
 * TODO(launch): fill in `abn`, `city` and `phone` before going live.
 */
export const company: { email: string; abn: string; city: string; phone: string; country: string } = {
  email: "hello@mawica.com",
  abn: "", // TODO(launch): e.g. "12 345 678 901"
  city: "", // TODO(launch): e.g. "Melbourne"
  phone: "", // TODO(launch): international format, e.g. "+61 4xx xxx xxx"
  country: "Australia",
};
