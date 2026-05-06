#!/usr/bin/env node

/**
 * Binance MCP Server v2.0 — 冒烟测试
 *
 * 验证：
 * 1. 配置加载正常
 * 2. McpServer 创建正常
 * 3. 工具列表注册正确
 * 4. 指标工具可独立创建
 */

import { createServer } from '../src/server.js';
import { createIndicatorTools } from '../src/domain/indicators/index.js';
import { createFuturesPublicTools } from '../src/domain/futures/public.js';
import { createFuturesAuthenticatedTools } from '../src/domain/futures/authenticated.js';
import { logger } from '../src/utils/logger.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
    console.error(`  ✅ ${message}`);
  } else {
    failed++;
    console.error(`  ❌ ${message}`);
  }
}

async function main(): Promise<void> {
  console.error('\n========== Binance MCP Server v2.0 冒烟测试 ==========\n');

  // ----- 测试 1: 指标工具独立创建 -----
  console.error('--- 测试 1: 指标工具创建 ---');
  const indicatorTools = createIndicatorTools();
  assert(indicatorTools.length === 44, `指标工具数 = ${indicatorTools.length}（期望 44）`);
  const indicatorNames = indicatorTools.map(t => t.name);
  assert(indicatorNames.includes('indicator_sma'), '包含 indicator_sma');
  assert(indicatorNames.includes('indicator_rsi'), '包含 indicator_rsi');
  assert(indicatorNames.includes('indicator_bbands'), '包含 indicator_bbands');
  assert(indicatorNames.includes('util_average'), '包含 util_average');
  const findIndicator = (name: string) => indicatorTools.find(t => t.name === name)!;

  // ----- 测试 2: 期货公开工具创建（需 mock client）-----
  console.error('--- 测试 2: 期货公开工具创建 ---');
  const mockClient = {
    futuresPing: async () => ({}),
    futuresTime: async () => Date.now(),
    futuresExchangeInfo: async () => ({}),
    futuresBook: async () => ({ bids: [], asks: [], lastUpdateId: 0 }),
    futuresCandles: async () => [],
    futuresAggTrades: async () => [],
    futuresTrades: async () => [],
    futuresDailyStats: async () => [],
    futuresPrices: async () => [],
    futuresAllBookTickers: async () => [],
    futuresMarkPrice: async () => [],
  };
  const publicTools = createFuturesPublicTools(mockClient);
  assert(publicTools.length === 11, `公开工具数 = ${publicTools.length}（期望 11）`);
  const publicNames = publicTools.map(t => t.name);
  assert(publicNames.includes('futures_ping'), '包含 futures_ping');
  assert(publicNames.includes('futures_klines'), '包含 futures_klines');
  assert(publicNames.includes('futures_time'), '包含 futures_time');
  assert(publicNames.includes('futures_orderbook'), '包含 futures_orderbook');
  assert(publicNames.includes('futures_prices'), '包含 futures_prices');

  // ----- 测试 3: 期货认证工具创建（需 mock client）-----
  console.error('--- 测试 3: 期货认证工具创建 ---');
  const authClient = {
    futuresAccountBalance: async () => [{ asset: 'USDT', balance: '10000' }],
    futuresIncome: async () => [],
    futuresUserTrades: async () => [],
    futuresLeverage: async () => ({ leverage: 20 }),
    futuresMarginType: async () => ({ code: 200 }),
    futuresPositionMargin: async () => ({ code: 200 }),
    futuresMarginHistory: async () => [],
    futuresLeverageBracket: async () => [],
    futuresOrder: async () => ({ orderId: 1 }),
    futuresUpdateOrder: async () => ({ orderId: 1 }),
    futuresGetOrder: async () => ({ orderId: 1, status: 'NEW' }),
    futuresAllOrders: async () => [],
    futuresBatchOrders: async () => [],
    futuresCancelBatchOrders: async () => [],
    futuresCancelOrder: async () => ({ status: 'CANCELED' }),
    futuresCancelAllOpenOrders: async () => [],
    futuresOpenOrders: async () => [],
  };
  const authTools = createFuturesAuthenticatedTools(authClient);
  assert(authTools.length === 17, `认证工具数 = ${authTools.length}（期望 17）`);
  assert(authTools[0].name === 'futures_account_balance', '包含 futures_account_balance');
  assert(authTools.some((t: any) => t.name === 'futures_cancel_order'), '包含 futures_cancel_order');
  assert(authTools.some((t: any) => t.name === 'futures_open_orders'), '包含 futures_open_orders');

  // ----- 测试 4: 工具 handler 基本可调用（不抛异常）-----
  console.error('--- 测试 4: 工具 handler 执行 ---');
  try {
    // 测试 ping
    const pingResult = await publicTools[0].handler(undefined);
    assert(pingResult !== undefined, 'futures_ping handler 返回结果');
    assert(
      Array.isArray((pingResult as { content: unknown[] }).content),
      'futures_ping 返回 content 数组',
    );

    // 测试 SMA
    const smaResult = await findIndicator('indicator_sma').handler({
      values: [10, 20, 30, 40, 50],
      interval: 3,
    });
    const smaData = JSON.parse(
      ((smaResult as { content: { text: string }[] }).content[0]).text,
    );
    assert(smaData.indicator === 'SMA', 'SMA 返回正确的 indicator 名');
    assert(Array.isArray(smaData.values), 'SMA 返回 values 数组');
    assert(smaData.values.length > 0, 'SMA 返回非空结果');

    // 测试 RSI
    const rsiResult = await findIndicator('indicator_rsi').handler({
      values: [45, 46, 47, 48, 47, 46, 45, 44, 43, 44, 45, 46, 47, 48, 49, 50],
      interval: 14,
    });
    const rsiData = JSON.parse(
      ((rsiResult as { content: { text: string }[] }).content[0]).text,
    );
    assert(rsiData.indicator === 'RSI', 'RSI 返回正确的 indicator 名');
    assert(typeof rsiData.value === 'number', 'RSI 返回数值结果');
    assert(typeof rsiData.signal === 'object', 'RSI 返回交易信号');

    // 测试 BBANDS
    const bbResult = await findIndicator('indicator_bbands').handler({
      values: [10, 12, 11, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22],
      interval: 5,
      deviationMultiplier: 2,
    });
    const bbData = JSON.parse(
      ((bbResult as { content: { text: string }[] }).content[0]).text,
    );
    assert(bbData.indicator === 'BBANDS', 'BBANDS 返回正确的 indicator 名');
    assert(typeof bbData.result?.lower === 'number', 'BBANDS 返回 lower');
    assert(typeof bbData.result?.upper === 'number', 'BBANDS 返回 upper');

    // 测试 Average
    const avgResult = await findIndicator('util_average').handler({
      values: [10, 20, 30, 40, 50],
    });
    const avgData = JSON.parse(
      ((avgResult as { content: { text: string }[] }).content[0]).text,
    );
    assert(avgData.result === 30, 'Average 计算正确（30）');

    console.error('  ✅ 所有 handler 执行无异常');
    passed++;
  } catch (e) {
    failed++;
    console.error(`  ❌ handler 执行异常: ${(e as Error).message}`);
  }

  // ----- 测试 5: 错误处理验证 -----
  console.error('--- 测试 5: 错误处理 ---');
  try {
    // SMA 输入不足（interval > 数据量）应不抛异常
    const smaShort = await findIndicator('indicator_sma').handler({
      values: [10],
      interval: 100,
    });
    const smaShortData = JSON.parse(
      ((smaShort as { content: { text: string }[] }).content[0]).text,
    );
    // 没有足够数据时 values 应为空数组，last 为 null
    const hasValues = smaShortData.values !== undefined;
    assert(hasValues, 'SMA 小数据不抛异常，正常返回');
  } catch (e) {
    assert(false, `SMA 不应抛异常: ${(e as Error).message}`);
  }

  // ----- 测试 6: McpServer 创建验证 -----
  console.error('--- 测试 6: McpServer 创建 ---');
  try {
    const mcpServer = await createServer();
    assert(mcpServer !== undefined, 'McpServer 创建成功');
    assert(typeof mcpServer.server !== 'undefined', '底层 Server 实例可访问');
  } catch (e) {
    failed++;
    console.error(`  ❌ McpServer 创建失败: ${(e as Error).message}`);
  }

  // ----- 结果汇总 -----
  console.error('\n========== 结果汇总 ==========');
  console.error(`  通过: ${passed}`);
  console.error(`  失败: ${failed}`);
  console.error(`  总计: ${passed + failed}`);
  console.error('================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  logger.error('冒烟测试失败', error);
  process.exit(1);
});
