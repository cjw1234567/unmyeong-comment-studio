let token = "";
export async function api<T>(
  url: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const result = await fetch(`/api${url}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "X-Studio-Token": token } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await result.json();
  if (!result.ok) throw new Error(data.error || "요청을 처리하지 못했습니다.");
  return data;
}
export async function bootstrap<T>(): Promise<T> {
  const data = await api<{ token: string; state: T }>("/bootstrap");
  token = data.token;
  return data.state;
}
