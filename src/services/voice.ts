// 获取所有可用语音
const getAvailableVoices = (): SpeechSynthesisVoice[] => {
  if (!window.speechSynthesis) return [];

  // Chrome 需要等待 voiceschanged 事件
  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) return voices;

  // 如果没加载好，返回默认空数组
  return [];
};

// 获取指定语言的语音，优先选择自然度高的
const getBestVoice = (lang: string): SpeechSynthesisVoice | null => {
  if (!window.speechSynthesis) return null;

  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;

  const langCode = lang.toLowerCase();

  // 按优先级排序语音：优先选择评分高、非基础款、localService 的语音
  const scored = voices
    .filter(v => v.lang.toLowerCase().startsWith(langCode))
    .map(v => {
      let score = 0;

      // 基础分：语言匹配
      score += 100;

      // localService 优先（本地语音通常更稳定自然）
      if (v.localService) score += 50;

      // 非 Google/Microsoft/预置基础款
      const name = v.name.toLowerCase();
      if (!name.includes('google') && !name.includes('microsoft') && !name.includes('default')) {
        score += 30;
      }

      // 偏好关键词：Natural, Premium, Enhanced, Neural, Studio, Enhanced
      if (/natural|enhanced|premium|neural|studio|hd|high.?quality|google.?zh/i.test(name)) {
        score += 20;
      }

      // 英文优先 Google UK/US Extended, Microsoft Zira, Ava 等
      if (langCode === 'en' && /(?:uk|us|gb).*(?:extended|premium|natural)|zira|ava|samantha|daniel|alex|taylor|kate/i.test(name)) {
        score += 40;
      }

      // 中文优先 Google 中文、Microsoft 聆韵等
      if (/zh.*(?:cn|china|google)|xiaoxiao|xiaoyi|yunyang|kangkang/i.test(name)) {
        score += 40;
      }

      return { voice: v, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0]?.voice || null;
};

// 获取所有可用语音（按语言分组）
const getVoicesByLanguage = (): Record<string, SpeechSynthesisVoice[]> => {
  if (!window.speechSynthesis) return {};

  const voices = window.speechSynthesis.getVoices();
  const grouped: Record<string, SpeechSynthesisVoice[]> = {};

  for (const v of voices) {
    const lang = v.lang;
    if (!grouped[lang]) grouped[lang] = [];
    grouped[lang].push(v);
  }

  return grouped;
};

export { getAvailableVoices, getBestVoice, getVoicesByLanguage };
