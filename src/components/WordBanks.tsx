import React, { useState, useRef } from 'react';
import { WordBank } from '../types';
import { createWordBank, parseWords, formatDate } from '../store';

interface WordBanksProps {
  wordBanks: WordBank[];
  onUpdateWordBanks: (wordBanks: WordBank[]) => void;
  onSync?: () => void;
  isSyncing?: boolean;
}

const WordBanks: React.FC<WordBanksProps> = ({ wordBanks, onUpdateWordBanks, onSync, isSyncing }) => {
  const [showImportModal, setShowImportModal] = useState(false);
  const [importType, setImportType] = useState<'file' | 'paste'>('file');
  const [importName, setImportName] = useState('');
  const [pastedText, setPastedText] = useState('');
  const [selectedBank, setSelectedBank] = useState<WordBank | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>, fileType: 'txt' | 'pdf') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const name = file.name.replace(/\.[^/.]+$/, '');
    setImportName(name);

    if (fileType === 'txt') {
      const text = await file.text();
      const words = parseWords(text);
      if (words.length > 0) {
        const newBank = createWordBank(name, 'txt', words);
        onUpdateWordBanks([...wordBanks, newBank]);
        setShowImportModal(false);
        setImportName('');
      }
    } else if (fileType === 'pdf') {
      // 简单的PDF文本提取
      const reader = new FileReader();
      reader.onload = async (event) => {
        const content = event.target?.result as ArrayBuffer;
        try {
          // 使用pdf.js提取文本
          const pdfjsLib = await import('pdfjs-dist');
          pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
          
          const pdf = await pdfjsLib.getDocument({ data: content }).promise;
          let fullText = '';
          
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((item: any) => item.str).join(' ');
            fullText += pageText + '\n';
          }
          
          const words = parseWords(fullText);
          if (words.length > 0) {
            const newBank = createWordBank(name, 'pdf', words);
            onUpdateWordBanks([...wordBanks, newBank]);
            setShowImportModal(false);
            setImportName('');
          }
        } catch (err) {
          console.error('PDF解析失败:', err);
          alert('PDF解析失败，请确保文件是文本型PDF');
        }
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const handlePasteImport = () => {
    if (!importName.trim() || !pastedText.trim()) {
      alert('请输入词库名称和词语内容');
      return;
    }
    const words = parseWords(pastedText);
    if (words.length === 0) {
      alert('未识别到有效词语');
      return;
    }
    const newBank = createWordBank(importName.trim(), 'paste', words);
    onUpdateWordBanks([...wordBanks, newBank]);
    setShowImportModal(false);
    setImportName('');
    setPastedText('');
  };

  const handleDeleteBank = (id: string) => {
    if (confirm('确定要删除这个词库吗？')) {
      onUpdateWordBanks(wordBanks.filter(b => b.id !== id));
      if (selectedBank?.id === id) {
        setSelectedBank(null);
      }
    }
  };

  const getSourceLabel = (source: WordBank['source']) => {
    switch (source) {
      case 'pdf': return 'PDF';
      case 'txt': return 'TXT';
      case 'paste': return '粘贴';
      default: return source;
    }
  };

  const getSourceColor = (source: WordBank['source']) => {
    switch (source) {
      case 'pdf': return 'bg-red-100 text-red-700';
      case 'txt': return 'bg-blue-100 text-blue-700';
      case 'paste': return 'bg-green-100 text-green-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="h-full flex flex-col md:flex-row">
      {/* 词库列表 */}
      <div className={`${selectedBank ? 'hidden md:block' : 'block'} md:w-1/2 lg:w-2/5 border-r border-slate-200 flex flex-col bg-white`}>
        <div className="p-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-800">我的词库</h2>
            <div className="flex gap-2">
              {onSync && (
                <button
                  onClick={onSync}
                  disabled={isSyncing}
                  className="px-3 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-medium btn-touch hover:bg-slate-200 transition-colors disabled:opacity-50"
                >
                  {isSyncing ? '同步中...' : '🔄 同步'}
                </button>
              )}
              <button
                onClick={() => setShowImportModal(true)}
                className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium btn-touch hover:bg-primaryDark transition-colors"
              >
                + 导入词库
              </button>
            </div>
          </div>
          
          {wordBanks.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <div className="text-4xl mb-3">📚</div>
              <p>暂无词库</p>
              <p className="text-sm mt-1">点击上方按钮导入词库</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {wordBanks.map((bank) => (
                <div
                  key={bank.id}
                  onClick={() => setSelectedBank(bank)}
                  className={`p-3 rounded-lg border cursor-pointer transition-all btn-touch ${
                    selectedBank?.id === bank.id
                      ? 'border-primary bg-primary/5'
                      : 'border-slate-200 hover:border-slate-300 bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-slate-800 truncate">{bank.name}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-xs px-2 py-0.5 rounded ${getSourceColor(bank.source)}`}>
                          {getSourceLabel(bank.source)}
                        </span>
                        <span className="text-xs text-slate-400">
                          {bank.wordCount} 个词语 · {formatDate(bank.createdAt)}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteBank(bank.id);
                      }}
                      className="ml-2 p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 词库详情 */}
      <div className={`flex-1 overflow-hidden flex flex-col ${selectedBank ? 'block' : 'hidden md:block'}`}>
        {selectedBank ? (
          <>
            <div className="p-4 border-b border-slate-100 bg-white flex-shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-800">{selectedBank.name}</h2>
                  <p className="text-sm text-slate-500 mt-1">共 {selectedBank.wordCount} 个词语</p>
                </div>
                <button
                  onClick={() => setSelectedBank(null)}
                  className="md:hidden px-3 py-1.5 text-slate-500 hover:bg-slate-100 rounded"
                >
                  ✕ 关闭
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="flex flex-wrap gap-2">
                {selectedBank.words.map((word, index) => (
                  <span
                    key={index}
                    className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-700"
                  >
                    {word}
                  </span>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="h-full flex items-center justify-center text-slate-400">
            <div className="text-center">
              <div className="text-5xl mb-4">👈</div>
              <p>选择一个词库查看详情</p>
            </div>
          </div>
        )}
      </div>

      {/* 导入弹窗 */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-hidden animate-fade-in">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-semibold">导入词库</h3>
              <button
                onClick={() => setShowImportModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full"
              >
                ✕
              </button>
            </div>
            
            <div className="p-4">
              {/* 导入方式选择 */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setImportType('file')}
                  className={`flex-1 py-3 rounded-lg font-medium transition-colors ${
                    importType === 'file'
                      ? 'bg-primary text-white'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  📄 文件导入
                </button>
                <button
                  onClick={() => setImportType('paste')}
                  className={`flex-1 py-3 rounded-lg font-medium transition-colors ${
                    importType === 'paste'
                      ? 'bg-primary text-white'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  📝 粘贴导入
                </button>
              </div>

              {importType === 'file' ? (
                <div className="space-y-4">
                  <p className="text-sm text-slate-500">支持 TXT 和 PDF 文件导入</p>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      导入 TXT 文件
                    </label>
                    <input
                      type="file"
                      accept=".txt"
                      onChange={(e) => handleFileImport(e, 'txt')}
                      className="hidden"
                      ref={fileInputRef}
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full py-4 border-2 border-dashed border-slate-300 rounded-lg text-slate-500 hover:border-primary hover:text-primary transition-colors"
                    >
                      点击选择 TXT 文件
                    </button>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      导入 PDF 文件
                    </label>
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={(e) => handleFileImport(e, 'pdf')}
                      className="hidden"
                      id="pdf-input"
                    />
                    <button
                      onClick={() => document.getElementById('pdf-input')?.click()}
                      className="w-full py-4 border-2 border-dashed border-slate-300 rounded-lg text-slate-500 hover:border-primary hover:text-primary transition-colors"
                    >
                      点击选择 PDF 文件
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      词库名称
                    </label>
                    <input
                      type="text"
                      value={importName}
                      onChange={(e) => setImportName(e.target.value)}
                      placeholder="例如：小学三年级词汇"
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      词语内容 <span className="text-slate-400 font-normal">(词语之间用换行、逗号或空格分隔)</span>
                    </label>
                    <textarea
                      value={pastedText}
                      onChange={(e) => setPastedText(e.target.value)}
                      placeholder="例如：
美丽 漂亮 难看
高兴 开心 快乐
学习 读书 考试"
                      rows={10}
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary resize-none"
                    />
                  </div>
                  
                  <button
                    onClick={handlePasteImport}
                    className="w-full py-3 bg-primary text-white rounded-lg font-medium btn-touch hover:bg-primaryDark transition-colors"
                  >
                    确认导入
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WordBanks;
