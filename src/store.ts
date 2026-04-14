import { AppState, WordBank, WrongWord, DictationSettings, DictationRecord } from './types';

const STORAGE_KEY = 'dictation-master-data';

const defaultSettings: DictationSettings = {
  wordCount: 10,
  speechRate: 1.0,
  repeatCount: 2,
  intervalTime: 3,
  includeWrongWords: true,
};

const defaultState: AppState = {
  wordBanks: [],
  wrongWords: [],
  dictationRecords: [],
  settings: defaultSettings,
};

export const loadState = (): AppState => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      const parsed = JSON.parse(data);
      return {
        ...defaultState,
        ...parsed,
        settings: { ...defaultSettings, ...parsed.settings },
      };
    }
  } catch (e) {
    console.error('Failed to load state:', e);
  }
  return defaultState;
};

export const saveState = (state: AppState): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save state:', e);
  }
};

export const generateId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

export const parseWords = (text: string): string[] => {
  // 把所有换行、中英文标点、空格都替换为统一的分隔符
  // 支持：句子（按标点拆分）+ 词语（按空格拆分）
  const normalized = text
    .replace(/\r?\n/g, '\n')           // 统一换行符
    .replace(/[，。、！？；,,.!?;]+/g, '\n')  // 中英文标点 -> 换行
    .replace(/[ \t]+/g, '\n');        // 空格/制表符 -> 换行
  
  const lines = normalized.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  const words: string[] = [];
  
  for (const line of lines) {
    // 跳过明显是错误信息或 JSON 的行
    if (line.startsWith('{') || line.startsWith('[') || 
        line.includes('error_code') || line.includes('processing')) {
      continue;
    }
    
    if (line.length >= 1 && line.length <= 50) {
      words.push(line);
    }
  }
  
  // 返回去重后的词/句
  return [...new Set(words)];
};

export const createWordBank = (
  name: string,
  source: 'pdf' | 'txt' | 'paste',
  words: string[]
): WordBank => {
  return {
    id: generateId(),
    name,
    source,
    words,
    createdAt: Date.now(),
    wordCount: words.length,
  };
};

export const addWrongWord = (wrongWords: WrongWord[], word: string): WrongWord[] => {
  const existing = wrongWords.find(w => w.word === word);
  if (existing) {
    return wrongWords.map(w =>
      w.word === word
        ? { ...w, wrongCount: w.wrongCount + 1, lastWrongAt: Date.now() }
        : w
    );
  }
  return [
    ...wrongWords,
    {
      word,
      addedAt: Date.now(),
      wrongCount: 1,
      lastWrongAt: Date.now(),
    },
  ];
};

export const selectWordsForDictation = (
  wordBanks: WordBank[],
  wrongWords: WrongWord[],
  settings: DictationSettings
): string[] => {
  let result: string[] = [];
  
  // 如果包含错词，先选取错词（提高选中概率）
  if (settings.includeWrongWords && wrongWords.length > 0) {
    const wrongWordList = wrongWords.map(w => w.word);
    // 打乱错词
    const shuffledWrong = [...wrongWordList].sort(() => Math.random() - 0.5);
    // 错词重复2次，增加被选中概率
    const wrongPool = [...shuffledWrong, ...shuffledWrong];
    // 选取约一半的词来自错词本
    const wrongCount = Math.min(Math.ceil(settings.wordCount * 0.6), wrongPool.length);
    for (let i = 0; i < wrongCount; i++) {
      const idx = Math.floor(Math.random() * wrongPool.length);
      result.push(wrongPool.splice(idx, 1)[0]);
    }
  }
  
  // 从普通词库选取剩余的词
  let normalWords: string[] = [];
  wordBanks.forEach(bank => {
    normalWords = [...normalWords, ...bank.words];
  });
  
  // 去重普通词（不重复选词）
  const uniqueNormalWords = [...new Set(normalWords)].filter(w => !result.includes(w));
  const shuffledNormal = uniqueNormalWords.sort(() => Math.random() - 0.5);
  
  // 补充到目标数量
  while (result.length < settings.wordCount && shuffledNormal.length > 0) {
    result.push(shuffledNormal.pop()!);
  }
  
  // 最终打乱
  result = result.sort(() => Math.random() - 0.5);
  
  return result.slice(0, settings.wordCount);
};

