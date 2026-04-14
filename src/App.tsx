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
  const [lastSync, setLastSync] = useState<number>(0);

  // 从服务器加载数据
  const loadFromServer = useCallback(async () => {
    setIsSyncing(true);
    try {
      const serverData = await fetchAllData();
      if (serverData) {
        // 合并服务器数据
        setState(prev => {
          const merged: AppState = {
            wordBanks: serverData.wordBanks?.length > 0 ? serverData.wordBanks : prev.wordBanks,
            wrongWords: serverData.wrongWords || prev.wrongWords,
            dictationRecords: serverData.dictationRecords || prev.dictationRecords,
            settings: serverData.settings || prev.settings,
          };
          // 保存到本地
          saveState(merged);
          return merged;
        });
        setDailyNewWords(serverData.dailyNewWords || {});
        setLastSync(Date.now());
      }
    } catch (error) {
      console.error('Failed to load from server:', error);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  // 初始化时从服务器加载
  useEffect(() => {
    loadFromServer();
  }, [loadFromServer]);

  // 保存到本地和服务器
  const syncToServer = useCallback(async (newState: AppState, newDailyNewWords?: Record<string, string[]>) => {
    // 先保存到本地
    saveState(newState);

    // 保存到服务器
    try {
      await saveAllData({
        ...newState,
        dailyNewWords: newDailyNewWords || dailyNewWords,
      });
    } catch (error) {
      console.error('Failed to sync to server:', error);
    }
  }, [dailyNewWords]);

  // 当状态变化时同步
  useEffect(() => {
    if (lastSync > 0) {
      syncToServer(state);
    }
  }, [state, syncToServer, lastSync]);

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
