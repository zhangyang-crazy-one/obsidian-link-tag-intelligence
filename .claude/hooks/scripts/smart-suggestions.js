#!/usr/bin/env node
/**
 * smart-suggestions.js - CLI: session-start | command <cmd> | file <path> | context
 */

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { log, readJsonSafe, getTimestamp } from './utils.js';

const PATTERNS_FILE = path.join(os.homedir(), '.claude', 'brain-storm', 'patterns.json');
const SESSION_FILE = path.join(os.homedir(), '.claude', 'brain-storm', 'session-state.json');

const SUGGESTION_TYPES = {
  NEXT_COMMAND: 'next_command',
  FILE_PATTERN: 'file_pattern',
  WORKFLOW: 'workflow',
  CONTEXT: 'context',
  QUALITY: 'quality'
};

const PRIORITY = { HIGH: 3, MEDIUM: 2, LOW: 1 };

class SmartSuggestions {
  constructor() {
    this.patterns = null;
    this.session = null;
  }

  async load() {
    this.patterns = await readJsonSafe(PATTERNS_FILE) || { commandSequences: [], filePatterns: [] };
    this.session = await readJsonSafe(SESSION_FILE) || { currentTopic: null, recentCommands: [], recentFiles: [] };
    return this;
  }

  getSessionStartSuggestions() {
    const suggestions = [];
    const hour = new Date().getHours();
    
    if (hour < 10) {
      suggestions.push({
        type: SUGGESTION_TYPES.CONTEXT,
        priority: PRIORITY.LOW,
        message: '早间工作建议：先回顾昨日进度 (/progress)，再开始新任务',
        action: '/progress'
      });
    }
    
    if (this.patterns.commandSequences?.length > 0) {
      const topSequence = this.patterns.commandSequences
        .sort((a, b) => b.confidence - a.confidence)[0];
      
      if (topSequence?.confidence > 0.3) {
        suggestions.push({
          type: SUGGESTION_TYPES.WORKFLOW,
          priority: PRIORITY.MEDIUM,
          message: `常用工作流: ${topSequence.sequence.join(' → ')}`,
          action: topSequence.sequence[0]
        });
      }
    }
    
    if (this.session.currentTopic) {
      suggestions.push({
        type: SUGGESTION_TYPES.CONTEXT,
        priority: PRIORITY.HIGH,
        message: `继续上次的主题: ${this.session.currentTopic}`,
        action: `/start ${this.session.currentTopic}`
      });
    }
    
    return suggestions;
  }

  getCommandSuggestions(lastCommand) {
    const suggestions = [];
    
    const relevantSequences = (this.patterns.commandSequences || [])
      .filter(s => s.sequence.includes(lastCommand) && s.confidence > 0.25)
      .sort((a, b) => b.confidence - a.confidence);
    
    for (const seq of relevantSequences) {
      const idx = seq.sequence.indexOf(lastCommand);
      if (idx >= 0 && idx < seq.sequence.length - 1) {
        suggestions.push({
          type: SUGGESTION_TYPES.NEXT_COMMAND,
          priority: PRIORITY.HIGH,
          message: `推荐下一步: ${seq.sequence[idx + 1]}`,
          confidence: seq.confidence,
          action: seq.sequence[idx + 1]
        });
        break;
      }
    }
    
    suggestions.push(...this.getCommandSpecificSuggestions(lastCommand));
    return suggestions;
  }

  getCommandSpecificSuggestions(command) {
    const COMMAND_HINTS = {
      '/brainstorm': { msg: '确保至少提出 3 个备选方案，并创建对比矩阵', action: null },
      '/compare': { msg: '完成对比后，运行 /design 进行详细设计', action: '/design' },
      '/design': { msg: '设计完成后检查文档完整性和一致性', action: null },
      '/start': { msg: '开始新方案? 使用 /brainstorm [主题] 或 /bootstrap', action: '/brainstorm' }
    };
    
    const hint = COMMAND_HINTS[command];
    if (!hint) return [];
    
    return [{
      type: SUGGESTION_TYPES.QUALITY,
      priority: PRIORITY.MEDIUM,
      message: `提示: ${hint.msg}`,
      action: hint.action
    }];
  }

