export function safeLocalPath(value: unknown, fallback = "/app") {
  if (typeof value !== "string") return fallback;
  const path = value.trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\") || /[\u0000-\u001f\u007f]/.test(path)) return fallback;
  try {
    const parsed = new URL(path, "https://vexonyx.invalid");
    if (parsed.origin !== "https://vexonyx.invalid") return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
