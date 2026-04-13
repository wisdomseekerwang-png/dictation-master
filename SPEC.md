# 听写大师 - iPad听写应用规格说明

## 1. 项目概述

**项目名称**: 听写大师 (DictationMaster)
**项目类型**: 跨平台移动应用 (iPad优先)
**核心功能**: 一款帮助用户练习听写的应用，支持多种格式词库导入、智能错词管理、可定制的听写训练。

## 2. 技术栈

- **前端框架**: React + TypeScript + Vite
- **样式方案**: TailwindCSS + 自定义CSS
- **状态管理**: React Context + localStorage
- **语音合成**: Web Speech API
- **文件解析**: 
  - PDF: pdf.js
  - TXT: 原生FileReader
  - 飞书文档: 需要用户导出为文本后粘贴
- **构建工具**: Capacitor (用于iOS原生打包)

## 3. 功能列表

### 3.1 词库管理
- **导入词库**: 支持PDF、TXT文件导入
- **飞书文档**: 支持粘贴文本导入
- **词库列表**: 查看已导入的所有词库
- **词库详情**: 查看词库中的所有词语
- **删除词库**: 删除不需要的词库

### 3.2 错词库管理
- **自动记录**: 听写时答错的词自动加入错词库
- **手动添加**: 用户可手动添加不熟悉的词
- **错词列表**: 查看和管理所有错词
- **移除错词**: 将已掌握的词从错词库移除

### 3.3 听写功能
- **开始听写**: 从词库和错词库随机选取词语
- **听写词数**: 可设置每次听写的词语数量 (5-50个)
- **朗读速度**: 可调节语速 (0.5x - 2.0x)
- **重复次数**: 每个词语重复朗读次数 (1-5次)
- **间隔时间**: 词语之间停顿时间 (1-10秒)
- **答题界面**: 显示拼音首字母提示，用户输入答案
- **实时反馈**: 显示正确/错误状态
- **听写历史**: 记录本次听写结果

### 3.4 设置功能
- **默认参数保存**: 保存用户的听写设置
- **声音选择**: 选择不同的语音

## 4. UI/UX 设计方向

### 4.1 整体视觉风格
- 现代简洁风格，适合iPad大屏
- 卡片式布局，信息层次分明
- 触摸友好的大按钮

### 4.2 配色方案
- **主色调**: #4F46E5 (靛蓝色 - 专业学习感)
- **强调色**: #10B981 (翠绿色 - 正确)
- **警告色**: #EF4444 (红色 - 错误)
- **背景色**: #F8FAFC (浅灰白)
- **卡片背景**: #FFFFFF
- **文字色**: #1E293B (深灰)

### 4.3 布局方案
- **底部导航**: 4个主要入口
  - 📚 词库
  - 📝 错词本
  - 🎧 听写
  - ⚙️ 设置
- **iPad优化**: 双栏布局（列表+详情），充分利用屏幕宽度

### 4.4 交互设计
- 滑动切换导航
- 卡片点击效果
- 进度条显示听写进度
- 按钮悬停/点击动画

## 5. 数据结构

### 5.1 词库 (WordBank)
```typescript
interface WordBank {
  id: string;
  name: string;
  source: 'pdf' | 'txt' | 'paste';
  words: string[];
  createdAt: number;
  wordCount: number;
}
```

### 5.2 错词库 (WrongWords)
```typescript
interface WrongWord {
  word: string;
  addedAt: number;
  wrongCount: number; // 累计错误次数
  lastWrongAt: number;
}
```

### 5.3 听写记录 (DictationRecord)
```typescript
interface DictationRecord {
  id: string;
  words: string[];
  results: { word: string; correct: boolean }[];
  settings: DictationSettings;
  completedAt: number;
}
```

### 5.4 听写设置 (DictationSettings)
```typescript
interface DictationSettings {
  wordCount: number;      // 5-50
  speechRate: number;     // 0.5-2.0
  repeatCount: number;    // 1-5
  intervalTime: number;   // 1-10 (秒)
  includeWrongWords: boolean; // 是否包含错词
}
```

## 6. 页面结构

1. **词库页面 (WordBanks)**
   - 词库列表
   - 添加词库按钮
   - 导入弹窗（选择文件/粘贴文本）

2. **错词本页面 (WrongWords)**
   - 错词列表
   - 添加错词按钮
   - 移除错词功能

3. **听写页面 (Dictation)**
   - 听写设置区域
   - 开始/停止按钮
   - 实时听写界面
   - 听写结果展示

4. **设置页面 (Settings)**
   - 默认听写参数
   - 语音设置
   - 数据管理（清除数据）

## 7. 核心算法

### 7.1 词语选择算法
1. 收集所有词库词语 + 错词库词语
2. 错词库词语优先选中（权重更高）
3. 随机打乱顺序
4. 取前N个作为本次听写词语

### 7.2 朗读流程
1. 显示词语的拼音首字母提示
2. 朗读词语（重复N次）
3. 等待间隔时间
4. 用户输入答案
5. 判断对错，记录错词
6. 下一个词语
