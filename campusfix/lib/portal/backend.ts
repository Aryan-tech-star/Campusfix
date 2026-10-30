export function backendUrl() {
  const value = process.env.API_BASE_URL || "http://127.0.0.1:4000";
  const url = new URL(value);
  if (
    process.env.NODE_ENV === "production" &&
    url.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(url.hostname)
  )
    throw new Error("API_BASE_URL must use HTTPS in production.");
  return value.replace(/\/$/, "");
}
export async function proxyApi(request: Request, segments: string[]) {
  if (segments.some((p) => !/^[a-zA-Z0-9_-]+$/.test(p)))
    return Response.json({ error: "Invalid API path." }, { status: 400 });
  const headers = new Headers();
  for (const key of ["content-type", "cookie", "origin", "sec-fetch-site"]) {
    const value = request.headers.get(key);
    if (value) headers.set(key, value);
  }
  try {
    let body: string | undefined;
    if (!["GET", "HEAD"].includes(request.method)) {
      if (Number(request.headers.get("content-length") || 0) > 4_500_000)
        return Response.json({ error: "Request too large." }, { status: 413 });
      body = await request.text();
      if (body.length > 4_500_000)
        return Response.json({ error: "Request too large." }, { status: 413 });
    }
    const response = await fetch(
      `${backendUrl()}/api/${segments.join("/")}${new URL(request.url).search}`,
      {
        method: request.method,
        headers,
        body,
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(55000),
      },
    );
    const output = new Headers({
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    for (const value of response.headers.getSetCookie())
      output.append("Set-Cookie", value);
    return new Response(response.body, {
      status: response.status,
      headers: output,
    });
  } catch {
    return Response.json(
      {
        error:
          "The CampusFix backend did not respond. Refresh to check the latest state before retrying your action.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
