/**
 * Binance MCP Server — 趋势类技术指标工具 (12 个)
 *
 * @module domain/indicators/trend
 * @description
 * 基于 trading-signals 库的趋势类指标封装。
 *
 * 取值方式差异说明：
 * - SMA/WMA/WSMA 的前 N-1 次 add() 返回 null（无足够数据），使用 getResult() 取 last
 * - EMA/DEMA/RMA 的内部平滑有回退逻辑，数据足够后用 getResultOrThrow() 确保非空
 * - DMA/DX/ADX/PSAR 等复合指标同样使用 getResultOrThrow()
 */

import { SMA, EMA, DEMA, RMA, WMA, WSMA, DMA, ADX, DX, PSAR, LinearRegression, VWAP } from 'trading-signals';
import type { ToolDefinition } from '../../types/common.js';
import { roundValue } from './format.js';
import { wrapHandler } from '../../utils/response.js';
import { SMAInput, EMAInput, DEMAInput, RMAInput, WMAInput, WSMAInput, DMAInput, DXInput, ADXInput, PSARInput, LinRegInput, VWAPInput } from './schemas.js';

/** 平滑算法名称 → 构造函数映射，供 DMA/DX/ADX 的内部平滑选择用 */
const ctors: Record<string, new (n: number) => { add(v: number): number | null; getResultOrThrow(): unknown }> = { EMA, RMA, SMA, WMA, WSMA };

/**
 * 根据平滑类型名称查找对应的构造函数
 *
 * @description
 * 从 ctors 映射表中查找对应平滑算法（EMA/RMA/SMA/WMA/WSMA）的构造函数。
 * 未传入或传入未知名称时默认回退到 EMA。
 *
 * @param name - 平滑类型名称，可选。不传默认 'EMA'
 * @returns 对应的构造函数
 */
function pickCtor(name?: string): new (n: number) => { add(v: number): number | null; getResultOrThrow(): unknown } {
  return ctors[name || 'EMA'] || EMA;
}

