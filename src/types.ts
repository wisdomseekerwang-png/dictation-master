export interface WordBank {
  id: string;
  name: string;
  source: 'pdf' | 'txt' | 'paste';
  words: string[];
  createdAt: number;
  wordCount: number;
}

export interface WrongWord {
  word: string;
  addedAt: number;
  wrongCount: number;
  lastWrongAt: number;
}

export interface DictationRecord {
  id: string;
  words: string[];
  results: { word: string; correct: boolean }[];
  settings: DictationSettings;
  completedAt: number;
}

export interface DictationSettings {
  wordCount: number;
  speechRate: number;
  repeatCount: number;
  intervalTime: number;
  includeWrongWords: boolean;
}

export type TabType = 'wordbank' | 'wrongwords' | 'dictation' | 'settings' | 'history';

export interface AppState {
  wordBanks: WordBank[];
  wrongWords: WrongWord[];
  dictationRecords: DictationRecord[];
  settings: DictationSettings;
}
