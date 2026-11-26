import type { ProviderType } from "./contracts";

/**
 * Structured provider error taxonomy. Each kind maps to an actionable message
 * on the Integration Health page.
 */
export type ProviderErrorKind =
  | "MISSING_CREDENTIALS"
  | "INVALID_CREDENTIALS"
  | "ACCESS_DENIED"
  | "DEVICE_NOT_FOUND"
  | "INVALID_REQUEST"
  | "RATE_LIMITED"
  | "PROVIDER_UNAVAILABLE"
  | "TIMEOUT"
  | "NETWORK"
  | "MALFORMED_RESPONSE"
  | "UNSUPPORTED"
  | "NORMALIZATION_FAILED";

export const ERROR_KIND_LABEL: Record<ProviderErrorKind, string> = {
  MISSING_CREDENTIALS: "Missing credentials",
  INVALID_CREDENTIALS: "Invalid credentials",
  ACCESS_DENIED: "Access denied",
  DEVICE_NOT_FOUND: "Device not found",
  INVALID_REQUEST: "Invalid request parameters",
  RATE_LIMITED: "Rate limited",
  PROVIDER_UNAVAILABLE: "Provider temporarily unavailable",
  TIMEOUT: "Request timed out",
  NETWORK: "Network error",
  MALFORMED_RESPONSE: "Unexpected response format",
  UNSUPPORTED: "Capability not supported",
  NORMALIZATION_FAILED: "Internal normalization failure",
};

export const ERROR_KIND_HINT: Record<ProviderErrorKind, string> = {
  MISSING_CREDENTIALS: "Add the provider credentials to your .env file and restart the server.",
  INVALID_CREDENTIALS: "The provider rejected the credentials. Re-copy the key/token from the provider portal.",
  ACCESS_DENIED: "The credentials are valid but lack permission for this resource.",
  DEVICE_NOT_FOUND: "Check the configured device identifier (serial / MAC) belongs to this account.",
  INVALID_REQUEST: "The provider rejected a request parameter. See details below.",
  RATE_LIMITED: "Too many requests. The platform will back off automatically.",
  PROVIDER_UNAVAILABLE: "The provider reported a server-side problem. Usually transient.",
  TIMEOUT: "The provider did not respond in time. Usually transient.",
  NETWORK: "Could not reach the provider. Check connectivity / DNS.",
  MALFORMED_RESPONSE: "The response did not match the expected contract. The API may have changed.",
  UNSUPPORTED: "This provider does not offer this capability through its documented API.",
  NORMALIZATION_FAILED: "Data was received but could not be normalized. This is an application bug.",
};

export class ProviderError extends Error {
  readonly provider: ProviderType;
  readonly kind: ProviderErrorKind;
  readonly status?: number;
  readonly providerCode?: string | number;
  readonly retryAfterMs?: number;

  constructor(opts: {
    provider: ProviderType;
    kind: ProviderErrorKind;
    message: string;
    status?: number;
    providerCode?: string | number;
    retryAfterMs?: number;
  }) {
    super(opts.message);
    this.name = "ProviderError";
    this.provider = opts.provider;
    this.kind = opts.kind;
    this.status = opts.status;
    this.providerCode = opts.providerCode;
    this.retryAfterMs = opts.retryAfterMs;
  }

  get retryable() {
    return ["RATE_LIMITED", "PROVIDER_UNAVAILABLE", "TIMEOUT", "NETWORK"].includes(this.kind);
  }

  toJSON(): SerializedProviderError {
    return {
      provider: this.provider,
      kind: this.kind,
      label: ERROR_KIND_LABEL[this.kind],
      message: this.message,
      status: this.status,
      providerCode: this.providerCode,
    };
  }
}

export interface SerializedProviderError {
  provider: ProviderType;
  kind: ProviderErrorKind;
  label: string;
  message: string;
  status?: number;
  providerCode?: string | number;
}

export function serializeError(err: unknown, provider: ProviderType): SerializedProviderError {
  if (err instanceof ProviderError) return err.toJSON();
  return new ProviderError({
    provider,
    kind: "NORMALIZATION_FAILED",
    message: err instanceof Error ? err.message : "Unknown error",
  }).toJSON();
}
