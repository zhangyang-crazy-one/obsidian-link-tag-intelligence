#!/usr/bin/env node
import {
  getDataDir,
  getSessionStatePath,
  getHistoryDir,
  ensureDir,
  readJsonSafe,
  writeJsonSafe,
  getTimestamp,
  formatTimestampForFile,
  log,
  debug
} from './utils.js';
import path from 'path';

const STATE_VERSION = '1.0.0';

class SessionManager {
  constructor() {
    this.dataDir = getDataDir();
    this.statePath = getSessionStatePath();
    this.historyDir = getHistoryDir();
  }

  async init() {
    await ensureDir(this.dataDir);
    await ensureDir(this.historyDir);
  }

  async load() {
    try {
      await this.init();
      const state = await readJsonSafe(this.statePath);
      
      if (!state) {
        log('无历史状态，开始新会话');
        return { success: true, state: null };
      }

      log(`已加载上次会话状态`);
      log(`  时间: ${state.timestamp}`);
      log(`  任务: ${state.context?.activeTopic || '无'}`);
      log(`  模式: ${state.context?.currentMode || 'default'}`);
      
      return { success: true, state };
    } catch (error) {
      log(`加载失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async save(options = {}) {
    try {
      await this.init();
      
      const timestamp = getTimestamp();
      const state = {
        version: STATE_VERSION,
        timestamp,
        savedBy: options.preCompact ? 'pre-compact' : 'session-end',
        context: {
          currentMode: process.env.BRAIN_STORM_MODE || 'default',
          activeTopic: process.env.BRAIN_STORM_TOPIC || null,
          activeCommand: process.env.BRAIN_STORM_COMMAND || null
        },
        project: {
          path: process.cwd(),
          name: path.basename(process.cwd())
        }
      };

      await writeJsonSafe(this.statePath, state);
      
      const historyFile = path.join(
        this.historyDir,
        `${formatTimestampForFile(timestamp)}.json`
      );
      await writeJsonSafe(historyFile, state);
      
      log(`状态已保存${options.preCompact ? ' (压缩前)' : ''}`);
      
      await this.cleanHistory(10);
      
      return { success: true };
    } catch (error) {
      log(`保存失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async cleanHistory(keepCount = 10) {
    try {
      const { promises: fs } = await import('fs');
      const files = await fs.readdir(this.historyDir);
      const jsonFiles = files.filter(f => f.endsWith('.json')).sort().reverse();
      
      for (let i = keepCount; i < jsonFiles.length; i++) {
        await fs.unlink(path.join(this.historyDir, jsonFiles[i]));
        debug(`已清理历史: ${jsonFiles[i]}`);
      }
    } catch (error) {
      debug(`清理历史失败: ${error.message}`);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'load';
  const manager = new SessionManager();

  switch (command) {
    case 'load':
      await manager.load();
      break;
    case 'save':
      await manager.save();
      break;
    case 'pre-compact':
      await manager.save({ preCompact: true });
      break;
    default:
      log(`未知命令: ${command}`);
      process.exit(1);
  }
}

main().catch(error => {
  log(`错误: ${error.message}`);
  process.exit(1);
});
