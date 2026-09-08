/** Thin fetch wrapper so components handle one error shape, not three. */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers:
      init?.body instanceof FormData
        ? init?.headers
        : { "content-type": "application/json", ...init?.headers },
  });

  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
  return body;
}

export function post<T>(path: string, payload?: unknown): Promise<T> {
  return api<T>(path, {
    method: "POST",
    body: payload instanceof FormData ? payload : JSON.stringify(payload ?? {}),
  });
}
