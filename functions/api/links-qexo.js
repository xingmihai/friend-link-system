// functions/api/links-qexo.js
// Qexo 兼容格式的友链 API
import { getList } from './_utils.js';

export async function onRequestGet({ env }) {
  const ids = await getList(env, 'link:list:approved');
  const items = [];
  for (const id of ids) {
    const r = JSON.parse(await env.LINKS.get(`link:approved:${id}`) || 'null');
    if (!r) continue;
    items.push(r);
  }
  // 置顶排最前
  items.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return 0;
  });
  const data = items.map(r => ({
    name: r.title, url: r.link, image: r.avatar, description: r.descr
  }));
  const body = JSON.stringify({ data, status: true }, null, 2);
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=600'
    }
  });
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
