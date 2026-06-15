// functions/api/_storage.js
// 存储抽象层：统一 KV 和 D1 数据库接口，上层代码无需关心底层实现

/**
 * 存储类型判断
 * 通过环境变量 STORAGE_TYPE 控制，可选值：kv / d1
 * 默认使用 KV，兼容原有部署
 */
function getStorageType(env) {
  return (env.STORAGE_TYPE || 'kv').toLowerCase();
}

// ==================== KV 存储实现 ====================
const KVStorage = {
  // 基础键值操作
  async get(env, key) {
    return await env.LINKS.get(key);
  },

  async put(env, key, value) {
    return await env.LINKS.put(key, value);
  },

  async delete(env, key) {
    return await env.LINKS.delete(key);
  },

  // 列表操作
  async list(env, prefix = '') {
    const result = await env.LINKS.list({ prefix });
    return result.keys.map(k => k.name);
  },

  // 友链列表专用方法
  async getLinkList(env, type) {
    // type: pending / approved / rejected
    const raw = await this.get(env, `links:${type}`);
    return raw ? JSON.parse(raw) : [];
  },

  async setLinkList(env, type, list) {
    return await this.put(env, `links:${type}`, JSON.stringify(list));
  },

  // 配置专用方法
  async getConfig(env, name) {
    const raw = await this.get(env, `config:${name}`);
    return raw ? JSON.parse(raw) : null;
  },

  async setConfig(env, name, value) {
    return await this.put(env, `config:${name}`, JSON.stringify(value));
  },

  // 会话专用方法
  async getSession(env, token) {
    const raw = await this.get(env, `session:${token}`);
    return raw ? JSON.parse(raw) : null;
  },

  async setSession(env, token, session, ttl) {
    return await this.put(env, `session:${token}`, JSON.stringify(session), {
      expirationTtl: Math.floor(ttl / 1000)
    });
  },

  async deleteSession(env, token) {
    return await this.delete(env, `session:${token}`);
  },

  // RSS 专用方法
  async getRssCache(env) {
    const raw = await this.get(env, 'rss:cache');
    return raw ? JSON.parse(raw) : [];
  },

  async setRssCache(env, data) {
    return await this.put(env, 'rss:cache', JSON.stringify(data));
  },

  // 邮件队列专用方法
  async getEmailQueue(env) {
    const keys = await this.list(env, 'email-queue:');
    const items = [];
    for (const key of keys) {
      const raw = await this.get(env, key);
      if (raw) {
        items.push({ key, ...JSON.parse(raw) });
      }
    }
    return items;
  },

  async deleteEmailQueueItem(env, key) {
    return await this.delete(env, key);
  },

  // 初始化（KV不需要初始化）
  async init(env) {
    return true;
  }
};

