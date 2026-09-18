const corsOrigin = () => process.env.OPS_API_CORS?.trim() || "*";

export function corsHeaders(extra?: HeadersInit) {
  const headers = new Headers(extra);
  headers.set("Access-Control-Allow-Origin", corsOrigin());
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  headers.set("Access-Control-Max-Age", "86400");
  return headers;
}

export function jsonApi(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders({ "Content-Type": "application/json; charset=utf-8" }),
  });
}

export function errorApi(message: string, status: number) {
  return jsonApi({ error: message }, status);
}

export function optionsApi() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}
