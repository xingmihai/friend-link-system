// functions/api/admin/rss-status.js
import { ok, err, requireAdmin } from '../_utils.js';
import { getStorage } from '../_storage.js';

export async function onRequestGet({ request, env }) {
  const auth = await requireAdmin(request, env);
  if (!auth.ok) return err(auth.reason, 401);

  const storage = getStorage(env);
  const cursor = await storage.get(env, 'rss:cursor') || '0';
  const lastUpdate = await storage.get(env, 'rss:lastUpdate');
  const current = await storage.get(env, 'rss:feeds:current');
  const articlesRaw = await storage.get(env, 'rss:articles');
  const articles = articlesRaw ? JSON.parse(articlesRaw) : [];

  return ok({
    cursor: parseInt(cursor, 10),
    lastUpdate,
    currentFeeds: current ? JSON.parse(current) : [],
    articleCount: articles.length
  });
}

export async function onRequestOptions() { return new Response(null, { status: 204 }); }
