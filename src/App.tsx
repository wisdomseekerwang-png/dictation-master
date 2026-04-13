import React, { useState, useEffect, useCallback } from 'react';
import { AppState, TabType, WordBank, WrongWord, DictationSettings, DictationRecord } from './types';
import { loadState, saveState } from './store';
import TabBar from './components/TabBar';
import WordBanks from './components/WordBanks';
import WrongWords from './components/WrongWords';
import Dictation from './components/Dictation';
import Settings from './components/Settings';
import History from './components/History';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(() => loadState());
  const [activeTab, setActiveTab] = useState<TabType>('wordbank');

  useEffect(() => {
    saveState(state);
  }, [state]);

  const updateWordBanks = useCallback((wordBanks: WordBank[]) => {
    setState(prev => ({ ...prev, wordBanks }));
  }, []);

  const updateWrongWords = useCallback((wrongWords: WrongWord[]) => {
    setState(prev => ({ ...prev, wrongWords }));
  }, []);

  const updateSettings = useCallback((settings: DictationSettings) => {
    setState(prev => ({ ...prev, settings }));
  }, []);

  const addDictationRecord = useCallback((record: DictationRecord) => {
    setState(prev => ({
      ...prev,
      dictationRecords: [record, ...prev.dictationRecords].slice(0, 50)
    }));
  }, []);

  const deleteRecord = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      dictationRecords: prev.dictationRecords.filter(r => r.id !== id)
    }));
  }, []);

  const clearHistory = useCallback(() => {
    setState(prev => ({
      ...prev,
      dictationRecords: []
    }));
  }, []);

  const clearAllData = useCallback(() => {
    setState(prev => ({
      ...prev,
      wordBanks: [],
      wrongWords: [],
      dictationRecords: []
    }));
  }, []);

  const getTotalWordCount = useCallback(() => {
    return state.wordBanks.reduce((sum, bank) => sum + bank.wordCount, 0);
  }, [state.wordBanks]);

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
            onAddRecord={addDictationRecord}
            totalWordCount={getTotalWordCount()}
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
          </h1>
          <div className="text-sm text-slate-500">
            词库 {state.wordBanks.length} 个 · 错词 {state.wrongWords.length} 个
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
