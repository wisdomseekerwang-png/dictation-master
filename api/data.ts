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
          data = { ...defaultData, ...stored };
        }
      }
      return res.status(200).json({ success: true, data });
    }

    if (req.method === 'POST') {
      const newData = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

      // 先读取已有数据再合并，防止覆盖
      let current: AppData = { ...defaultData };
      if (redis) {
        const stored = await redis.get('dictation-master-data');
        if (stored) {
          current = { ...defaultData, ...stored };
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
