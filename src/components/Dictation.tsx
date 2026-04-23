import React, { useState, useRef, useEffect, useCallback } from 'react';
import { WordBank, WrongWord, DictationSettings, DictationRecord } from '../types';
import { generateId } from '../store';
import { selectWordsForDictation, getTodayNewWords } from '../api';
import { gradeAnswers, performOCR, OCRResult } from '../services/ocr';

interface DictationProps {
  wordBanks: WordBank[];
  wrongWords: WrongWord[];
  settings: DictationSettings;
  onAddWrongWord: (word: string) => void;
  onAddRecord: (record: DictationRecord) => void;
  totalWordCount: number;
  dailyNewWords: Record<string, string[]>;
  onRecordWord: (word: string) => void;
}

// ============ 全局语音控制器 ============
// 所有定时器和语音队列都通过这里管理，确保 stop() 能彻底停止一切
const speechController = {
  // 唯一的 pending setTimeout ID（只保留一个）
  timerId: null as ReturnType<typeof setTimeout> | null,
  shouldStop: false,

  stop() {
    this.shouldStop = true;
    // 清除待执行的定时器
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    // 清空语音队列
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      // 不调用 pause()，否则引擎进入暂停状态，下次播放会失败
      // 如需恢复，用 resume() 即可
    }
  },

  reset() {
    this.shouldStop = false;
    this.timerId = null;
    // 确保语音引擎处于可播放状态
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel(); // 清空残留队列
      window.speechSynthesis.resume(); // 退出可能的暂停状态
    }
  },

  // 延迟执行，返回是否被 stop 了
  delay(fn: () => void, ms: number): boolean {
    this.timerId = setTimeout(() => {
      this.timerId = null;
      if (this.shouldStop) return;
      fn();
    }, ms) as ReturnType<typeof setTimeout>;
    return this.shouldStop;
  },
};

// 判断词语是中文还是英文
const isEnglishWord = (word: string): boolean => {
  return /^[a-zA-Z]/.test(word.trim());
};

// 将中英混排词拆成 [英文部分, 中文部分]
// 例：「a coral reef（珊瑚礁）」→ ['a coral reef', '珊瑚礁']
//     「a coral reef(coral reef)」→ ['a coral reef', 'coral reef']（括号内英文只读一次，略过）
//     「珊瑚礁」→ ['珊瑚礁']
const splitBilingual = (word: string): string[] => {
  // 匹配括号（中英文括号均支持）
  const bracketMatch = word.match(/^(.*?)[\(（]([^\)）]+)[\)）]\s*$/);
  if (bracketMatch) {
    const before = bracketMatch[1].trim();   // 括号前的部分
    const inside = bracketMatch[2].trim();   // 括号内的部分
    const parts: string[] = [];
    if (before.length > 0) parts.push(before);
    // 括号内有汉字才加入朗读（纯英文注释不重复读）
    if (/[\u4e00-\u9fff]/.test(inside) && inside.length > 0) {
      parts.push(inside);
    }
    if (parts.length > 0) return parts;
  }
  return [word];
};

