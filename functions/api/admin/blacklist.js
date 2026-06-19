// functions/api/admin/blacklist.js
import { ok, err, requireAdmin } from '../_utils.js';

const ADMIN_KEYS = ['config:email', 'config:smtp'];

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
    // 读取管理员邮箱（排除用）
    const emailRaw = JSON.parse(await env.LINKS.get('config:email') || '{}');
    const adminEmail = emailRaw.to || '';

    const raw = await env.LINKS.get('email-blacklist') || '{}';
    const bl = JSON.parse(raw);
    const list = Object.entries(bl)
      .filter(([e]) => e !== adminEmail) // 管理员邮箱除外
      .map(([email, count]) => ({ email, blocked: count >= 3, count }));
    return ok({ list });
  }

  if (action === 'reset' && email) {
    const raw = await env.LINKS.get('email-blacklist') || '{}';
    const bl = JSON.parse(raw);
    delete bl[email];
    await env.LINKS.put('email-blacklist', JSON.stringify(bl));
    return ok({ message: `已解除 ${email} 的黑名单` });
  }

  return err('缺少 action 参数 (list/reset)');
}

export async function onRequestOptions() { return new Response(null, { status: 204 }); }
