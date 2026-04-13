// OCR批改服务 - 支持腾讯云、百度、手写模拟三种后端
// 使用说明：配置环境变量后自动使用真实OCR

export interface OCRResult {
  success: boolean;
  text: string;
  words: string[];
  error?: string;
}

// 简单的文本相似度匹配
export const fuzzyMatch = (input: string, target: string): boolean => {
  const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '');
  return normalize(input) === normalize(target);
};

// ========== 腾讯云 OCR ==========
// 需要在 .env 中配置:
// VITE_TENCENT_CLOUD_SECRET_ID - 密钥ID
// VITE_TENCENT_CLOUD_SECRET_KEY - 密钥Key

// 腾讯云 TC3-HMAC-SHA256 签名
async function tencentCloudSign(
  secretId: string,
  secretKey: string,
  payload: string
): Promise<{ authorization: string; timestamp: number }> {
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().split('T')[0];

  // 拼接正文
  const httpRequestMethod = 'POST';
  const canonicalUri = '/';
  const canonicalQueryString = '';
  const canonicalHeaders = `content-type:application/json\nhost:ocr.tencentcloudapi.com\n`;
  const canonicalRequest = [
    httpRequestMethod,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' // 空内容hash
  ].join('\n');

  const hashedCanonicalRequest = await sha256(canonicalRequest);
  const stringToSign = [
    'TC3-HMAC-SHA256',
    timestamp,
    `${date}/ocr/tc3_request`,
    hashedCanonicalRequest
  ].join('\n');

  const secretDate = await hmacSha256(`TC3${secretKey}`, date);
  const secretSigning = await hmacSha256(secretDate, 'tc3_request');
  const signature = await hmacSha256(secretSigning, stringToSign);

  const authorization = `TC3-HMAC-SHA256 Credential=${secretId}/${date}/ocr/tc3_request, SignedHeaders=content-type;host, Signature=${signature}`;

  return { authorization, timestamp };
}

async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256(key: string, message: string): Promise<string> {
  const keyBuffer = new TextEncoder().encode(key);
  const msgBuffer = new TextEncoder().encode(message);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgBuffer);
  const hashArray = Array.from(new Uint8Array(signature));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export const ocrWithTencentCloud = async (imageBase64: string): Promise<OCRResult> => {
  const secretId = import.meta.env.VITE_TENCENT_CLOUD_SECRET_ID;
  const secretKey = import.meta.env.VITE_TENCENT_CLOUD_SECRET_KEY;

  if (!secretId || !secretKey) {
    return {
      success: false,
      text: '',
      words: [],
      error: '未配置腾讯云API密钥。请创建 .env 文件，配置:\nVITE_TENCENT_CLOUD_SECRET_ID=你的SecretId\nVITE_TENCENT_CLOUD_SECRET_KEY=你的SecretKey'
    };
  }

  try {
    const payload = JSON.stringify({
      ImageBase64: imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64
    });

    const { authorization, timestamp } = await tencentCloudSign(secretId, secretKey, payload);

    const response = await fetch('https://ocr.tencentcloudapi.com', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authorization,
        'X-TC-Action': 'HandWritingOCR',
        'X-TC-Version': '2018-11-19',
        'X-TC-Region': 'ap-beijing',
        'X-TC-Timestamp': timestamp.toString(),
      },
      body: payload
    });

    if (!response.ok) {
      throw new Error(`HTTP错误: ${response.status}`);
    }

    const data = await response.json();

    if (data.Response?.Error) {
      return {
        success: false,
        text: '',
        words: [],
        error: `腾讯云OCR错误: ${data.Response.Error.Message}`
      };
    }

    const words = data.Response?.TextDetections
      ?.map((item: any) => item.DetectedText?.trim())
      ?.filter((t: string) => t && t.length > 0) || [];

    return {
      success: true,
      text: words.join('\n'),
      words
    };
  } catch (error) {
    return {
      success: false,
      text: '',
      words: [],
      error: error instanceof Error ? error.message : '腾讯云OCR识别失败'
    };
  }
};

// 使用百度OCR API（备选方案）
export const ocrWithBaidu = async (imageBase64: string): Promise<OCRResult> => {
  const apiKey = import.meta.env.VITE_BAIDU_API_KEY;
  const secretKey = import.meta.env.VITE_BAIDU_SECRET_KEY;

  if (!apiKey || !secretKey) {
    return {
      success: false,
      text: '',
      words: [],
      error: '未配置百度API密钥'
    };
  }

  try {
    // 获取access token
    const tokenResponse = await fetch(
      `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${apiKey}&client_secret=${secretKey}`
    );
    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // 调用手写识别
    const response = await fetch(
      `https://aip.baidubce.com/rpc/2.0/ai_custom/v1/ocr_v1/handwriting?access_token=${accessToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: imageBase64.split(',')[1] || imageBase64
        })
      }
    );

    const data = await response.json();

    if (data.error_code) {
      return {
        success: false,
        text: '',
        words: [],
        error: data.error_msg
      };
    }

    const words = data.words_result?.map((item: any) => item.words) || [];

    return {
      success: true,
      text: words.join(' '),
      words
    };
  } catch (error) {
    return {
      success: false,
      text: '',
      words: [],
      error: error instanceof Error ? error.message : 'OCR识别失败'
    };
  }
};

// 模拟OCR（用于演示和调试）
export const mockOCR = async (expectedWords: string[]): Promise<OCRResult> => {
  // 模拟API延迟
  await new Promise(resolve => setTimeout(resolve, 1000));

  // 随机返回部分词语（模拟80%识别率）
  const recognizedWords = expectedWords.filter(() => Math.random() > 0.2);

  return {
    success: true,
    text: recognizedWords.join(' '),
    words: recognizedWords
  };
};

// 智能批改：对比OCR识别结果与标准答案
export interface GradeResult {
  word: string;
  correct: boolean;
  recognized?: string; // OCR识别的文本
}

export const gradeAnswers = (
  expectedWords: string[],
  recognizedWords: string[]
): GradeResult[] => {
  const results: GradeResult[] = [];
  const recognizedSet = new Set(recognizedWords.map(w => w.trim().toLowerCase()));

  for (const word of expectedWords) {
    const normalized = word.trim().toLowerCase();
    const isCorrect = recognizedSet.has(normalized) ||
                      recognizedWords.some(r => fuzzyMatch(r, word));

    results.push({
      word,
      correct: isCorrect,
      recognized: recognizedWords.find(r =>
        fuzzyMatch(r, word) || normalized.includes(r.trim().toLowerCase())
      )
    });
  }

  return results;
};

// 选择OCR引擎（默认腾讯云，已配置密钥时使用真实OCR）
export const performOCR = async (
  imageBase64: string,
  engine: 'tencent' | 'baidu' | 'mock' = 'mock'
): Promise<OCRResult> => {
  // 如果未配置任何密钥，使用模拟OCR
  const hasTencentKey = import.meta.env.VITE_TENCENT_CLOUD_SECRET_ID && import.meta.env.VITE_TENCENT_CLOUD_SECRET_KEY;
  const hasBaiduKey = import.meta.env.VITE_BAIDU_API_KEY && import.meta.env.VITE_BAIDU_SECRET_KEY;

  const actualEngine = hasTencentKey ? 'tencent' : hasBaiduKey ? 'baidu' : 'mock';

  switch (actualEngine) {
    case 'tencent':
      return ocrWithTencentCloud(imageBase64);
    case 'baidu':
      return ocrWithBaidu(imageBase64);
    case 'mock':
    default:
      return mockOCR([]);
  }
};
