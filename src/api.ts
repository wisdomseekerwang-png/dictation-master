// API服务层 - 与后端同步数据

const API_BASE = '/api';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// 通用请求函数
async function apiRequest<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      ...options,
    });
    const data = await res.json();
    return data;
  } catch (error) {
    console.error('API Error:', error);
    return { success: false, error: String(error) };
  }
}

// ============ 数据类型 ============
export interface WordBank {
  id: string;
  name: string;
  source: 'pdf' | 'txt' | 'paste';
  words: string[];
  createdAt: number;
  wordCount: number;
}

export interface WrongWord {
  word: string;
  addedAt: number;
  wrongCount: number;
  lastWrongAt: number;
}

export interface DictationRecord {
  id: string;
  words: string[];
  results: { word: string; correct: boolean }[];
  settings: DictationSettings;
  completedAt: number;
}

export interface DictationSettings {
  wordCount: number;
  speechRate: number;
  repeatCount: number;
  intervalTime: number;
  includeWrongWords: boolean;
}

export interface AppData {
  wordBanks: WordBank[];
  wrongWords: WrongWord[];
  dictationRecords: DictationRecord[];
  settings: DictationSettings;
  dailyNewWords: Record<string, string[]>; // date -> words already dictation today
}

// ============ API 函数 ============

// 获取全部数据
export async function fetchAllData(): Promise<AppData | null> {
  const res = await apiRequest<AppData>('/data');
  return res.success ? res.data! : null;
}

// 保存全部数据
export async function saveAllData(data: AppData): Promise<boolean> {
  const res = await apiRequest('/data', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res.success;
}

// 单独保存词库
export async function saveWordBanks(wordBanks: WordBank[]): Promise<boolean> {
  const res = await apiRequest('/data/wordbanks', {
    method: 'POST',
    body: JSON.stringify(wordBanks),
  });
  return res.success;
}

// 单独保存错词本
export async function saveWrongWords(wrongWords: WrongWord[]): Promise<boolean> {
  const res = await apiRequest('/data/wrongwords', {
    method: 'POST',
    body: JSON.stringify(wrongWords),
  });
  return res.success;
}

// 单独保存每日新词记录
export async function saveDailyNewWords(dailyNewWords: Record<string, string[]>): Promise<boolean> {
  const res = await apiRequest('/data/daily-new-words', {
    method: 'POST',
    body: JSON.stringify(dailyNewWords),
  });
  return res.success;
}

// 单独保存错词本
export async function saveDictationRecords(records: DictationRecord[]): Promise<boolean> {
  const res = await apiRequest('/data/records', {
    method: 'POST',
    body: JSON.stringify(records),
  });
  return res.success;
}

// 单独保存设置
export async function saveSettings(settings: DictationSettings): Promise<boolean> {
  const res = await apiRequest('/data/settings', {
    method: 'POST',
    body: JSON.stringify(settings),
  });
  return res.success;
}

// ============ 选词逻辑 ============

// 获取今天的日期字符串
export function getTodayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// 获取今日已听写的新词（不含错词）
export function getTodayNewWords(dailyNewWords: Record<string, string[]>): string[] {
  const today = getTodayKey();
  return dailyNewWords[today] || [];
}

// 添加今日新词到记录
export function addTodayNewWord(
  dailyNewWords: Record<string, string[]>,
  word: string
): Record<string, string[]> {
  const today = getTodayKey();
  const todayWords = dailyNewWords[today] || [];
  if (!todayWords.includes(word)) {
    return {
      ...dailyNewWords,
      [today]: [...todayWords, word],
    };
  }
  return dailyNewWords;
}

// 获取可用的新词（排除今日已听写的）
export function getAvailableNewWords(
  allWords: string[],
  dailyNewWords: Record<string, string[]>
): string[] {
  const todayNewWords = getTodayNewWords(dailyNewWords);
  return allWords.filter(word => !todayNewWords.includes(word));
}

// 智能选词：错词优先，新词不重复
export function selectWordsForDictation(
  wordBanks: WordBank[],
  wrongWords: WrongWord[],
  settings: DictationSettings,
  dailyNewWords: Record<string, string[]>
): string[] {
  const allBankWords = wordBanks.flatMap(bank => bank.words);
  const uniqueBankWords = [...new Set(allBankWords)];
  
  // 可用的新词（排除今日已听写的）
  const availableNewWords = getAvailableNewWords(uniqueBankWords, dailyNewWords);
  
  // 错词列表（按错误次数排序，多的优先）
  const sortedWrongWords = [...wrongWords]
    .sort((a, b) => b.wrongCount - a.wrongCount)
    .map(w => w.word);
  
  const targetCount = settings.wordCount;
  const result: string[] = [];
  const usedWords = new Set<string>();
  
  // 如果启用错词本，先放入一些错词
  if (settings.includeWrongWords && wrongWords.length > 0) {
    const wrongWordCount = Math.min(
      Math.ceil(targetCount * 0.6), // 60% 来自错词本
      sortedWrongWords.length
    );
    
    for (let i = 0; i < wrongWordCount && result.length < targetCount; i++) {
      if (!usedWords.has(sortedWrongWords[i])) {
        result.push(sortedWrongWords[i]);
        usedWords.add(sortedWrongWords[i]);
      }
    }
  }
  
  // 剩余从新词中选（不重复今日已听写的）
  while (result.length < targetCount && availableNewWords.length > 0) {
    const randomIndex = Math.floor(Math.random() * availableNewWords.length);
    const word = availableNewWords[randomIndex];
    
    if (!usedWords.has(word)) {
      result.push(word);
      usedWords.add(word);
    }
    
    // 从可用列表中移除已选的
    availableNewWords.splice(randomIndex, 1);
  }
  
  // 如果词库不够，从今日已听写的词中补充（允许重复）
  if (result.length < targetCount && todayNewWords.length > 0) {
    const remaining = targetCount - result.length;
    const shuffled = [...todayNewWords].sort(() => Math.random() - 0.5);
    for (let i = 0; i < remaining && i < shuffled.length; i++) {
      if (!usedWords.has(shuffled[i])) {
        result.push(shuffled[i]);
        usedWords.add(shuffled[i]);
      }
    }
  }
  
  // 打乱结果顺序
  return result.sort(() => Math.random() - 0.5);
}
