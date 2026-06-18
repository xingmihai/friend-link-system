// functions/api/admin/test-email.js

export async function onRequestGet() {
  return new Response(JSON.stringify({ error: "此接口需要 POST 请求" }), {
    status: 405,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}


export async function onRequestOptions() { return new Response(null, { status: 204 }); }