  getFileSuggestions(filePath) {
    const suggestions = [];
    const fileName = path.basename(filePath);
    
    const matchingPatterns = (this.patterns.filePatterns || [])
      .filter(p => p.files.some(f => fileName.includes(f) || f.includes(fileName)))
      .sort((a, b) => b.confidence - a.confidence);
    
    if (matchingPatterns.length > 0) {
      const pattern = matchingPatterns[0];
      const remainingFiles = pattern.files.filter(f => 
        !fileName.includes(f) && !f.includes(fileName)
      );
      
      if (remainingFiles.length > 0) {
        suggestions.push({
          type: SUGGESTION_TYPES.FILE_PATTERN,
          priority: PRIORITY.MEDIUM,
          message: `${pattern.name}模式: 还需创建 ${remainingFiles.join(', ')}`,
          action: null
        });
      }
    }
    
    const FILE_HINTS = {
      'requirements.md': { msg: '需求文档完成后，建议创建 alternatives.md 列出备选方案', action: null },
      'alternatives.md': { msg: '备选方案完成后，建议使用 /compare 创建对比分析', action: '/compare' },
      'comparison.md': { msg: '对比分析完成后，请确保 decision.md 中记录最终决策', action: null }
    };
    
    const hint = FILE_HINTS[fileName];
    if (hint) {
      suggestions.push({
        type: SUGGESTION_TYPES.QUALITY,
        priority: PRIORITY.LOW,
        message: hint.msg,
        action: hint.action
      });
    }
    
    return suggestions;
  }

  getContextSuggestions() {
    const suggestions = [];
    const recentCommands = this.session.recentCommands || [];
    
    if (recentCommands.length > 5 && !recentCommands.includes('/progress')) {
      suggestions.push({
        type: SUGGESTION_TYPES.CONTEXT,
        priority: PRIORITY.LOW,
        message: '已执行多个命令，建议使用 /progress 查看整体进度',
        action: '/progress'
      });
    }
    
    if (recentCommands.includes('/brainstorm') && !recentCommands.includes('/compare')) {
      suggestions.push({
        type: SUGGESTION_TYPES.WORKFLOW,
        priority: PRIORITY.MEDIUM,
        message: '已完成头脑风暴，建议使用 /compare 进行方案对比',
        action: '/compare'
      });
    }
    
    return suggestions;
  }

  formatSuggestions(suggestions, maxCount = 3) {
    if (!suggestions?.length) return '';
    
    const PREFIX_MAP = {
      [PRIORITY.HIGH]: '[建议]',
      [PRIORITY.MEDIUM]: '[提示]',
      [PRIORITY.LOW]: '[参考]'
    };
    
    return suggestions
      .sort((a, b) => b.priority - a.priority)
      .slice(0, maxCount)
      .map(s => {
        const prefix = PREFIX_MAP[s.priority] || '[提示]';
        const confidence = s.confidence ? ` (${(s.confidence * 100).toFixed(0)}%)` : '';
        return `${prefix} ${s.message}${confidence}`;
      })
      .join('\n');
  }
}

async function main() {
  const [command, arg] = process.argv.slice(2);
  const suggester = new SmartSuggestions();
  await suggester.load();
  
  let suggestions = [];
  
  switch (command) {
    case 'session-start':
      suggestions = suggester.getSessionStartSuggestions();
      break;
    case 'command':
      if (!arg) { log('用法: smart-suggestions.js command /brainstorm'); process.exit(1); }
      suggestions = suggester.getCommandSuggestions(arg);
      break;
    case 'file':
      if (!arg) { log('用法: smart-suggestions.js file planning/requirements.md'); process.exit(1); }
      suggestions = suggester.getFileSuggestions(arg);
      break;
    case 'context':
    default:
      suggestions = suggester.getContextSuggestions();
      break;
  }
  
  const output = suggester.formatSuggestions(suggestions);
  if (output) console.log(output);
}

main().catch(e => { log(`错误: ${e.message}`); process.exit(1); });

export { SmartSuggestions };
