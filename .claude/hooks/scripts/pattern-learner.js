#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { log, ensureDir, readJsonSafe, writeJsonSafe, getTimestamp } from './utils.js';

const PATTERNS_FILE = path.join(os.homedir(), '.claude', 'brain-storm', 'patterns.json');

const DEFAULT_PATTERNS = {
  version: '1.0',
  lastUpdated: null,
  commandSequences: [],
  filePatterns: [],
  workflowPatterns: [],
  statistics: {
    totalSessions: 0,
    totalPatterns: 0,
    lastLearned: null
  }
};

class PatternLearner {
  constructor() {
    this.patterns = null;
  }

  async load() {
    this.patterns = await readJsonSafe(PATTERNS_FILE) || { ...DEFAULT_PATTERNS };
    return this.patterns;
  }

  async save() {
    this.patterns.lastUpdated = getTimestamp();
    await writeJsonSafe(PATTERNS_FILE, this.patterns);
  }

  extractCommandSequence(commands) {
    if (!commands || commands.length < 2) return null;
    
    const sequenceKey = commands.join(' -> ');
    const existing = this.patterns.commandSequences.find(s => s.sequence.join(' -> ') === sequenceKey);
    
    if (existing) {
      existing.occurrences++;
      existing.confidence = Math.min(0.99, existing.occurrences / (existing.occurrences + 5));
      existing.lastSeen = getTimestamp();
    } else {
      this.patterns.commandSequences.push({
        id: `cmd-seq-${Date.now()}`,
        sequence: commands,
        occurrences: 1,
        confidence: 0.2,
        firstSeen: getTimestamp(),
        lastSeen: getTimestamp()
      });
    }
    
    return this.patterns.commandSequences;
  }

  extractFilePattern(files) {
    if (!files || files.length < 2) return null;
    
    const sortedFiles = [...files].sort();
    const patternKey = sortedFiles.join(',');
    const existing = this.patterns.filePatterns.find(p => 
      [...p.files].sort().join(',') === patternKey
    );
    
    if (existing) {
      existing.occurrences++;
      existing.confidence = Math.min(0.99, existing.occurrences / (existing.occurrences + 5));
      existing.lastSeen = getTimestamp();
    } else {
      const patternName = this.inferPatternName(files);
      this.patterns.filePatterns.push({
        id: `file-pat-${Date.now()}`,
        name: patternName,
        files: files,
        occurrences: 1,
        confidence: 0.2,
        firstSeen: getTimestamp(),
        lastSeen: getTimestamp()
      });
    }
    
    return this.patterns.filePatterns;
  }

  inferPatternName(files) {
    const hasRequirements = files.some(f => f.includes('requirements'));
    const hasAlternatives = files.some(f => f.includes('alternatives'));
    const hasComparison = files.some(f => f.includes('comparison'));
    const hasDecision = files.some(f => f.includes('decision'));
    const hasArchitecture = files.some(f => f.includes('architecture'));
    
    if (hasRequirements && hasAlternatives && hasDecision) {
      return '头脑风暴方案';
    } else if (hasArchitecture) {
      return '架构设计方案';
    } else if (hasComparison) {
      return '对比分析方案';
    }
    return '通用方案';
  }

  learnFromSession(sessionData) {
    const { commands, files, duration } = sessionData;
    
    if (commands && commands.length >= 2) {
      this.extractCommandSequence(commands);
    }
    
    if (files && files.length >= 2) {
      this.extractFilePattern(files);
    }
    
    this.patterns.statistics.totalSessions++;
    this.patterns.statistics.totalPatterns = 
      this.patterns.commandSequences.length + this.patterns.filePatterns.length;
    this.patterns.statistics.lastLearned = getTimestamp();
    
    return {
      commandSequences: this.patterns.commandSequences.length,
      filePatterns: this.patterns.filePatterns.length
    };
  }

  getTopPatterns(limit = 5) {
    const cmdPatterns = this.patterns.commandSequences
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, limit);
    
    const filePatterns = this.patterns.filePatterns
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, limit);
    
    return { commandSequences: cmdPatterns, filePatterns };
  }

  suggestNextCommand(lastCommand) {
    const relevantSequences = this.patterns.commandSequences
      .filter(s => s.sequence.includes(lastCommand) && s.confidence > 0.3)
      .sort((a, b) => b.confidence - a.confidence);
    
    for (const seq of relevantSequences) {
      const idx = seq.sequence.indexOf(lastCommand);
      if (idx >= 0 && idx < seq.sequence.length - 1) {
        return {
          suggestion: seq.sequence[idx + 1],
          confidence: seq.confidence,
          basedOn: seq.sequence
        };
      }
    }
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'status';
  const learner = new PatternLearner();
  
  await learner.load();
  
  switch (command) {
    case 'learn': {
      const sessionJson = args[1];
      if (!sessionJson) {
        log('用法: pattern-learner.js learn \'{"commands": [...], "files": [...]}\'');
        process.exit(1);
      }
      try {
        const sessionData = JSON.parse(sessionJson);
        const result = learner.learnFromSession(sessionData);
        await learner.save();
        log(`已学习: 命令序列 ${result.commandSequences} 个, 文件模式 ${result.filePatterns} 个`);
      } catch (e) {
        log(`解析失败: ${e.message}`);
        process.exit(1);
      }
      break;
    }
    
    case 'suggest': {
      const lastCommand = args[1];
      if (!lastCommand) {
        log('用法: pattern-learner.js suggest /brainstorm');
        process.exit(1);
      }
      const suggestion = learner.suggestNextCommand(lastCommand);
      if (suggestion) {
        log(`建议下一步: ${suggestion.suggestion} (置信度: ${(suggestion.confidence * 100).toFixed(0)}%)`);
      } else {
        log('暂无建议');
      }
      break;
    }
    
    case 'top': {
      const limit = parseInt(args[1]) || 5;
      const top = learner.getTopPatterns(limit);
      log(`命令序列模式 (前 ${limit}):`);
      top.commandSequences.forEach((p, i) => {
        log(`  ${i + 1}. ${p.sequence.join(' -> ')} (${(p.confidence * 100).toFixed(0)}%)`);
      });
      log(`文件模式 (前 ${limit}):`);
      top.filePatterns.forEach((p, i) => {
        log(`  ${i + 1}. ${p.name}: ${p.files.join(', ')} (${(p.confidence * 100).toFixed(0)}%)`);
      });
      break;
    }
    
    case 'status':
    default: {
      const stats = learner.patterns.statistics;
      log(`模式学习状态:`);
      log(`  总会话数: ${stats.totalSessions}`);
      log(`  命令序列: ${learner.patterns.commandSequences.length}`);
      log(`  文件模式: ${learner.patterns.filePatterns.length}`);
      log(`  最后学习: ${stats.lastLearned || '从未'}`);
      break;
    }
  }
}

main().catch(e => {
  log(`错误: ${e.message}`);
  process.exit(1);
});