// ==================== D1 数据库实现 ====================
const D1Storage = {
  // 初始化表结构
  async init(env) {
    // 1. 键值存储表（兼容KV的键值模式，平滑迁移）
    await env.D1.prepare(`
      CREATE TABLE IF NOT EXISTS kv_store (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        expires_at INTEGER
      )
    `).run();

    // 2. 友链表（结构化存储，比KV更高效）
    await env.D1.prepare(`
      CREATE TABLE IF NOT EXISTS links (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL, -- pending / approved / rejected
        title TEXT NOT NULL,
        link TEXT NOT NULL,
        avatar TEXT NOT NULL,
        descr TEXT NOT NULL,
        rss TEXT,
        email TEXT,
        pinned INTEGER DEFAULT 0,
        top INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        approved_at INTEGER,
        rejected_at INTEGER,
        reject_reason TEXT,
        updated_at INTEGER,
        reviewed_at INTEGER
      )
    `).run();

    // 3. 配置表
    await env.D1.prepare(`
      CREATE TABLE IF NOT EXISTS configs (
        name TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `).run();

    // 4. 会话表
    await env.D1.prepare(`
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      )
    `).run();

    // 5. RSS缓存表
    await env.D1.prepare(`
      CREATE TABLE IF NOT EXISTS rss_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        auther TEXT NOT NULL,
        date TEXT NOT NULL,
        link TEXT NOT NULL,
        content TEXT,
        created_at INTEGER NOT NULL
      )
    `).run();

    // 6. 邮件队列表（to是SQLite保留关键字，改用mail_to）
    await env.D1.prepare(`
      CREATE TABLE IF NOT EXISTS email_queue (
        id TEXT PRIMARY KEY,
        subject TEXT NOT NULL,
        html TEXT NOT NULL,
        mail_to TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `).run();

    // 创建索引提升查询速度
    await env.D1.prepare(`CREATE INDEX IF NOT EXISTS idx_links_type ON links(type)`).run();
    await env.D1.prepare(`CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)`).run();

    return true;
  },

  // 基础键值操作（兼容KV模式）
  async get(env, key) {
    const result = await env.D1.prepare(`
      SELECT value FROM kv_store WHERE key = ? AND (expires_at IS NULL OR expires_at > ?)
    `).bind(key, Date.now()).first();
    return result ? result.value : null;
  },

  async put(env, key, value, options = {}) {
    const now = Date.now();
    const expiresAt = options.expirationTtl ? now + options.expirationTtl * 1000 : null;
    
    // 先尝试更新，不存在则插入
    const existing = await env.D1.prepare(`SELECT key FROM kv_store WHERE key = ?`).bind(key).first();
    
    if (existing) {
      return await env.D1.prepare(`
        UPDATE kv_store SET value = ?, updated_at = ?, expires_at = ? WHERE key = ?
      `).bind(value, now, expiresAt, key).run();
    } else {
      return await env.D1.prepare(`
        INSERT INTO kv_store (key, value, created_at, updated_at, expires_at)
        VALUES (?, ?, ?, ?, ?)
      `).bind(key, value, now, now, expiresAt).run();
    }
  },

  async delete(env, key) {
    return await env.D1.prepare(`DELETE FROM kv_store WHERE key = ?`).bind(key).run();
  },

  async list(env, prefix = '') {
    const results = await env.D1.prepare(`
      SELECT key FROM kv_store WHERE key LIKE ? ORDER BY key
    `).bind(prefix + '%').all();
    return results.results.map(r => r.key);
  },

  // 友链列表专用方法（结构化存储）
  async getLinkList(env, type) {
    const results = await env.D1.prepare(`
      SELECT * FROM links WHERE type = ? ORDER BY top DESC, created_at DESC
    `).bind(type).all();
    // 字段映射：SQL下划线命名 -> JS驼峰命名
    return results.results.map(item => ({
      id: item.id,
      title: item.title,
      link: item.link,
      avatar: item.avatar,
      descr: item.descr,
      rss: item.rss,
      email: item.email,
      pinned: item.pinned === 1,
      top: item.top,
      createdAt: item.created_at ? new Date(item.created_at).toISOString() : null,
      approvedAt: item.approved_at ? new Date(item.approved_at).toISOString() : null,
      rejectedAt: item.rejected_at ? new Date(item.rejected_at).toISOString() : null,
      rejectReason: item.reject_reason,
      updatedAt: item.updated_at ? new Date(item.updated_at).toISOString() : null,
      reviewedAt: item.reviewed_at ? new Date(item.reviewed_at).toISOString() : null
    }));
  },

  async setLinkList(env, type, list) {
    // 先删除该类型所有记录
    await env.D1.prepare(`DELETE FROM links WHERE type = ?`).bind(type).run();
    
    // 批量插入新记录
    const stmt = env.D1.prepare(`
      INSERT INTO links (id, type, title, link, avatar, descr, rss, email, pinned, top, created_at, approved_at, rejected_at, reject_reason, updated_at, reviewed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    for (const item of list) {
      // 解析ISO时间戳
      const parseDate = (iso) => iso ? new Date(iso).getTime() : null;
      
      await stmt.bind(
        item.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        type,
        item.title,
        item.link,
        item.avatar,
        item.descr,
        item.rss || '',
        item.email || '',
        item.pinned ? 1 : 0,
        item.top || 0,
        item.createdAt || Date.now(),
        parseDate(item.approvedAt),
        parseDate(item.rejectedAt),
        item.rejectReason || '',
        parseDate(item.updatedAt),
        parseDate(item.reviewedAt)
      ).run();
    }
    return true;
  },

  // 配置专用方法
  async getConfig(env, name) {
    const result = await env.D1.prepare(`SELECT value FROM configs WHERE name = ?`).bind(name).first();
    return result ? JSON.parse(result.value) : null;
  },

  async setConfig(env, name, value) {
    const now = Date.now();
    const existing = await env.D1.prepare(`SELECT name FROM configs WHERE name = ?`).bind(name).first();
    
    if (existing) {
      return await env.D1.prepare(`
        UPDATE configs SET value = ?, updated_at = ? WHERE name = ?
      `).bind(JSON.stringify(value), now, name).run();
    } else {
      return await env.D1.prepare(`
        INSERT INTO configs (name, value, updated_at) VALUES (?, ?, ?)
      `).bind(name, JSON.stringify(value), now).run();
    }
  },

  // 会话专用方法
  async getSession(env, token) {
    const result = await env.D1.prepare(`
      SELECT value FROM sessions WHERE token = ? AND expires_at > ?
    `).bind(token, Date.now()).first();
    return result ? JSON.parse(result.value) : null;
  },

  async setSession(env, token, session, ttl) {
    const expiresAt = Date.now() + ttl;
    return await env.D1.prepare(`
      INSERT OR REPLACE INTO sessions (token, value, expires_at)
      VALUES (?, ?, ?)
    `).bind(token, JSON.stringify(session), expiresAt).run();
  },

  async deleteSession(env, token) {
    return await env.D1.prepare(`DELETE FROM sessions WHERE token = ?`).bind(token).run();
  },

  // RSS 专用方法
  async getRssCache(env) {
    const results = await env.D1.prepare(`
      SELECT * FROM rss_cache ORDER BY date DESC LIMIT 20
    `).all();
    return results.results;
  },

  async setRssCache(env, data) {
    // 清空旧缓存
    await env.D1.prepare(`DELETE FROM rss_cache`).run();
    
    // 批量插入新数据
    const stmt = env.D1.prepare(`
      INSERT INTO rss_cache (title, auther, date, link, content, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    for (const item of data) {
      await stmt.bind(
        item.title,
        item.auther,
        item.date,
        item.link,
        item.content || '',
        Date.now()
      ).run();
    }
    return true;
  },

  // 邮件队列专用方法
  async getEmailQueue(env) {
    const results = await env.D1.prepare(`
      SELECT * FROM email_queue ORDER BY created_at ASC
    `).all();
    // 字段映射：mail_to -> to，保持与KV模式兼容
    return results.results.map(item => ({ 
      key: item.id, 
      id: item.id,
      subject: item.subject,
      html: item.html,
      to: item.mail_to,
      created_at: item.created_at
    }));
  },

  async deleteEmailQueueItem(env, key) {
    return await env.D1.prepare(`DELETE FROM email_queue WHERE id = ?`).bind(key).run();
  }
};

// ==================== 统一导出接口 ====================
export function getStorage(env) {
  const type = getStorageType(env);
  return type === 'd1' ? D1Storage : KVStorage;
}

// 导出初始化方法
export async function initStorage(env) {
  const storage = getStorage(env);
  return await storage.init(env);
}

// 兼容原有代码的快捷方法
export async function getList(env, key) {
  const storage = getStorage(env);
  // 兼容原有调用方式：getList(env, 'links:pending')
  const type = key.replace('links:', '');
  return await storage.getLinkList(env, type);
}

export async function setList(env, key, arr) {
  const storage = getStorage(env);
  const type = key.replace('links:', '');
  return await storage.setLinkList(env, type, arr);
}
