import React, { useState, useEffect, useCallback } from 'react';
import { AppState, TabType, WordBank, WrongWord, DictationSettings, DictationRecord } from './types';
import { loadState, saveState } from './store';
import { fetchAllData, saveAllData, saveWordBanks, saveWrongWords, saveDictationRecords, saveDailyNewWords, selectWordsForDictation, getTodayNewWords, addTodayNewWord } from './api';
import TabBar from './components/TabBar';
import WordBanks from './components/WordBanks';
import WrongWords from './components/WrongWords';
import Dictation from './components/Dictation';
import Settings from './components/Settings';
import History from './components/History';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(() => loadState());
  const [activeTab, setActiveTab] = useState<TabType>('wordbank');
  const [dailyNewWords, setDailyNewWords] = useState<Record<string, string[]>>({});
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // 校验并清洗词库数据
  const sanitizeWordBank = (bank: WordBank): WordBank => {
    const cleanWords = (bank.words || []).filter(word => {
      if (typeof word !== 'string') return false;
      if (word.startsWith('{') || word.startsWith('[')) return false;
      if (word.includes('error_code') || word.includes('processing')) return false;
      if (word.trim().length === 0) return false;
      return true;
    });
    return { ...bank, words: cleanWords, wordCount: cleanWords.length };
  };

  // 从服务器加载并合并数据
  const loadFromServer = useCallback(async () => {
    setIsSyncing(true);
    setSyncError(null);
    try {
      const serverData = await fetchAllData();
      if (!serverData) {
        setSyncError('无法连接到服务器');
        return;
      }

      const cleanWordBanks = (serverData.wordBanks || []).map(sanitizeWordBank);
      const serverHasData = cleanWordBanks.length > 0 ||
        (serverData.wrongWords || []).length > 0 ||
        (serverData.dictationRecords || []).length > 0;

      if (serverHasData) {
        const merged: AppState = {
          wordBanks: cleanWordBanks,
          wrongWords: serverData.wrongWords || [],
          dictationRecords: serverData.dictationRecords || [],
          settings: serverData.settings || state.settings,
        };
        setState(merged);
        saveState(merged);
      }

      setDailyNewWords(serverData.dailyNewWords || {});

      // 同步到服务器（确保本地最新数据上传）
      await saveAllData({
        ...(serverHasData ? {
          wordBanks: cleanWordBanks,
          wrongWords: serverData.wrongWords || [],
          dictationRecords: serverData.dictationRecords || [],
          settings: serverData.settings || state.settings,
        } : state),
        dailyNewWords: serverData.dailyNewWords || {},
      });
    } catch (error) {
      console.error('[Sync] Error:', error);
      setSyncError('同步失败，请检查网络连接');
    } finally {
      setIsSyncing(false);
    }
  }, [state.settings]);

  // 初始化时加载一次
  useEffect(() => {
    loadFromServer();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 同步状态到服务器
  const syncToServer = useCallback(async (newState: AppState, newDailyNewWords?: Record<string, string[]>) => {
    saveState(newState);
    try {
      await saveAllData({
        ...newState,
        dailyNewWords: newDailyNewWords || dailyNewWords,
      });
    } catch (error) {
      console.error('Failed to sync to server:', error);
    }
  }, [dailyNewWords]);

  // 状态变化时同步到服务器
  useEffect(() => {
    syncToServer(state);
  }, [state, syncToServer]);

  // 更新词库（同时保存每日新词记录）
  const updateWordBanks = useCallback((wordBanks: WordBank[]) => {
    setState(prev => {
      const newState = { ...prev, wordBanks };
      saveState(newState);
      saveWordBanks(wordBanks);
      return newState;
    });
  }, []);

  // 更新错词本
  const updateWrongWords = useCallback((wrongWords: WrongWord[]) => {
    setState(prev => {
      const newState = { ...prev, wrongWords };
      saveState(newState);
      saveWrongWords(wrongWords);
      return newState;
    });
  }, []);

  // 更新设置
  const updateSettings = useCallback((settings: DictationSettings) => {
    setState(prev => {
      const newState = { ...prev, settings };
      saveState(newState);
      return newState;
    });
  }, []);

  // 添加听写记录
  const addDictationRecord = useCallback((record: DictationRecord) => {
    setState(prev => {
      const newState = {
        ...prev,
        dictationRecords: [record, ...prev.dictationRecords].slice(0, 50)
      };
      saveState(newState);
      saveDictationRecords(newState.dictationRecords);
      return newState;
    });
  }, []);

  // 获取今日已听写的新词
  const getTodayDictatedNewWords = useCallback(() => {
    return getTodayNewWords(dailyNewWords);
  }, [dailyNewWords]);

  // 记录今日听写的新词
  const recordTodayNewWord = useCallback((word: string) => {
    const newDailyNewWords = addTodayNewWord(dailyNewWords, word);
    setDailyNewWords(newDailyNewWords);
    saveDailyNewWords(newDailyNewWords);
  }, [dailyNewWords]);

  // 记录今日听写的所有新词
  const recordTodayNewWords = useCallback((words: string[]) => {
    let newDailyNewWords = { ...dailyNewWords };
    words.forEach(word => {
      newDailyNewWords = addTodayNewWord(newDailyNewWords, word);
    });
    setDailyNewWords(newDailyNewWords);
    saveDailyNewWords(newDailyNewWords);
  }, [dailyNewWords]);

  // 删除记录
  const deleteRecord = useCallback((id: string) => {
    setState(prev => {
      const newState = {
        ...prev,
        dictationRecords: prev.dictationRecords.filter(r => r.id !== id)
      };
      saveState(newState);
      return newState;
    });
  }, []);

  // 清空历史
  const clearHistory = useCallback(() => {
    setState(prev => ({
      ...prev,
      dictationRecords: []
    }));
  }, []);

  // 清空所有数据
  const clearAllData = useCallback(() => {
    setState(prev => ({
      ...prev,
      wordBanks: [],
      wrongWords: [],
      dictationRecords: []
    }));
    setDailyNewWords({});
  }, []);

  const getTotalWordCount = useCallback(() => {
    return state.wordBanks.reduce((sum, bank) => sum + bank.wordCount, 0);
  }, [state.wordBanks]);

  // 获取今日统计
  const getTodayStats = useCallback(() => {
    const todayWords = getTodayNewWords(dailyNewWords);
    return {
      newWordsCount: todayWords.length,
      totalBankWords: state.wordBanks.reduce((sum, bank) => sum + bank.wordCount, 0),
    };
  }, [dailyNewWords, state.wordBanks]);

  const renderContent = () => {
    switch (activeTab) {
      case 'wordbank':
        return (
          <WordBanks
            wordBanks={state.wordBanks}
            onUpdateWordBanks={updateWordBanks}
            onSync={loadFromServer}
            isSyncing={isSyncing}
          />
        );
      case 'wrongwords':
        return (
          <WrongWords
            wrongWords={state.wrongWords}
            onUpdateWrongWords={updateWrongWords}
          />
        );
      case 'dictation':
        return (
          <Dictation
            wordBanks={state.wordBanks}
            wrongWords={state.wrongWords}
            settings={state.settings}
            onAddWrongWord={(word) => {
              setState(prev => {
                const existing = prev.wrongWords.find(w => w.word === word);
                if (existing) {
                  return {
                    ...prev,
                    wrongWords: prev.wrongWords.map(w =>
                      w.word === word ? { ...w, wrongCount: w.wrongCount + 1, lastWrongAt: Date.now() } : w
                    )
                  };
                }
                return {
                  ...prev,
                  wrongWords: [...prev.wrongWords, { word, addedAt: Date.now(), wrongCount: 1, lastWrongAt: Date.now() }]
                };
              });
            }}
            onAddRecord={(record) => {
              addDictationRecord(record);
              // 记录今日听写的所有新词（来自词库的，不含原本就在错词本里的词）
              const wrongWordSet = new Set(state.wrongWords.map(w => w.word));
              const newWords = record.words.filter(w => !wrongWordSet.has(w));
              recordTodayNewWords(newWords);
            }}
            totalWordCount={getTotalWordCount()}
            dailyNewWords={dailyNewWords}
            onRecordWord={recordTodayNewWord}
          />
        );
      case 'settings':
        return (
          <Settings
            settings={state.settings}
            onUpdateSettings={updateSettings}
            onClearAllData={clearAllData}
            wordBankCount={state.wordBanks.length}
            wrongWordCount={state.wrongWords.length}
            recordCount={state.dictationRecords.length}
          />
        );
      case 'history':
        return (
          <History
            records={state.dictationRecords}
            onDeleteRecord={deleteRecord}
            onClearAll={clearHistory}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex-shrink-0">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold text-primary flex items-center gap-2">
            <span className="text-2xl">📝</span>
            听写大师
            {isSyncing && <span className="text-xs text-slate-400 animate-pulse">同步中...</span>}
          </h1>
          <div className="text-sm text-slate-500">
            词库 {state.wordBanks.length} 个 · 错词 {state.wrongWords.length} 个 · 今日新词 {getTodayStats().newWordsCount} 个
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        <div className="h-full max-w-5xl mx-auto">
          {renderContent()}
        </div>
      </main>

      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
};

export default App;
