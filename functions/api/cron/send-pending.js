// functions/api/cron/send-pending.js
// 扫描邮件队列，逐封发送——带锁防并发、批次限制、失败重试
import { sendEmail } from '../_utils.js';
import { getStorage } from '../_storage.js';

const MAX_BATCH = 10;   // 单次 cron 最多发 N 封
const MAX_RETRIES = 3;  // 单封邮件最大重试次数
const LOCK_KEY = 'email-queue:lock';
const LOCK_TTL = 60;    // 锁 60 秒自动释放（防实例崩溃死锁）

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const secret = url.searchParams.get('secret');
  if (!secret || secret !== env.CRON_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  const storage = getStorage(env);

  // 分布式锁：避免并发 cron 重复处理
  const existingLock = await storage.get(env, LOCK_KEY);
  if (existingLock) {
    return new Response(`OK (locked by ${existingLock})`, { status: 200 });
  }
  await storage.put(env, LOCK_KEY, String(Date.now()), { expirationTtl: LOCK_TTL });

  try {
    const queue = await storage.getEmailQueue(env);
    if (queue.length === 0) return new Response('OK (empty)');

    let sent = 0, failed = 0, skipped = 0;
    for (const item of queue) {
      if (sent + failed >= MAX_BATCH) { skipped = queue.length - sent - failed; break; }

      try {
        await sendEmail(env, item.subject, item.html, item.to || undefined);
        await storage.deleteEmailQueueItem(env, item._key);
        sent++;
      } catch (e) {
        console.error(`[send-pending] ${item._key}:`, e.message);
        const retryCount = (item.retries || 0) + 1;
        if (retryCount >= MAX_RETRIES) {
          await storage.deleteEmailQueueItem(env, item._key);
          console.error(`[send-pending] ${item._key}: 重试${MAX_RETRIES}次均失败，已废弃`);
        } else {
          item.retries = retryCount;
          await storage.put(env, item._key, JSON.stringify(item));
          failed++;
        }
      }
    }

    const remain = queue.length - sent - failed;
    return new Response(`OK sent=${sent} failed=${failed} skip=${skipped} remain=${remain}`);
  } finally {
    await storage.delete(env, LOCK_KEY);
  }
}