export const trendTools: ToolDefinition[] = [
  { name: 'indicator_sma', description: '简单移动平均线 (SMA)。需要至少 interval 个数据点', schema: SMAInput, handler: wrapHandler((args: { values: number[]; interval: number }) => { const i = new SMA(args.interval); for (const v of args.values) i.add(v); return roundValue({ indicator: 'SMA', interval: args.interval, last: i.getResult() }); }, 'indicator_sma') },
  { name: 'indicator_ema', description: '指数移动平均线 (EMA)。需要至少 interval 个数据点', schema: EMAInput, handler: wrapHandler((args: { values: number[]; interval: number }) => { const i = new EMA(args.interval); for (const v of args.values) i.add(v); return roundValue({ indicator: 'EMA', interval: args.interval, last: i.getResultOrThrow() }); }, 'indicator_ema') },
  { name: 'indicator_dema', description: '双指数移动平均线 (DEMA)。需要至少 interval 个数据点', schema: DEMAInput, handler: wrapHandler((args: { values: number[]; interval: number }) => { const i = new DEMA(args.interval); for (const v of args.values) i.add(v); return roundValue({ indicator: 'DEMA', interval: args.interval, last: i.getResultOrThrow() }); }, 'indicator_dema') },
  { name: 'indicator_rma', description: '相对移动平均线 (RMA)。需要至少 interval 个数据点', schema: RMAInput, handler: wrapHandler((args: { values: number[]; interval: number }) => { const i = new RMA(args.interval); for (const v of args.values) i.add(v); return roundValue({ indicator: 'RMA', interval: args.interval, last: i.getResultOrThrow() }); }, 'indicator_rma') },
  { name: 'indicator_wma', description: '加权移动平均线 (WMA)。需要至少 interval 个数据点', schema: WMAInput, handler: wrapHandler((args: { values: number[]; interval: number }) => { const i = new WMA(args.interval); for (const v of args.values) i.add(v); return roundValue({ indicator: 'WMA', interval: args.interval, last: i.getResult() }); }, 'indicator_wma') },
  { name: 'indicator_wsma', description: "Wilder's 平滑移动平均线 (WSMA)。需要至少 interval 个数据点", schema: WSMAInput, handler: wrapHandler((args: { values: number[]; interval: number }) => { const i = new WSMA(args.interval); for (const v of args.values) i.add(v); return roundValue({ indicator: 'WSMA', interval: args.interval, last: i.getResult() }); }, 'indicator_wsma') },

  {
    name: 'indicator_dma', description: '双均线 (DMA)。需要至少 max(short, long) 个数据点', schema: DMAInput,
    handler: wrapHandler((args: { values: number[]; short: number; long: number; smoothingType?: string }) => {
      const C = pickCtor(args.smoothingType);
      const i = new DMA(args.short, args.long, C as any);
      for (const v of args.values) i.add(v);
      return roundValue({ indicator: 'DMA', short: args.short, long: args.long, result: i.getResultOrThrow() as { long: number; short: number } });
    }, 'indicator_dma'),
  },
  {
    name: 'indicator_dx', description: '方向性运动指标 (DX)。需要至少 2×interval 个数据点（如 interval=14 则需 ~27 个）', schema: DXInput,
    handler: wrapHandler((args: { candles: { high: number; low: number; close: number }[]; interval: number; smoothingType?: string }) => {
      const C = pickCtor(args.smoothingType);
      const i = new DX(args.interval, C as any);
      for (const c of args.candles) i.add(c);
      const ind = i as unknown as { mdi?: number; pdi?: number };
      return roundValue({ indicator: 'DX', interval: args.interval, value: i.getResultOrThrow(), pdi: ind.pdi, mdi: ind.mdi });
    }, 'indicator_dx'),
  },
  {
    name: 'indicator_adx', description: '平均趋向指数 (ADX)。需要至少 2×interval 个数据点（如 interval=14 则需 ~27 个，不足会返回错误）', schema: ADXInput,
    handler: wrapHandler((args: { candles: { high: number; low: number; close: number }[]; interval: number; smoothingType?: string }) => {
      const C = pickCtor(args.smoothingType);
      const i = new ADX(args.interval, C as any);
      for (const c of args.candles) i.add(c);
      const ind = i as unknown as { pdi?: number; mdi?: number };
      return roundValue({ indicator: 'ADX', interval: args.interval, value: i.getResultOrThrow(), pdi: ind.pdi, mdi: ind.mdi });
    }, 'indicator_adx'),
  },
  {
    name: 'indicator_linreg', description: '线性回归 (Linear Regression)。需要至少 interval 个数据点', schema: LinRegInput,
    handler: wrapHandler((args: { values: number[]; interval: number }) => {
      const i = new LinearRegression(args.interval);
      for (const v of args.values) i.add(v);
      return roundValue({ indicator: 'LinearRegression', interval: args.interval, result: i.getResultOrThrow() as { prediction: number; slope: number; intercept: number } });
    }, 'indicator_linreg'),
  },
  {
    name: 'indicator_psar', description: '抛物线 SAR (PSAR)。建议至少 4 根 K 线，更多数据效果更好', schema: PSARInput,
    handler: wrapHandler((args: { candles: { high: number; low: number }[]; accelerationStep: number; accelerationMax: number }) => {
      const i = new PSAR({ accelerationStep: args.accelerationStep, accelerationMax: args.accelerationMax });
      let last: number | null = null;
      for (const c of args.candles) last = i.add(c);
      return roundValue({ indicator: 'PSAR', accelerationStep: args.accelerationStep, accelerationMax: args.accelerationMax, last });
    }, 'indicator_psar'),
  },
  {
    name: 'indicator_vwap', description: '成交量加权平均价 (VWAP)。从第一根 K 线即开始计算', schema: VWAPInput,
    handler: wrapHandler((args: { candles: { open: number; high: number; low: number; close: number; volume: number }[] }) => {
      const i = new VWAP();
      for (const c of args.candles) i.add(c);
      return roundValue({ indicator: 'VWAP', last: i.getResultOrThrow() });
    }, 'indicator_vwap'),
  },
];
