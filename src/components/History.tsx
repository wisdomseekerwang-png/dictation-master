import { useState } from 'react';
import { DictationRecord } from '../types';

interface HistoryProps {
  records: DictationRecord[];
  onDeleteRecord: (id: string) => void;
  onClearAll: () => void;
}

export default function History({ records, onDeleteRecord, onClearAll }: HistoryProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStats = (record: DictationRecord) => {
    const correct = record.results.filter(r => r.correct).length;
    const total = record.results.length;
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
    const wrongCount = total - correct;
    return { correct, total, accuracy, wrongCount };
  };

  const getAccuracyColor = (accuracy: number) => {
    if (accuracy >= 90) return 'text-green-600';
    if (accuracy >= 70) return 'text-amber-600';
    return 'text-red-600';
  };

  const getAccuracyBg = (accuracy: number) => {
    if (accuracy >= 90) return 'bg-green-50';
    if (accuracy >= 70) return 'bg-amber-50';
    return 'bg-red-50';
  };

  if (records.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center">
        <div className="text-6xl mb-4">📋</div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">暂无听写记录</h2>
        <p className="text-slate-500">完成听写并批改后，会自动保存到这里</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 标题栏 */}
      <div className="px-6 py-4 bg-white border-b border-slate-100 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">听写报告</h1>
            <p className="text-sm text-slate-500">{records.length} 次听写记录</p>
          </div>
          <button
            onClick={onClearAll}
            className="px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 rounded-lg transition-colors"
          >
            清空全部
          </button>
        </div>
      </div>

      {/* 记录列表 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {records.map((record) => {
          const stats = getStats(record);
          const isExpanded = expandedId === record.id;

          return (
            <div
              key={record.id}
              className="bg-white rounded-2xl shadow-sm overflow-hidden"
            >
              {/* 摘要行 */}
              <div
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50"
                onClick={() => setExpandedId(isExpanded ? null : record.id)}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-500">
                      {formatDate(record.completedAt)}
                    </span>
                    <span className="text-slate-300">•</span>
                    <span className="text-sm text-slate-600">
                      {stats.total}个词语
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-2xl font-bold ${getAccuracyColor(stats.accuracy)}`}>
                      {stats.accuracy}%
                    </span>
                    <span className="text-sm text-slate-500">
                      ({stats.correct}/{stats.total})
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {/* 正确/错误标签 */}
                  <div className="flex gap-2">
                    <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                      ✓ {stats.correct}
                    </span>
                    {stats.wrongCount > 0 && (
                      <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full">
                        ✗ {stats.wrongCount}
                      </span>
                    )}
                  </div>

                  {/* 展开按钮 */}
                  <span className={`text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                    ▼
                  </span>
                </div>
              </div>

              {/* 展开详情 */}
              {isExpanded && (
                <div className="border-t border-slate-100 p-4 bg-slate-50">
                  {/* 词语详情 */}
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    {record.results.map((result, index) => (
                      <div
                        key={index}
                        className={`p-2 rounded-lg text-sm ${
                          result.correct
                            ? 'bg-green-50 text-green-700'
                            : 'bg-red-50 text-red-700'
                        }`}
                      >
                        <span className="font-medium">{result.word}</span>
                        <span className="ml-1">
                          {result.correct ? '✓' : '✗'}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => onDeleteRecord(record.id)}
                      className="flex-1 py-2 text-sm text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      删除记录
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
