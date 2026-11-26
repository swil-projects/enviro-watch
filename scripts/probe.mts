/**
 * Connectivity probe: runs each provider's lightweight health check using the
 * credentials in .env and prints the results plus a redacted response *shape*
 * (keys and value types only — no values, no secrets).
 *
 *   npm run probe            # all providers
 *   npm run probe -- obscape # one provider
 *
 * Useful for verifying the Obscape API v3 response structure, which is not publicly documented.
 */
import "dotenv/config";
import { EcowittAdapter } from "@/lib/integrations/ecowitt/adapter";
import { LicorAdapter } from "@/lib/integrations/licor/adapter";
import { ObscapeAdapter } from "@/lib/integrations/obscape/adapter";

const adapters = { obscape: new ObscapeAdapter(), licor: new LicorAdapter(), ecowitt: new EcowittAdapter() };
const only = process.argv[2]?.toLowerCase();

for (const [name, a] of Object.entries(adapters)) {
  if (only && only !== name) continue;
  const h = await a.healthCheck();
  console.log(`\n=== ${name.toUpperCase()} — ${h.status}${h.latencyMs !== null ? ` (${h.latencyMs} ms)` : ""}`);
  for (const s of h.steps) console.log(`  [${s.status.padEnd(7)}] ${s.name}: ${s.detail}`);
  for (const e of h.errors) console.log(`  ! ${e.label}${e.status ? ` (HTTP ${e.status})` : ""}: ${e.message}`);
  if (h.responseShape !== undefined) console.log("  response shape:\n" + JSON.stringify(h.responseShape, null, 2).replace(/^/gm, "    "));
}
