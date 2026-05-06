/**
 * Binance MCP Server — 配置管理模块
 *
 * @module config/binance
 * @description
 * 从环境变量读取所有配置项，统一管理 Binance API 连接参数。
 *
 * 核心设计：
 * - API Key / Secret 为可选参数，不配置时只能使用公开 API
 * - testnet 模式下自动切换期货端点（testnet.binancefuture.com）
 * - 支持通过环境变量手动覆盖端点地址（HTTP_FUTURES_BASE）
 * - 使用 dotenv 自动加载 .env 文件
 *
 * Binance 客户端初始化参数（对应 binance-api-node Init 配置）：
 * - apiKey / apiSecret: API 认证凭证
 * - httpFutures: 期货 REST API 基础 URL
 * - proxy: HTTP/HTTPS 代理地址（可选，如 http://host:port）
 */

import { config } from 'dotenv';

// 加载 .env 文件到 process.env
config();

/**
 * Binance 客户端配置接口
 *
 * @description
 * 定义连接 Binance API 所需的所有配置项。
 * apiKey 和 apiSecret 为可选，因为公开 API 不需要认证。
 */
export interface BinanceConfig {
  /** Binance API 密钥（可选，公开 API 不需要） */
  apiKey?: string;
  /** Binance API 私钥（可选，公开 API 不需要） */
  apiSecret?: string;
  /** 是否为测试网模式 */
  sandbox: boolean;
  /** 期货 REST API 基础 URL */
  httpFutures: string;
  /** HTTP/HTTPS 代理地址（可选，如 http://host:port 或带认证的 http://user:pass@host:port） */
  proxy?: string;
  /** 请求时间窗口（毫秒），防重放攻击 */
  recvWindow: number;
  /** HTTP 请求超时时间（毫秒） */
  timeout: number;
}

/**
 * 获取 Binance 客户端原始配置
 *
 * @description
 * 根据 BINANCE_TESTNET 环境变量自动选择端点：
 * - testnet=true: 使用测试网端点（https://testnet.binancefuture.com）
 * - testnet=false: 使用主网端点（https://fapi.binance.com）
 *
 * 跨越大版本迁移变更：HTTP_FUTURES_BASE 对应
 * binance-api-node Init 参数中的 httpFutures。
 *
 * @returns Binance 客户端配置对象
 */
export function getBinanceConfig(): BinanceConfig {
  const testnet = process.env.BINANCE_TESTNET === 'true';
  return {
    apiKey: process.env.BINANCE_API_KEY || undefined,
    apiSecret: process.env.BINANCE_API_SECRET || undefined,
    sandbox: testnet,
    httpFutures:
      process.env.HTTP_FUTURES_BASE ||
      (testnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com'),
    proxy: process.env.HTTP_PROXY || undefined,
    recvWindow: 60000,
    timeout: 15000,
  };
}

/**
 * 判断是否为测试网模式
 *
 * @returns true 表示测试网，false 表示主网（真实资金）
 */
export function isTestnetEnabled(): boolean {
  return process.env.BINANCE_TESTNET === 'true';
}

/**
 * 判断是否配置了完整 API 认证信息
 *
 * @description
 * 只有当 API Key 和 API Secret **同时存在**时才返回 true。
 * 这是条件注册认证工具的核心判断逻辑 ——
 * 无 Key → 仅公开工具和指标；有 Key → 全部工具。
 *
 * @returns true 表示可以访问需要签名的私有 API
 */
export function hasApiCredentials(): boolean {
  return !!(process.env.BINANCE_API_KEY && process.env.BINANCE_API_SECRET);
}

/**
 * 获取 MCP 服务器元信息
 *
 * @returns 包含服务器名称和版本的元信息对象
 */
export function getServerInfo(): { name: string; version: string } {
  return {
    name: process.env.MCP_SERVER_NAME || 'binance-mcp-server',
    version: process.env.MCP_SERVER_VERSION || '2.0.1',
  };
}
