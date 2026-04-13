import React from 'react';
import { TabType } from '../types';

interface TabBarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const tabs: { id: TabType; label: string; icon: string }[] = [
  { id: 'wordbank', label: '词库', icon: '📚' },
  { id: 'wrongwords', label: '错词本', icon: '📝' },
  { id: 'dictation', label: '听写', icon: '🎧' },
  { id: 'history', label: '报告', icon: '📋' },
  { id: 'settings', label: '设置', icon: '⚙️' },
];

const TabBar: React.FC<TabBarProps> = ({ activeTab, onTabChange }) => {
  return (
    <nav className="bg-white border-t border-slate-200 flex-shrink-0 safe-area-inset-bottom">
      <div className="flex justify-around items-center h-16 max-w-lg mx-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex flex-col items-center justify-center w-full h-full transition-colors btn-touch ${
              activeTab === tab.id
                ? 'text-primary'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <span className="text-2xl mb-1">{tab.icon}</span>
            <span className="text-xs font-medium">{tab.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
};

export default TabBar;
