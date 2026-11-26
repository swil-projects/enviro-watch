/**
 * Secret redaction. Obscape and Ecowitt authenticate with query-string
 * credentials, so full request URLs must never reach logs, error messages or
 * browser responses unredacted.
 */

const SECRET_PARAMS = new Set(["key", "api_key", "application_key", "apikey", "token", "access_token", "password", "secret"]);

export function redactUrl(input: string | URL): string {
  try {
    const url = new URL(String(input));
    for (const name of [...url.searchParams.keys()]) {
      if (SECRET_PARAMS.has(name.toLowerCase())) url.searchParams.set(name, "[REDACTED]");
    }
    return url.toString();
  } catch {
    return "[unparseable-url]";
  }
}

export function redactText(text: string, secrets: string[]): string {
  let out = text;
  for (const s of secrets) {
    if (!s) continue;
    out = out.split(s).join("[REDACTED]");
    const enc = encodeURIComponent(s);
    if (enc !== s) out = out.split(enc).join("[REDACTED]");
  }
  // Bearer tokens / query credentials that slipped in from elsewhere.
  out = out.replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[REDACTED]");
  out = out.replace(/((?:api_key|application_key|key|token)=)[^&\s"']+/gi, "$1[REDACTED]");
  return out;
}