// 为词语选择最优语音
const pickBestVoice = (word: string, voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null => {
  const langCode = isEnglishWord(word) ? 'en' : 'zh';
  const scored = voices
    .filter(v => v.lang.toLowerCase().startsWith(langCode))
    .map(v => {
      let score = 0;
      if (v.localService) score += 50;
      const name = v.name.toLowerCase();
      if (!name.includes('google') && !name.includes('microsoft')) score += 30;
      if (langCode === 'en' && /(?:uk|us|gb).*|zira|ava|samantha/i.test(name)) score += 40;
      if (/xiaoxiao|xiaoyi|yunyang|kangkang/i.test(name)) score += 40;
      return { voice: v, score };
    })
    .sort((a, b) => b.score - a.score);
  return scored[0]?.voice || null;
}

const Dictation: React.FC<DictationProps> = ({
  wordBanks,
  wrongWords,
  settings,
  onAddWrongWord,
  onAddRecord,
  totalWordCount,
  dailyNewWords,
  onRecordWord,
}) => {
  const [dictationState, setDictationState] = useState<'setup' | 'ready' | 'dictating' | 'complete' | 'upload' | 'grading' | 'manual' | 'result'>('setup');
  const [words, setWords] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [localSettings, setLocalSettings] = useState(settings);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [gradingResults, setGradingResults] = useState<{ word: string; correct: boolean; recognized?: string }[]>([]);
  const [isGrading, setIsGrading] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isSpeakingRef = useRef(false);

  useEffect(() => {
    return () => {
      speechController.stop();
    };
  }, []);

  // 播放词语 - 支持中英混排（先读英文，再读中文翻译）
  const speakWord = useCallback((word: string, repeatCount: number, rate: number): Promise<void> => {
    return new Promise((resolve) => {
      if (!window.speechSynthesis) {
        resolve();
        return;
      }

      // 将词条拆成若干段（中英混排时拆开）
      const parts = splitBilingual(word);

      // 依次朗读每个 part，每个 part 重复 repeatCount 次
      let partIndex = 0;

      const speakPart = () => {
        if (speechController.shouldStop || partIndex >= parts.length) {
          isSpeakingRef.current = false;
          resolve();
          return;
        }

        const currentPart = parts[partIndex];
        let repeatIndex = 0;

        const speak = () => {
          if (speechController.shouldStop) {
            isSpeakingRef.current = false;
            resolve();
            return;
          }
          if (repeatIndex >= repeatCount) {
            // 当前 part 朗读完毕，切换到下一 part（部分之间停顿 500ms）
            partIndex++;
            speechController.delay(speakPart, 500);
            return;
          }

          const utterance = new SpeechSynthesisUtterance(currentPart);
          utterance.lang = isEnglishWord(currentPart) ? 'en-US' : 'zh-CN';
          utterance.rate = rate;
          utterance.pitch = 1;

          // 选择最优语音
          if (window.speechSynthesis) {
            const voices = window.speechSynthesis.getVoices();
            if (voices.length > 0) {
              if (settings.voiceUri) {
                const selected = voices.find(v => v.voiceURI === settings.voiceUri);
                if (selected) {
                  utterance.voice = selected;
                } else {
                  const best = pickBestVoice(currentPart, voices);
                  if (best) utterance.voice = best;
                }
              } else {
                const best = pickBestVoice(currentPart, voices);
                if (best) utterance.voice = best;
              }
            }
          }

          utterance.onend = () => {
            repeatIndex++;
            if (speechController.shouldStop) {
              isSpeakingRef.current = false;
              resolve();
            } else if (repeatIndex < repeatCount) {
              speechController.delay(speak, 500);
            } else {
              partIndex++;
              speechController.delay(speakPart, 500);
            }
          };

          utterance.onerror = () => {
            repeatIndex++;
            if (speechController.shouldStop) {
              isSpeakingRef.current = false;
              resolve();
            } else if (repeatIndex < repeatCount) {
              speechController.delay(speak, 500);
            } else {
              partIndex++;
              speechController.delay(speakPart, 500);
            }
          };

          isSpeakingRef.current = true;
          window.speechSynthesis.speak(utterance);
        };

        speak();
      };

      speakPart();
    });
  }, [settings.voiceUri]);

  // 开始听写
  const handleStartDictation = useCallback(async () => {
    if (totalWordCount === 0 && wrongWords.length === 0) {
      alert('请先导入词库或添加错词');
      return;
    }

    // 使用新的选词逻辑：错词优先，新词不重复
    const selectedWords = selectWordsForDictation(wordBanks, wrongWords, localSettings, dailyNewWords);
    if (selectedWords.length === 0) {
      alert('没有可选的词语');
      return;
    }

    setWords(selectedWords);
    setCurrentIndex(0);
    setGradingResults([]);
    setDictationState('ready');
  }, [wordBanks, wrongWords, localSettings, totalWordCount, wrongWords.length, dailyNewWords]);

  // 实际开始听写
  const startActualDictation = useCallback(async () => {
    speechController.reset(); // 重置控制器
    setDictationState('dictating');

    for (let i = 0; i < words.length; i++) {
      // 每次循环开始前检查是否已停止
      if (speechController.shouldStop) {
        return;
      }
      setCurrentIndex(i);

      // 朗读当前词语
      await speakWord(words[i], localSettings.repeatCount, localSettings.speechRate);

      // 检查是否在朗读期间被停止
      if (speechController.shouldStop) {
        return;
      }

      // 等待间隔
      if (localSettings.intervalTime > 0) {
        await new Promise(resolve => {
          const id = setTimeout(resolve, localSettings.intervalTime * 1000);
          // 如果在此期间被停止，也清除这个定时器
          const checkStop = setInterval(() => {
            if (speechController.shouldStop) {
              clearTimeout(id);
              clearInterval(checkStop);
              resolve(null);
            }
          }, 100);
        });
      }

      // 检查是否在间隔期间被停止
      if (speechController.shouldStop) {
        return;
      }
    }

    // 听写完成，进入拍照上传阶段
    setDictationState('complete');
  }, [words, localSettings, speakWord]);

  // 处理图片上传
  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setUploadedImage(event.target?.result as string);
        setDictationState('upload');
      };
      reader.readAsDataURL(file);
    }
  }, []);

  // 触发文件选择
  const triggerFileInput = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.removeAttribute('capture');
      fileInputRef.current.click();
    }
  }, []);

  // 拍照上传
  const handleCameraCapture = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.setAttribute('capture', 'environment');
      fileInputRef.current.click();
    }
  }, []);

  // OCR自动批改
  const handleAutoGrade = useCallback(async () => {
    if (!uploadedImage) return;

    setIsGrading(true);
    setDictationState('grading');
    setOcrError(null);

    try {
      // 调用OCR识别
      const ocrResult: OCRResult = await performOCR(uploadedImage, 'mock');

      if (!ocrResult.success) {
        setOcrError(ocrResult.error || 'OCR识别失败');
        setDictationState('upload');
        setIsGrading(false);
        return;
      }

      // 批改答案
      const results = gradeAnswers(words, ocrResult.words);
      setGradingResults(results);

      // 保存错词
      results.forEach(r => {
        if (!r.correct) {
          onAddWrongWord(r.word);
        }
      });

      // 保存记录
      const record: DictationRecord = {
        id: generateId(),
        words: words,
        results: results.map(r => ({ word: r.word, correct: r.correct })),
        settings: localSettings,
        completedAt: Date.now(),
      };
      onAddRecord(record);

      setDictationState('result');
    } catch (error) {
      setOcrError(error instanceof Error ? error.message : '批改失败');
      setDictationState('upload');
    } finally {
      setIsGrading(false);
    }
  }, [uploadedImage, words, localSettings, onAddWrongWord, onAddRecord]);

  // 进入手动批改模式
  const handleManualGrade = useCallback(() => {
    // 初始化所有词语为未批改状态
    const initialResults = words.map(word => ({ word, correct: false as boolean }));
    setGradingResults(initialResults);
    setDictationState('manual');
  }, [words]);

  // 手动标记对错
  const toggleWordCorrect = useCallback((index: number) => {
    setGradingResults(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], correct: !updated[index].correct };
      return updated;
    });
  }, []);

  // 完成手动批改
  const finishManualGrade = useCallback(() => {
    // 保存错词
    gradingResults.forEach(r => {
      if (!r.correct) {
        onAddWrongWord(r.word);
      }
    });

    // 保存记录
    const record: DictationRecord = {
      id: generateId(),
      words: words,
      results: gradingResults.map(r => ({ word: r.word, correct: r.correct })),
      settings: localSettings,
      completedAt: Date.now(),
    };
    onAddRecord(record);

    setDictationState('result');
  }, [gradingResults, words, localSettings, onAddWrongWord, onAddRecord]);

  // 停止听写
  const handleStop = useCallback(() => {
    // 通过全局控制器彻底停止所有语音和定时器
    speechController.stop();

    // 清空状态
    setWords([]);
    setCurrentIndex(0);
    setGradingResults([]);
    setUploadedImage(null);
    setOcrError(null);

    // 立即切回设置界面
    setDictationState('setup');
  }, []);

  // 返回设置页面
  const handleBackToSetup = useCallback(() => {
    setDictationState('setup');
    setWords([]);
    setCurrentIndex(0);
    setGradingResults([]);
    setUploadedImage(null);
    setOcrError(null);
  }, []);

  const correctCount = gradingResults.filter(r => r.correct).length;
  const wrongCount = gradingResults.filter(r => !r.correct).length;

  // ============ 设置页面 ============
  if (dictationState === 'setup') {
    const availableWords = totalWordCount + wrongWords.length;
    const todayNewWords = getTodayNewWords(dailyNewWords);

    return (
      <div className="h-full flex flex-col bg-white overflow-y-auto">
        <div className="max-w-xl mx-auto w-full flex flex-col px-6 py-6">
          <div className="text-center mt-4 mb-8">
            <div className="text-6xl mb-4">🎧</div>
            <h2 className="text-2xl font-bold text-slate-800">开始听写</h2>
            <p className="text-slate-500 mt-2">
              共 {availableWords} 个可用词语 | 支持中英文
            </p>
            {todayNewWords.length > 0 && (
              <p className="text-amber-600 text-sm mt-1">
                今日已听写 {todayNewWords.length} 个新词，剩余 {Math.max(0, totalWordCount - todayNewWords.length)} 个新词可听写
              </p>
            )}
          </div>

          <div className="bg-slate-50 rounded-2xl p-6 space-y-6">
            <h3 className="font-semibold text-slate-700">听写设置</h3>

            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-600">听写词数</span>
                  <span className="font-medium text-primary">{localSettings.wordCount} 个</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max={Math.min(50, availableWords || 50)}
                  value={localSettings.wordCount}
                  onChange={(e) => setLocalSettings(s => ({ ...s, wordCount: parseInt(e.target.value) }))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary"
                />
              </div>

              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-600">朗读速度</span>
                  <span className="font-medium text-primary">{localSettings.speechRate.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="2"
                  step="0.1"
                  value={localSettings.speechRate}
                  onChange={(e) => setLocalSettings(s => ({ ...s, speechRate: parseFloat(e.target.value) }))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary"
                />
              </div>

              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-600">重复朗读</span>
                  <span className="font-medium text-primary">{localSettings.repeatCount} 次</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="5"
                  value={localSettings.repeatCount}
                  onChange={(e) => setLocalSettings(s => ({ ...s, repeatCount: parseInt(e.target.value) }))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary"
                />
              </div>

              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-600">答题间隔</span>
                  <span className="font-medium text-primary">{localSettings.intervalTime} 秒</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="10"
                  value={localSettings.intervalTime}
                  onChange={(e) => setLocalSettings(s => ({ ...s, intervalTime: parseInt(e.target.value) }))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary"
                />
              </div>

              <div className="flex items-center justify-between py-2">
                <span className="text-slate-600">包含错词</span>
                <button
                  onClick={() => setLocalSettings(s => ({ ...s, includeWrongWords: !s.includeWrongWords }))}
                  className={`w-12 h-7 rounded-full transition-colors ${
                    localSettings.includeWrongWords ? 'bg-primary' : 'bg-slate-300'
                  }`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      localSettings.includeWrongWords ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          <div className="mt-6 mb-6 flex gap-3">
            {availableWords === 0 ? (
              <button
                disabled
                className="flex-1 py-4 bg-slate-200 text-slate-400 rounded-xl font-semibold cursor-not-allowed"
              >
                请先导入词库
              </button>
            ) : (
              <button
                onClick={handleStartDictation}
                className="flex-1 py-4 bg-primary text-white rounded-xl font-semibold btn-touch hover:bg-primaryDark transition-colors text-lg"
              >
                🎯 开始听写
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ============ 准备阶段 ============
  if (dictationState === 'ready') {
    return (
      <div className="h-full flex flex-col bg-white p-6">
        <div className="max-w-xl mx-auto w-full flex-1 flex flex-col justify-center">
          <div className="text-center mb-8">
            <div className="text-6xl mb-4 animate-pulse-slow">📝</div>
            <h2 className="text-2xl font-bold text-slate-800">准备开始</h2>
            <p className="text-slate-500 mt-2">
              共 {words.length} 个词语，准备好了吗？
            </p>
            <p className="text-slate-400 text-sm mt-1">
              听写时只播放语音，请在纸上书写
            </p>
          </div>

          <div className="bg-slate-50 rounded-2xl p-6 mb-6">
            <div className="text-sm text-slate-500 space-y-2">
              <div className="flex justify-between">
                <span>听写词数</span>
                <span className="font-medium">{localSettings.wordCount} 个</span>
              </div>
              <div className="flex justify-between">
                <span>朗读速度</span>
                <span className="font-medium">{localSettings.speechRate.toFixed(1)}x</span>
              </div>
              <div className="flex justify-between">
                <span>重复次数</span>
                <span className="font-medium">{localSettings.repeatCount} 次</span>
              </div>
              <div className="flex justify-between">
                <span>答题间隔</span>
                <span className="font-medium">{localSettings.intervalTime} 秒</span>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleStop}
              className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-xl font-semibold btn-touch hover:bg-slate-200 transition-colors"
            >
              取消
            </button>
            <button
              onClick={startActualDictation}
              className="flex-1 py-4 bg-primary text-white rounded-xl font-semibold btn-touch hover:bg-primaryDark transition-colors text-lg"
            >
              开始 🎤
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============ 听写中 ============
  if (dictationState === 'dictating') {
    const progress = ((currentIndex + 1) / words.length) * 100;
    const currentWord = words[currentIndex];
    const isEnglish = isEnglishWord(currentWord);

    return (
      <div className="h-full flex flex-col bg-white">
        {/* 进度条 */}
        <div className="h-2 bg-slate-100">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex-1 flex flex-col justify-center p-6 max-w-xl mx-auto w-full">
          {/* 当前进度 */}
          <div className="text-center mb-8">
            <div className="text-sm text-slate-500">
              第 {currentIndex + 1} / {words.length} 题
            </div>
            <div className="text-xs text-slate-400 mt-1">
              {isEnglish ? '🌐 英文' : '📝 中文'}
            </div>
          </div>

          {/* 朗读中提示 */}
          <div className="bg-slate-50 rounded-2xl p-12 text-center mb-8">
            <div className="text-6xl mb-4 animate-pulse-slow">🔊</div>
            <p className="text-slate-500 text-lg">请在纸上书写</p>
          </div>

          {/* 跳过按钮 */}
          <button
            onClick={() => {
              if (window.speechSynthesis) {
                window.speechSynthesis.cancel();
              }
            }}
            className="w-full py-3 bg-slate-100 text-slate-600 rounded-xl font-medium btn-touch hover:bg-slate-200 transition-colors"
          >
            跳过当前词 →
          </button>

          <button
            onClick={handleStop}
            className="mt-6 text-slate-400 hover:text-slate-600 text-sm text-center"
          >
            结束听写
          </button>
        </div>
      </div>
    );
  }

  // ============ 听写完成，等待拍照 ============
  if (dictationState === 'complete') {
    return (
      <div className="h-full flex flex-col bg-white p-6">
        <div className="max-w-xl mx-auto w-full flex-1 flex flex-col justify-center">
          <div className="text-center mb-8">
            <div className="text-6xl mb-4">✅</div>
            <h2 className="text-2xl font-bold text-slate-800">听写完成！</h2>
            <p className="text-slate-500 mt-2">
              共朗读 {words.length} 个词语
            </p>
            <p className="text-slate-400 text-sm mt-1">
              请拍下你的答题纸上传批改
            </p>
          </div>

          {/* 预览听写词列表（可折叠） */}
          <details className="bg-slate-50 rounded-2xl p-4 mb-6">
            <summary className="font-semibold text-slate-700 cursor-pointer">
              👀 查看听写词列表（参考答案）
            </summary>
            <div className="mt-3 flex flex-wrap gap-2">
              {words.map((word, index) => (
                <span
                  key={index}
                  className="px-3 py-1 bg-white rounded-full text-sm text-slate-600 border border-slate-200"
                >
                  {word}
                </span>
              ))}
            </div>
          </details>

          {/* 隐藏的文件输入 */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleImageUpload}
            className="hidden"
          />

          <div className="space-y-3">
            <button
              onClick={handleCameraCapture}
              className="w-full py-4 bg-primary text-white rounded-xl font-semibold btn-touch hover:bg-primaryDark transition-colors text-lg"
            >
              📷 拍照上传
            </button>
            <button
              onClick={triggerFileInput}
              className="w-full py-4 bg-slate-100 text-slate-600 rounded-xl font-semibold btn-touch hover:bg-slate-200 transition-colors"
            >
              📁 从相册选择
            </button>
            <button
              onClick={handleManualGrade}
              className="w-full py-4 bg-amber-100 text-amber-700 rounded-xl font-semibold btn-touch hover:bg-amber-200 transition-colors"
            >
              ✍️ 手动批改（自己对照答案）
            </button>
            <button
              onClick={handleStop}
              className="w-full py-3 text-slate-400 hover:text-slate-600 text-sm"
            >
              取消
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============ 图片预览 ============
  if (dictationState === 'upload' && uploadedImage) {
    return (
      <div className="h-full flex flex-col bg-white overflow-y-auto">
        <div className="max-w-xl mx-auto w-full p-6 flex flex-col min-h-full">
          <div className="text-center mb-4">
            <h2 className="text-xl font-bold text-slate-800">确认答题纸照片</h2>
            <p className="text-slate-500 text-sm mt-1">
              请确保照片清晰，字迹可辨
            </p>
          </div>

          {/* 图片预览 - 限制最大高度 */}
          <div className="bg-slate-100 rounded-2xl overflow-hidden mb-4 max-h-80 flex items-center justify-center">
            <img
              src={uploadedImage}
              alt="答题纸"
              className="max-w-full max-h-80 object-contain"
            />
          </div>

          {ocrError && (
            <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm mb-4">
              {ocrError}
            </div>
          )}

          <div className="space-y-3 mt-auto">
            <button
              onClick={handleAutoGrade}
              disabled={isGrading}
              className="w-full py-4 bg-primary text-white rounded-xl font-semibold btn-touch hover:bg-primaryDark transition-colors text-lg disabled:opacity-50"
            >
              {isGrading ? '🔍 批改中...' : '🔍 AI自动批改'}
            </button>
            <button
              onClick={handleManualGrade}
              className="w-full py-3 bg-amber-100 text-amber-700 rounded-xl font-semibold btn-touch hover:bg-amber-200 transition-colors"
            >
              ✍️ 切换为手动批改
            </button>
            <button
              onClick={() => setUploadedImage(null)}
              className="w-full py-3 bg-slate-100 text-slate-600 rounded-xl font-medium btn-touch hover:bg-slate-200 transition-colors"
            >
              重新拍照
            </button>
            <button
              onClick={handleStop}
              className="w-full py-3 text-slate-400 hover:text-slate-600 text-sm"
            >
              取消
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============ 手动批改 ============
  if (dictationState === 'manual') {
    const markedCount = gradingResults.filter(r => r.correct || r.correct === false).length;
    const allMarked = markedCount === words.length;

    return (
      <div className="h-full flex flex-col bg-white overflow-y-auto">
        <div className="p-6 max-w-xl mx-auto w-full">
          <div className="text-center mb-4">
            <h2 className="text-xl font-bold text-slate-800">手动批改</h2>
            <p className="text-slate-500 text-sm mt-1">
              点击每个词语标记对错 ({markedCount}/{words.length})
            </p>
          </div>

          {/* 词列表 */}
          <div className="bg-slate-50 rounded-2xl p-4 mb-6 max-h-96 overflow-y-auto">
            <div className="space-y-2">
              {gradingResults.map((result, index) => (
                <button
                  key={index}
                  onClick={() => toggleWordCorrect(index)}
                  className={`w-full flex items-center justify-between py-3 px-4 rounded-xl transition-colors btn-touch ${
                    result.correct
                      ? 'bg-green-100 border-2 border-green-400'
                      : 'bg-white border-2 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <span className={result.correct ? 'text-green-600 text-xl' : 'text-slate-400 text-xl'}>
                    {result.correct ? '✓' : '○'}
                  </span>
                  <span className="flex-1 text-center font-medium text-lg text-slate-800">
                    {result.word}
                  </span>
                  <span className={`text-xs ${result.correct ? 'text-green-600' : 'text-slate-400'}`}>
                    {result.correct ? '正确' : '点击标记'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={finishManualGrade}
              disabled={!allMarked}
              className="w-full py-4 bg-primary text-white rounded-xl font-semibold btn-touch hover:bg-primaryDark transition-colors text-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {allMarked ? '完成批改' : `请标记所有词语 (${markedCount}/${words.length})`}
            </button>
            <button
              onClick={() => setDictationState('complete')}
              className="w-full py-3 text-slate-400 hover:text-slate-600 text-sm"
            >
              返回
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============ 批改中 ============
  if (dictationState === 'grading') {
    return (
      <div className="h-full flex flex-col bg-white p-6">
        <div className="max-w-xl mx-auto w-full flex-1 flex flex-col justify-center">
          <div className="text-center">
            <div className="text-6xl mb-6 animate-pulse-slow">🔍</div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">AI 批改中...</h2>
            <p className="text-slate-500">正在识别并批改你的答案</p>

            {/* 加载动画 */}
            <div className="mt-8 flex justify-center gap-2">
              <div className="w-3 h-3 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-3 h-3 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-3 h-3 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============ 结果页面 ============
  if (dictationState === 'result') {
    const accuracy = words.length > 0 ? Math.round((correctCount / words.length) * 100) : 0;

    return (
      <div className="h-full flex flex-col bg-white overflow-y-auto">
        <div className="p-6 max-w-xl mx-auto w-full">
          <div className="text-center mb-6">
            <div className={`text-6xl mb-4`}>
              {accuracy >= 90 ? '🎉' : accuracy >= 70 ? '👍' : '💪'}
            </div>
            <h2 className="text-2xl font-bold text-slate-800">
              {accuracy >= 90 ? '太棒了！' : accuracy >= 70 ? '还不错！' : '继续加油！'}
            </h2>
            <p className="text-slate-500 mt-2">
              正确率 {accuracy}% ({correctCount}/{words.length})
            </p>
          </div>

          {/* 统计卡片 */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-green-50 rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-green-600">{correctCount}</div>
              <div className="text-sm text-green-600">正确 ✓</div>
            </div>
            <div className="bg-red-50 rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-red-600">{wrongCount}</div>
              <div className="text-sm text-red-600">错误 ✗</div>
            </div>
          </div>

          {/* 结果列表 */}
          <div className="bg-slate-50 rounded-2xl p-4 mb-6 max-h-80 overflow-y-auto">
            <h3 className="font-semibold text-slate-700 mb-3">批改详情</h3>
            <div className="space-y-2">
              {gradingResults.map((result, index) => (
                <div
                  key={index}
                  className={`flex items-center justify-between py-3 px-4 rounded-xl ${
                    result.correct ? 'bg-green-100/50' : 'bg-red-100/50'
                  }`}
                >
                  <span className={result.correct ? 'text-green-600 text-xl' : 'text-red-600 text-xl'}>
                    {result.correct ? '✓' : '✗'}
                  </span>
                  <span className="flex-1 text-center font-medium text-lg text-slate-800">
                    {result.word}
                  </span>
                  {!result.correct && (
                    <span className="text-xs text-red-500">已加入错词本</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="space-y-3">
            <button
              onClick={handleBackToSetup}
              className="w-full py-4 bg-primary text-white rounded-xl font-semibold btn-touch hover:bg-primaryDark transition-colors text-lg"
            >
              再来一次
            </button>
            <button
              onClick={() => {
                setDictationState('setup');
                setWords([]);
              }}
              className="w-full py-3 text-slate-500 hover:text-slate-700 text-sm"
            >
              返回主页
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default Dictation;
