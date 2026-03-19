/**
 * Brain-storm Hooks - 工具函数
 * 
 * 提供跨平台的文件操作和路径处理工具
 */

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

/**
 * 获取 Brain-storm 数据目录
 * @returns {string} 数据目录路径
 */
export function getDataDir() {
  return path.join(os.homedir(), '.claude', 'brain-storm');
}

/**
 * 获取会话状态文件路径
 * @returns {string} 会话状态文件路径
 */
export function getSessionStatePath() {
  return path.join(getDataDir(), 'session-state.json');
}

/**
 * 获取历史目录路径
 * @returns {string} 历史目录路径
 */
export function getHistoryDir() {
  return path.join(getDataDir(), 'history');
}

/**
 * 确保目录存在
 * @param {string} dirPath - 目录路径
 */
export async function ensureDir(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

/**
 * 安全读取 JSON 文件
 * @param {string} filePath - 文件路径
 * @returns {object|null} 解析后的对象，文件不存在返回 null
 */
export async function readJsonSafe(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * 安全写入 JSON 文件
 * @param {string} filePath - 文件路径
 * @param {object} data - 要写入的数据
 */
export async function writeJsonSafe(filePath, data) {
  const dir = path.dirname(filePath);
  await ensureDir(dir);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * 获取当前时间戳
 * @returns {string} ISO 格式时间戳
 */
export function getTimestamp() {
  return new Date().toISOString();
}

/**
 * 格式化时间戳为文件名安全格式
 * @param {string} timestamp - ISO 时间戳
 * @returns {string} 文件名安全的时间戳
 */
export function formatTimestampForFile(timestamp) {
  return timestamp.replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
}

/**
 * 从 stdin 读取输入
 * @returns {Promise<string>} 输入内容
 */
export async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

/**
 * 输出到 stderr（不干扰 Claude 的 stdout）
 * @param {string} message - 消息
 */
export function log(message) {
  console.error(`[Brain-storm] ${message}`);
}

/**
 * 输出调试信息
 * @param {string} message - 消息
 */
export function debug(message) {
  if (process.env.DEBUG === 'true') {
    console.error(`[DEBUG] ${message}`);
  }
}

/**
 * 获取项目根目录
 * @returns {string} 项目根目录路径
 */
export function getProjectRoot() {
  // 从脚本目录向上 3 级: scripts -> hooks -> .claude -> project root
  const scriptDir = decodeURIComponent(path.dirname(new URL(import.meta.url).pathname));
  return path.resolve(scriptDir, '..', '..', '..');
}

/**
 * 获取 contexts 目录路径
 * @returns {string} contexts 目录路径
 */
export function getContextsDir() {
  return path.join(getProjectRoot(), '.claude', 'contexts');
}
