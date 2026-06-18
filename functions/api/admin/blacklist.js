// functions/api/admin/blacklist.js
import { ok, err, requireAdmin } from '../_utils.js';

export async function onRequestGet() {
  return new Response(JSON.stringify({ error: '此接口需要 POST 请求' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

export async function onRequestPost({ request, env }) {
  const auth = await requireAdmin(request, env);
  if (!auth.ok) return err(auth.reason, 401);

  let body;
  try { body = await request.json(); } catch { return err('请求体不是 JSON'); }
  const { action, email } = body;

  if (action === 'list') {
    const result = [];
    const list = await env.LINKS.list({ prefix: 'email-blacklist:' });
    for (const key of list.keys) {
      const count = await env.LINKS.get(key.name);
      result.push({ email: key.name.replace('email-blacklist:', ''), blocked: parseInt(count) >= 3, count: parseInt(count) });
    }
    return ok({ list: result });
  }

  if (action === 'reset' && email) {
    await env.LINKS.delete(`email-blacklist:${email}`);
    return ok({ message: `已解除 ${email} 的黑名单` });
  }

  return err('缺少 action 参数 (list/reset)');
}

export async function onRequestOptions() { return new Response(null, { status: 204 }); }
