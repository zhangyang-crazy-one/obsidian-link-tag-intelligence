#!/usr/bin/env node
import { log, getContextsDir } from './utils.js';
import { promises as fs, existsSync } from 'fs';
import path from 'path';

const CONTEXT_MAP = {
  '/brainstorm': 'brainstorming',
  '/compare': 'comparing',
  '/design': 'designing',
  '/research': 'researching',
  '/plan': 'designing',
  'default': 'dev'
};

// First-trigger-only optimization
const FLAG_FILE = `/tmp/.context-switcher-first-trigger-${process.env.USER || 'user'}`;
if (existsSync(FLAG_FILE)) {
  process.exit(0);
}

class ContextSwitcher {
  constructor() {
    this.contextDir = getContextsDir();
  }

  async getContextForCommand(command) {
    const contextName = CONTEXT_MAP[command] || CONTEXT_MAP['default'];
    return contextName;
  }

  async contextExists(contextName) {
    try {
      const contextPath = path.join(this.contextDir, `${contextName}.md`);
      await fs.access(contextPath);
      return true;
    } catch {
      return false;
    }
  }

  async switchContext(command) {
    const contextName = await this.getContextForCommand(command);
    
    if (await this.contextExists(contextName)) {
      process.env.BRAIN_STORM_MODE = contextName;
      log(`已切换到 ${contextName} 模式`);
      return { switched: true, context: contextName };
    }

    log(`上下文 ${contextName} 不存在，使用默认模式`);
    return { switched: false, context: 'default' };
  }

  async autoSwitch() {
    const lastCommand = process.env.BRAIN_STORM_COMMAND;
    if (lastCommand) {
      return this.switchContext(lastCommand);
    }
    return { switched: false, context: 'default' };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'auto';
  const switcher = new ContextSwitcher();

  try {
    if (command === 'auto') {
      await switcher.autoSwitch();
    } else {
      await switcher.switchContext(command);
    }
    // Mark as triggered (first-trigger-only)
    fs.writeFileSync(FLAG_FILE, String(process.pid));
  } catch (error) {
    log(`上下文切换失败: ${error.message}`);
  }
}

main();