export const getPinyinHint = (word: string): string => {
  // 获取每个汉字的拼音首字母
  const pinyinMap: Record<string, string> = {
    '啊': 'a', '阿': 'a', '爱': 'ai', '安': 'an', '暗': 'an',
    '把': 'b', '八': 'b', '吧': 'b', '白': 'b', '百': 'b', '办': 'b', '半': 'b', '帮': 'b', '保': 'b', '报': 'b', '北': 'b', '被': 'b', '本': 'b', '比': 'b', '笔': 'b', '必': 'b', '变': 'b', '别': 'b', '病': 'b', '不': 'b',
    '才': 'c', '参': 'c', '草': 'c', '层': 'c', '茶': 'c', '查': 'c', '产': 'c', '常': 'c', '场': 'c', '唱': 'c', '车': 'c', '城': 'c', '成': 'c', '吃': 'c', '出': 'c', '除': 'c', '楚': 'c', '传': 'c', '春': 'c', '词': 'c', '此': 'c', '从': 'c', '村': 'c', '错': 'c',
    '大': 'd', '打': 'd', '带': 'd', '代': 'd', '单': 'd', '但': 'd', '蛋': 'd', '当': 'd', '道': 'd', '到': 'd', '得': 'd', '灯': 'd', '等': 'd', '低': 'd', '底': 'd', '地': 'd', '点': 'd', '电': 'd', '掉': 'd', '定': 'd', '冬': 'd', '东': 'd', '读': 'd', '段': 'd', '对': 'd', '多': 'd',
    '饿': 'e', '儿': 'e', '耳': 'e', '二': 'e',
    '发': 'f', '法': 'f', '翻': 'f', '反': 'f', '饭': 'f', '方': 'f', '房': 'f', '放': 'f', '非': 'f', '飞': 'f', '费': 'f', '分': 'f', '风': 'f', '服': 'f', '父': 'f', '付': 'f', '复': 'f',
    '嘎': 'g', '嘎': 'g', '该': 'g', '改': 'g', '感': 'g', '干': 'g', '刚': 'g', '高': 'g', '告': 'g', '哥': 'g', '歌': 'g', '个': 'g', '给': 'g', '根': 'g', '跟': 'g', '工': 'g', '公': 'g', '共': 'g', '够': 'g', '古': 'g', '故': 'g', '瓜': 'g', '挂': 'g', '关': 'g', '管': 'g', '光': 'g', '广': 'g', '贵': 'g', '国': 'g', '果': 'g', '过': 'g',
    '还': 'h', '孩': 'h', '海': 'h', '害': 'h', '汉': 'h', '号': 'h', '好': 'h', '喝': 'h', '河': 'h', '黑': 'h', '很': 'h', '红': 'h', '后': 'h', '候': 'h', '呼': 'h', '湖': 'h', '虎': 'h', '护': 'h', '花': 'h', '化': 'h', '画': 'h', '话': 'h', '坏': 'h', '欢': 'h', '换': 'h', '黄': 'h', '回': 'h', '会': 'h', '婚': 'h', '活': 'h', '火': 'h', '伙': 'h',
    '鸡': 'j', '级': 'j', '极': 'j', '几': 'j', '己': 'j', '记': 'j', '季': 'j', '继': 'j', '济': 'j', '家': 'j', '加': 'j', '价': 'j', '假': 'j', '嫁': 'j', '尖': 'j', '简': 'j', '见': 'j', '件': 'j', '建': 'j', '江': 'j', '讲': 'j', '奖': 'j', '交': 'j', '脚': 'j', '角': 'j', '教': 'j', '叫': 'j', '街': 'j', '节': 'j', '姐': 'j', '今': 'j', '金': 'j', '近': 'j', '进': 'j', '京': 'j', '经': 'j', '精': 'j', '井': 'j', '静': 'j', '九': 'j', '酒': 'j', '久': 'j', '旧': 'j', '就': 'j', '举': 'j', '句': 'j', '剧': 'j', '觉': 'j',
    '开': 'k', '看': 'k', '考': 'k', '靠': 'k', '科': 'k', '可': 'k', '课': 'k', '刻': 'k', '客': 'k', '口': 'k', '哭': 'k', '苦': 'k', '快': 'k',
    '拉': 'l', '来': 'l', '蓝': 'l', '老': 'l', '乐': 'l', '累': 'l', '冷': 'l', '离': 'l', '里': 'l', '理': 'l', '礼': 'l', '力': 'l', '历': 'l', '立': 'l', '利': 'l', '连': 'l', '恋': 'l', '凉': 'l', '两': 'l', '亮': 'l', '量': 'l', '领': 'l', '另': 'l', '留': 'l', '流': 'l', '六': 'l', '龙': 'l', '楼': 'l', '路': 'l', '旅': 'l', '绿': 'l', '乱': 'l', '轮': 'l', '落': 'l',
    '妈': 'm', '马': 'm', '吗': 'm', '买': 'm', '卖': 'm', '满': 'm', '慢': 'm', '忙': 'm', '毛': 'm', '没': 'm', '每': 'm', '美': 'm', '妹': 'm', '门': 'm', '们': 'm', '米': 'm', '面': 'm', '民': 'm', '明': 'm', '名': 'm', '命': 'm', '母': 'm', '木': 'm', '目': 'm',
    '拿': 'n', '哪': 'n', '那': 'n', '奶': 'n', '男': 'n', '南': 'n', '难': 'n', '呢': 'n', '内': 'n', '能': 'n', '你': 'n', '年': 'n', '念': 'n', '鸟': 'n', '您': 'n', '牛': 'n', '农': 'n', '女': 'n', '暖': 'n',
    '哦': 'o', '欧': 'o',
    '怕': 'p', '拍': 'p', '排': 'p', '旁': 'p', '跑': 'p', '朋': 'p', '皮': 'p', '片': 'p', '票': 'p', '漂': 'p', '品': 'p', '平': 'p', '苹': 'p', '破': 'p', '普': 'p',
    '七': 'q', '期': 'q', '其': 'q', '奇': 'q', '骑': 'q', '起': 'q', '气': 'q', '汽': 'q', '器': 'q', '恰': 'q', '千': 'q', '前': 'q', '钱': 'q', '浅': 'q', '强': 'q', '墙': 'q', '桥': 'q', '巧': 'q', '青': 'q', '轻': 'q', '清': 'q', '晴': 'q', '情': 'q', '请': 'q', '秋': 'q', '球': 'q', '求': 'q', '区': 'q', '去': 'q', '全': 'q', '却': 'q', '群': 'q',
    '然': 'r', '让': 'r', '热': 'r', '人': 'r', '认': 'r', '日': 'r', '容': 'r', '肉': 'r', '如': 'r', '入': 'r',
    '三': 's', '色': 's', '森': 's', '山': 's', '上': 's', '少': 's', '社': 's', '身': 's', '深': 's', '什': 's', '生': 's', '声': 's', '师': 's', '十': 's', '时': 's', '实': 's', '食': 's', '始': 's', '使': 's', '世': 's', '市': 's', '事': 's', '是': 's', '室': 's', '试': 's', '视': 's', '收': 's', '手': 's', '受': 's', '书': 's', '树': 's', '双': 's', '谁': 's', '水': 's', '睡': 's', '顺': 's', '思': 's', '死': 's', '四': 's', '送': 's', '诉': 's', '速': 's', '算': 's', '虽': 's', '岁': 's',
    '他': 't', '她': 't', '它': 't', '台': 't', '太': 't', '态': 't', '谈': 't', '汤': 't', '糖': 't', '特': 't', '疼': 't', '提': 't', '题': 't', '体': 't', '天': 't', '田': 't', '条': 't', '铁': 't', '听': 't', '停': 't', '通': 't', '同': 't', '头': 't', '图': 't', '团': 't', '推': 't', '腿': 't', '外': 'w', '完': 'w', '玩': 'w', '晚': 'w', '万': 'w', '王': 'w', '往': 'w', '网': 'w', '望': 'w', '忘': 'w', '危': 'w', '为': 'w', '位': 'w', '文': 'w', '问': 'w', '我': 'w', '屋': 'w', '五': 'w', '午': 'w', '物': 'w',
    '西': 'x', '息': 'x', '希': 'x', '习': 'x', '洗': 'x', '喜': 'x', '系': 'x', '细': 'x', '下': 'x', '夏': 'x', '先': 'x', '现': 'x', '线': 'x', '想': 'x', '向': 'x', '象': 'x', '像': 'x', '小': 'x', '校': 'x', '笑': 'x', '些': 'x', '写': 'x', '谢': 'x', '新': 'x', '心': 'x', '信': 'x', '星': 'x', '行': 'x', '形': 'x', '醒': 'x', '姓': 'x', '休': 'x', '修': 'x', '需': 'x', '许': 'x', '学': 'x', '雪': 'x',
    '呀': 'y', '牙': 'y', '言': 'y', '研': 'y', '眼': 'y', '演': 'y', '阳': 'y', '养': 'y', '样': 'y', '要': 'y', '药': 'y', '爷': 'y', '也': 'y', '夜': 'y', '叶': 'y', '业': 'y', '一': 'y', '医': 'y', '衣': 'y', '以': 'y', '已': 'y', '意': 'y', '易': 'y', '因': 'y', '音': 'y', '银': 'y', '印': 'y', '英': 'y', '影': 'y', '用': 'y', '由': 'y', '油': 'y', '游': 'y', '有': 'y', '友': 'y', '右': 'y', '鱼': 'y', '雨': 'y', '语': 'y', '元': 'y', '原': 'y', '园': 'y', '远': 'y', '院': 'y', '愿': 'y', '月': 'y', '越': 'y', '云': 'y', '运': 'y',
    '在': 'z', '再': 'z', '早': 'z', '怎': 'z', '站': 'z', '张': 'z', '找': 'z', '照': 'z', '者': 'z', '这': 'z', '真': 'z', '正': 'z', '政': 'z', '知': 'z', '之': 'z', '只': 'z', '纸': 'z', '指': 'z', '至': 'z', '治': 'z', '中': 'zh', '钟': 'zh', '主': 'zh', '住': 'zh', '注': 'zh', '祝': 'zh', '准': 'zh', '字': 'z', '自': 'z', '走': 'z', '租': 'z', '足': 'z', '组': 'z', '最': 'z', '昨': 'z', '左': 'z', '作': 'z', '做': 'z', '坐': 'z', '座': 'z'
  };
  
  return word.split('').map(char => pinyinMap[char] || char).join(' ');
};

export const formatDate = (timestamp: number): string => {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};
