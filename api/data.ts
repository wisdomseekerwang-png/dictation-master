import type { VercelRequest, VercelResponse } from '@vercel/node';

// 存储结构
interface AppData {
  wordBanks: any[];
  wrongWords: any[];
  dictationRecords: any[];
  settings: any;
  dailyNewWords: Record<string, string[]>;
}

// 内存存储（Vercel Serverless 函数会冷启动，需要持久化）
// 使用 KV 存储
let storage: AppData = {
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 设置 CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // 尝试使用 Vercel KV
    let kv: any = null;
    try {
      const { createClient } = require('@vercel/kv');
      kv = createClient({
        url: process.env.KV_REST_API_URL,
        token: process.env.KV_REST_API_TOKEN,
      });
    } catch (e) {
      // KV 未配置，使用内存存储
    }

    if (req.method === 'GET') {
      // 获取数据
      if (kv) {
        const data = await kv.get('appData');
        if (data) {
          storage = { ...storage, ...data };
        }
      }
      return res.status(200).json({ success: true, data: storage });
    }

    if (req.method === 'POST') {
      // 保存数据
      const newData = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      storage = { ...storage, ...newData };
      
      if (kv) {
        await kv.set('appData', storage);
      }
      
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ success: false, error: String(error) });
  }
}
