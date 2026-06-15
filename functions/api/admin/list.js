// functions/api/admin/list.js
// 获取友链列表（按状态过滤）
import { ok, err, requireAdmin } from '../_utils.js';
import { getStorage } from '../_storage.js';

export async function onRequestGet({ request, env }) {
  const auth = await requireAdmin(request, env);
  if (!auth.ok) return err(auth.reason, 401);

  const url = new URL(request.url);
  const status = url.searchParams.get('status') || 'pending';
  const storage = getStorage(env);
  const out = await storage.getLinkList(env, status);

  // 置顶排最前，然后按创建时间倒序
  out.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });

  return ok({ list: out, total: out.length });
}

export async function onRequestOptions() { return new Response(null, { status: 204 }); }
