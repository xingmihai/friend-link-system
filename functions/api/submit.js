// functions/api/submit.js

export async function onRequestGet() {
  return new Response(JSON.stringify({ error: "此接口需要 POST 请求" }), {
    status: 405,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}


export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    }
  });
}
