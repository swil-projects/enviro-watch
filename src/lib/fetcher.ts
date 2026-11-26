/** Client-side JSON fetcher for internal APIs. Throws with the server's error message. */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

export async function apiGet<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { Accept: "application/json", ...(init?.headers ?? {}) } });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined") window.location.assign("/login");
    throw new ApiError(res.status, body?.error?.code ?? "HTTP_" + res.status, body?.error?.message ?? res.statusText, body?.error?.details);
  }
  return body.data as T;
}

export async function apiSend<T>(url: string, method: "POST" | "DELETE", payload?: unknown): Promise<T> {
  return apiGet<T>(url, { method, body: payload === undefined ? undefined : JSON.stringify(payload), headers: { "Content-Type": "application/json" } });
}
