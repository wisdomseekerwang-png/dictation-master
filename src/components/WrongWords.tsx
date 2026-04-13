import React, { useState } from 'react';
import { WrongWord } from '../types';
import { formatDate } from '../store';

interface WrongWordsProps {
  wrongWords: WrongWord[];
  onUpdateWrongWords: (wrongWords: WrongWord[]) => void;
}

const WrongWords: React.FC<WrongWordsProps> = ({ wrongWords, onUpdateWrongWords }) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [newWord, setNewWord] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const handleAddWord = () => {
    const trimmedWord = newWord.trim();
    if (!trimmedWord) {
      alert('请输入词语');
      return;
    }
    
    const exists = wrongWords.find(w => w.word === trimmedWord);
    if (exists) {
      alert('这个词已经在错词本中了');
      return;
    }
    
    const newWrongWord: WrongWord = {
      word: trimmedWord,
      addedAt: Date.now(),
      wrongCount: 1,
      lastWrongAt: Date.now(),
    };
    
    onUpdateWrongWords([...wrongWords, newWrongWord]);
    setNewWord('');
    setShowAddModal(false);
  };

  const handleRemoveWord = (word: string) => {
    onUpdateWrongWords(wrongWords.filter(w => w.word !== word));
  };

  const handleClearAll = () => {
    if (wrongWords.length === 0) return;
    if (confirm('确定要清空所有错词吗？')) {
      onUpdateWrongWords([]);
    }
  };

  const filteredWords = wrongWords.filter(w => 
    w.word.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col bg-white">
      {/* 头部 */}
      <div className="p-4 border-b border-slate-100 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-800">
            错词本 <span className="text-slate-400 font-normal">({wrongWords.length})</span>
          </h2>
          <div className="flex gap-2">
            {wrongWords.length > 0 && (
              <button
                onClick={handleClearAll}
                className="px-3 py-2 text-red-500 hover:bg-red-50 rounded-lg text-sm btn-touch transition-colors"
              >
                清空全部
              </button>
            )}
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium btn-touch hover:bg-primaryDark transition-colors"
            >
              + 添加错词
            </button>
          </div>
        </div>
        
        {wrongWords.length > 0 && (
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索错词..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
          </div>
        )}
      </div>

      {/* 错词列表 */}
      <div className="flex-1 overflow-y-auto p-4">
        {wrongWords.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-400">
            <div className="text-center">
              <div className="text-5xl mb-4">📝</div>
              <p className="text-lg font-medium">错词本为空</p>
              <p className="text-sm mt-2">听写中答错的词会自动加入这里</p>
            </div>
          </div>
        ) : filteredWords.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-400">
            <div className="text-center">
              <div className="text-4xl mb-4">🔍</div>
              <p>没有找到匹配的词语</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredWords.map((item) => (
              <div
                key={item.word}
                className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between group"
              >
                <div className="flex-1">
                  <div className="font-medium text-slate-800 text-lg">{item.word}</div>
                  <div className="flex items-center gap-4 mt-1 text-sm text-slate-500">
                    <span>错误 {item.wrongCount} 次</span>
                    <span>·</span>
                    <span>上次 {formatDate(item.lastWrongAt)}</span>
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveWord(item.word)}
                  className="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                  title="移除错词（表示已掌握）"
                >
                  ✓
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 添加错词弹窗 */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden animate-fade-in">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-semibold">添加错词</h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setNewWord('');
                }}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full"
              >
                ✕
              </button>
            </div>
            
            <div className="p-4 space-y-4">
              <p className="text-sm text-slate-500">
                将自己掌握不好的词语加入错词本，听写时会优先出现这些词语。
              </p>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  词语
                </label>
                <input
                  type="text"
                  value={newWord}
                  onChange={(e) => setNewWord(e.target.value)}
                  placeholder="输入词语"
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-lg"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleAddWord();
                    }
                  }}
                />
              </div>
              
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setNewWord('');
                  }}
                  className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-lg font-medium btn-touch hover:bg-slate-200 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleAddWord}
                  className="flex-1 py-3 bg-primary text-white rounded-lg font-medium btn-touch hover:bg-primaryDark transition-colors"
                >
                  添加
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WrongWords;
