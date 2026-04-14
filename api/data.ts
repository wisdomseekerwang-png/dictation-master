import type { VercelRequest, VercelResponse } from '@vercel/node';

// 存储结构
interface AppData {
  wordBanks: any[];
  wrongWords: any[];
  dictationRecords: any[];
  settings: any;
  dailyNewWords: Record<string, string[]>;
}

const defaultData: AppData = {
  wordBanks: [],
  wrongWords: [],
  dictationRecords: [],
  settings: {
    wordCount: 10,
    speechRate: 0.8,
    repeatCount: 3,
    intervalTime: 3,
    includeWrongWords: true,
  },
  dailyNewWords: {},
};

// 安全解析 JSON，避免双重编码问题
function safeParse(raw: any): AppData {
  if (!raw) return { ...defaultData };
  
  // 如果是字符串，尝试解析
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      // 如果解析失败，可能是双重编码，尝试再解析一次
      try {
        raw = JSON.parse(raw);
      } catch {
        return { ...defaultData };
      }
    }
  }

  // 处理 { value: "{\"...\"}" } 格式的污染数据
  if (typeof raw === 'object' && raw !== null && raw.value) {
    try {
      // 尝试解析 value 字段
      let inner = raw.value;
      if (typeof inner === 'string') {
        inner = JSON.parse(inner);
      }
      // 如果 inner 仍然有 value 字段（多重嵌套），递归处理
      if (inner && typeof inner === 'object' && inner.value) {
        let deeper = inner.value;
        if (typeof deeper === 'string') {
          deeper = JSON.parse(deeper);
        }
        inner = deeper;
      }
      // 合并默认数据和解析出的数据
      return { ...defaultData, ...inner };
    } catch {
      // value 解析失败，尝试直接使用 raw
      return { ...defaultData, ...raw };
    }
  }

  // 直接合并
  if (typeof raw === 'object' && raw !== null) {
    return { ...defaultData, ...raw };
  }

  return { ...defaultData };
}

// 使用 Upstash Redis 作为持久化存储
async function getRedisClient() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  return {
    get: async (key: string) => {
      const resp = await fetch(`${url}/get/${key}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) {
        console.error('Redis GET failed:', resp.status, await resp.text());
        return null;
      }
      const json = await resp.json();
      // 检查是否有错误码（Upstash 限流等情况）
      if (json.error || json.error_code) {
        console.error('Redis error:', json);
        return null;
      }
      if (json.result === null || json.result === undefined) return null;
      try {
        return JSON.parse(json.result);
      } catch {
        return json.result;
      }
    },
    set: async (key: string, value: any) => {
      const resp = await fetch(`${url}/set/${key}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ value: JSON.stringify(value) }),
      });
      if (!resp.ok) {
        console.error('Redis SET failed:', resp.status, await resp.text());
      }
    },
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 设置 CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const redis = await getRedisClient();

    if (req.method === 'GET') {
      let data: AppData = { ...defaultData };
      if (redis) {
        const stored = await redis.get('dictation-master-data');
        if (stored) {
          data = safeParse(stored);
        }
      }
      return res.status(200).json({ success: true, data });
    }

    if (req.method === 'POST') {
      const newData = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

      // 先读取已有数据，用 safeParse 解开双重编码
      let current: AppData = { ...defaultData };
      if (redis) {
        const stored = await redis.get('dictation-master-data');
        if (stored) {
          current = safeParse(stored);
        }
        const merged = { ...current, ...newData };
        await redis.set('dictation-master-data', merged);
      }

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ success: false, error: String(error) });
  }
}
