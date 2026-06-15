// functions/api/status.js
import { ok, err } from './_utils.js';
import { getStorage } from './_storage.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim();
  if (!q) return err('查询参数 q 必填');

  const storage = getStorage(env);

  const pending = await storage.getLinkList(env, 'pending');
  const approved = await storage.getLinkList(env, 'approved');
  const rejected = await storage.getLinkList(env, 'rejected');

  const match = (r) => r && (r.title.includes(q) || r.link.includes(q));

  const items = [
    ...pending.filter(match).map(r => ({ status: 'pending', record: r })),
    ...approved.filter(match).map(r => ({ status: 'approved', record: r })),
    ...rejected.filter(match).map(r => ({ status: 'rejected', record: r }))
  ];

  return items.length
    ? ok({ items })
    : ok({ items: [], message: '未找到匹配记录' });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS'
    }
  });
}
