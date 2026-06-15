// functions/api/admin/login.js
import { ok, err, hashPassword, verifyPassword, genToken, setSessionCookie } from '../_utils.js';
import { getStorage } from '../_storage.js';

const TOKEN_TTL = 7 * 24 * 60 * 60 * 1000; // 7 天

export async function onRequest({ request, env }) {
  // 非 POST 和 OPTIONS 一律返回 405
  if (request.method === 'OPTIONS') return onRequestOptions({ request });
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: '请使用 POST 请求登录' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }
  return onRequestPost({ request, env });
}

async function onRequestPost({ request, env }) {
  try {
    let body;
    try { body = await request.json(); } catch { return err('请求体不是 JSON'); }
    const { username, password } = body;
    if (!username || !password) return err('用户名密码必填');

    const storage = getStorage(env);
    await storage.init(env); // 确保存储初始化

    // 读取管理员配置，没有就用默认 admin/123456 并自动初始化
    let cfg = await storage.getConfig(env, 'admin');
    if (!cfg) {
      const passHash = await hashPassword('123456');
      cfg = { user: 'admin', passHash, initialized: true };
      await storage.setConfig(env, 'admin', cfg);
    }

    if (username !== cfg.user) return err('用户名或密码错误', 401);
    const valid = await verifyPassword(password, cfg.passHash);
    if (!valid) return err('用户名或密码错误', 401);

    // 检查是否还是默认密码
    const defaultHash = await hashPassword('123456');
    const mustChange = cfg.passHash === defaultHash;

    // 签发 token
    const token = genToken();
    await storage.setSession(env, token, { user: cfg.user, exp: Date.now() + TOKEN_TTL }, TOKEN_TTL);

    return new Response(
      JSON.stringify({ success: true, data: { mustChangePassword: mustChange, token } }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': request.headers.get('Origin') || '*',
          'Access-Control-Allow-Credentials': 'true',
          'Set-Cookie': setSessionCookie(token, TOKEN_TTL)
        }
      }
    );
  } catch (e) {
    console.error('登录失败:', e.message);
    return err('登录失败: ' + e.message, 500);
  }
}

function onRequestOptions({ request }) {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': request.headers.get('Origin') || '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Credentials': 'true'
    }
  });
}
