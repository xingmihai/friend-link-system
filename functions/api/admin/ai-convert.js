// functions/api/admin/ai-convert.js

export async function onRequestGet() {
  return new Response(JSON.stringify({ error: "此接口需要 POST 请求" }), {
    status: 405,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}


async function getKey(env) {
  const raw = await env.LINKS.get('config:ai');
  if (raw) {
    try {
      const cfg = JSON.parse(raw);
      if (cfg.apiKey) return cfg.apiKey;
    } catch {}
  }
  return env.DEEPSEEK_KEY || '';
}

export async function onRequestOptions() { return new Response(null, { status: 204 }); }
