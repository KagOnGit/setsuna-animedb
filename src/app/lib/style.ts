export function requestedDetail(lastUser: string = "") {
  return /\b(why|explain|how|details?|long|deep|thorough)\b/i.test(lastUser);
}

export function tightenReply(raw: string, wantDetail = false) {
  if (!raw) return "";
  let s = raw.trim();

  // Collapse parentheticals & asides if not in detail mode
  if (!wantDetail) {
    s = s.replace(/\s*\((.+?)\)\s*/g, (_: string, inner: string) => inner.length < 24 ? `, ${inner}, ` : " ");
  }

  // Trim to max ~240 chars in brief mode (don’t cut midsentence)
  if (!wantDetail && s.length > 240) {
    const cut = s.slice(0, 240);
    const end = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("…"), cut.lastIndexOf("!"), cut.lastIndexOf("?"));
    s = cut.slice(0, end > 0 ? end + 1 : 240).trim();
  }

  // Ensure max two sentences in brief mode
  if (!wantDetail) {
    const parts = s.split(/(?<=[.?!…])\s+/);
    s = parts.slice(0, 2).join(" ");
  }

  return s;
}

