import React, { useState, useEffect } from 'react';
import { DictationSettings } from '../types';

interface SettingsProps {
  settings: DictationSettings;
  onUpdateSettings: (settings: DictationSettings) => void;
  onClearAllData: () => void;
  wordBankCount: number;
  wrongWordCount: number;
  recordCount: number;
}

const Settings: React.FC<SettingsProps> = ({
  settings,
  onUpdateSettings,
  onClearAllData,
  wordBankCount,
  wrongWordCount,
  recordCount,
}) => {
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [testVoice, setTestVoice] = useState<string>('');

  // 加载可用语音
  useEffect(() => {
    const loadVoices = () => {
      if (window.speechSynthesis) {
        const allVoices = window.speechSynthesis.getVoices();
        setVoices(allVoices.filter(v => v.lang.startsWith('zh') || v.lang.startsWith('en')));
      }
    };
    loadVoices();
    window.speechSynthesis?.addEventListener('voiceschanged', loadVoices);
    return () => window.speechSynthesis?.removeEventListener('voiceschanged', loadVoices);
  }, []);

  // 试听语音
  const handleTestVoice = (voiceUri: string) => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance('Hello, this is a test.');
      const voice = voices.find(v => v.voiceURI === voiceUri);
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
        setTestVoice(voiceUri);
        utterance.onend = () => setTestVoice('');
        window.speechSynthesis.speak(utterance);
      }
    }
  };

  const handleClearAll = () => {
    onClearAllData();
    setShowClearConfirm(false);
  };

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-lg mx-auto space-y-6">
          {/* 默认设置 */}
          <section className="bg-white rounded-2xl p-5">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">默认听写设置</h2>
            
            <div className="space-y-5">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-slate-600">默认词数</span>
                  <span className="font-medium text-primary">{settings.wordCount} 个</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="50"
                  value={settings.wordCount}
                  onChange={(e) => onUpdateSettings({ ...settings, wordCount: parseInt(e.target.value) })}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-slate-600">朗读速度</span>
                  <span className="font-medium text-primary">{settings.speechRate.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="2"
                  step="0.1"
                  value={settings.speechRate}
                  onChange={(e) => onUpdateSettings({ ...settings, speechRate: parseFloat(e.target.value) })}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-slate-600">重复朗读</span>
                  <span className="font-medium text-primary">{settings.repeatCount} 次</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="5"
                  value={settings.repeatCount}
                  onChange={(e) => onUpdateSettings({ ...settings, repeatCount: parseInt(e.target.value) })}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-slate-600">答题间隔</span>
                  <span className="font-medium text-primary">{settings.intervalTime} 秒</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="10"
                  value={settings.intervalTime}
                  onChange={(e) => onUpdateSettings({ ...settings, intervalTime: parseInt(e.target.value) })}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary"
                />
              </div>

              {/* 语音选择 */}
              {voices.length > 0 && (
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-slate-600">朗读语音</span>
                    <span className="text-xs text-slate-400">共 {voices.length} 个可选</span>
                  </div>
                  <select
                    value={settings.voiceUri || ''}
                    onChange={(e) => onUpdateSettings({ ...settings, voiceUri: e.target.value || undefined })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm focus:outline-none focus:border-primary"
                  >
                    <option value="">🤖 系统默认</option>
                    {voices.map(v => (
                      <option key={v.voiceURI} value={v.voiceURI}>
                        {v.name} ({v.lang})
                      </option>
                    ))}
                  </select>
                  {settings.voiceUri && (
                    <button
                      onClick={() => handleTestVoice(settings.voiceUri!)}
                      className="mt-2 text-sm text-primary hover:text-primaryDark flex items-center gap-1"
                      disabled={!!testVoice}
                    >
                      {testVoice === settings.voiceUri ? '🔊 试听中...' : '▶️ 试听当前语音'}
                    </button>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between py-2">
                <span className="text-slate-600">默认包含错词</span>
                <button
                  onClick={() => onUpdateSettings({ ...settings, includeWrongWords: !settings.includeWrongWords })}
                  className={`w-12 h-7 rounded-full transition-colors ${
                    settings.includeWrongWords ? 'bg-primary' : 'bg-slate-300'
                  }`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      settings.includeWrongWords ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </section>

          {/* 数据统计 */}
          <section className="bg-white rounded-2xl p-5">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">数据统计</h2>
            
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 bg-slate-50 rounded-xl">
                <div className="text-2xl font-bold text-primary">{wordBankCount}</div>
                <div className="text-xs text-slate-500 mt-1">词库</div>
              </div>
              <div className="text-center p-3 bg-slate-50 rounded-xl">
                <div className="text-2xl font-bold text-red-500">{wrongWordCount}</div>
                <div className="text-xs text-slate-500 mt-1">错词</div>
              </div>
              <div className="text-center p-3 bg-slate-50 rounded-xl">
                <div className="text-2xl font-bold text-green-500">{recordCount}</div>
                <div className="text-xs text-slate-500 mt-1">记录</div>
              </div>
            </div>
          </section>

          {/* 数据管理 */}
          <section className="bg-white rounded-2xl p-5">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">数据管理</h2>
            
            <button
              onClick={() => setShowClearConfirm(true)}
              className="w-full py-3 bg-red-50 text-red-600 rounded-xl font-medium btn-touch hover:bg-red-100 transition-colors"
            >
              🗑️ 清除所有数据
            </button>
            
            <p className="text-xs text-slate-400 mt-3 text-center">
              清除后无法恢复，请谨慎操作
            </p>
          </section>

          {/* 关于 */}
          <section className="bg-white rounded-2xl p-5">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">关于</h2>
            
            <div className="space-y-3 text-sm text-slate-600">
              <div className="flex justify-between">
                <span>应用名称</span>
                <span className="font-medium">听写大师</span>
              </div>
              <div className="flex justify-between">
                <span>版本</span>
                <span>1.0.0</span>
              </div>
              <div className="flex justify-between">
                <span>支持格式</span>
                <span>TXT, PDF, 粘贴文本</span>
              </div>
            </div>
            
            <div className="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-400">
              <p>听写大师 - 帮助孩子提高听写能力的 iPad 应用</p>
              <p className="mt-1">支持多种词库格式导入，智能错题管理</p>
            </div>
          </section>
        </div>
      </div>

      {/* 确认清除弹窗 */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden animate-fade-in">
            <div className="p-6 text-center">
              <div className="text-5xl mb-4">⚠️</div>
              <h3 className="text-lg font-semibold text-slate-800 mb-2">确定要清除所有数据吗？</h3>
              <p className="text-sm text-slate-500 mb-6">
                这将删除所有词库、错词和听写记录，此操作不可恢复。
              </p>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-medium btn-touch hover:bg-slate-200 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleClearAll}
                  className="flex-1 py-3 bg-red-500 text-white rounded-xl font-medium btn-touch hover:bg-red-600 transition-colors"
                >
                  确认清除
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
