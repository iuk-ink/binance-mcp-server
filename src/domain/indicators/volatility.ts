/**
 * Binance MCP Server — 波动率类技术指标工具 (5 个)
 *
 * @module domain/indicators/volatility
 * @description
 * 基于 trading-signals 库的波动率/振幅指标封装。
 * ABands/ATR 内部支持可选平滑算法（默认 EMA），通过 ctors 映射表选择。
 */

import { AccelerationBands, ATR, BollingerBands, IQR, ZigZag, EMA, SMA } from 'trading-signals';
import type { ToolDefinition } from '../../types/common.js';
import { roundValue } from './format.js';
import { wrapHandler } from '../../utils/response.js';
import { ABandsInput, ATRInput, BBandsInput, IQRInput, ZigZagInput } from './schemas.js';

/** 平滑算法名称 → 构造函数映射，供 ABands/ATR 内部平滑选择用 */
const ctors: Record<string, unknown> = { EMA, SMA };

export const volatilityTools: ToolDefinition[] = [
  {
    name: 'indicator_abands', description: '加速带 (Acceleration Bands)。需要至少 interval 个数据点', schema: ABandsInput,
    handler: wrapHandler((args: { candles: { high: number; low: number; close: number }[]; interval: number; width: number; smoothingType?: string }) => {
      const i = new AccelerationBands(args.interval, args.width, (ctors[args.smoothingType || 'SMA'] || SMA) as any);
      let last = null;
      for (const c of args.candles) last = (i as unknown as { add(v: { high: number; low: number; close: number }): { lower: number; middle: number; upper: number } | null }).add(c);
      return roundValue({ indicator: 'ABANDS', interval: args.interval, width: args.width, result: last });
    }, 'indicator_abands'),
  },
  {
    name: 'indicator_atr', description: '平均真实范围 (ATR)。需要至少 interval 个数据点', schema: ATRInput,
    handler: wrapHandler((args: { candles: { high: number; low: number; close: number }[]; interval: number; smoothingType?: string }) => {
      const i = new ATR(args.interval, (ctors[args.smoothingType || 'EMA'] || EMA) as any);
      for (const c of args.candles) (i as unknown as { add(v: { high: number; low: number; close: number }): number | null }).add(c);
      return roundValue({ indicator: 'ATR', interval: args.interval, last: i.getResultOrThrow() });
    }, 'indicator_atr'),
  },
  {
    name: 'indicator_bbands', description: '布林带 (Bollinger Bands)。需要至少 interval+1 个数据点才能计算标准差', schema: BBandsInput,
    handler: wrapHandler((args: { values: number[]; interval: number; deviationMultiplier: number }) => {
      const i = new BollingerBands(args.interval, args.deviationMultiplier);
      let last: { lower: number; middle: number; upper: number } | null = null;
      for (const v of args.values) last = i.add(v);
      if (last === null) return { error: true, message: `BBANDS 数据不足，需要至少 ${args.interval + 1} 个数据点才能计算出标准差` };
      return roundValue({ indicator: 'BBANDS', interval: args.interval, deviationMultiplier: args.deviationMultiplier, result: last });
    }, 'indicator_bbands'),
  },
  {
    name: 'indicator_iqr', description: '四分位距 (IQR)。需要至少 interval 个数据点', schema: IQRInput,
    handler: wrapHandler((args: { values: number[]; interval: number }) => { const i = new IQR(args.interval); for (const v of args.values) i.add(v); return roundValue({ indicator: 'IQR', interval: args.interval, last: i.getResultOrThrow() }); }, 'indicator_iqr'),
  },
  {
    name: 'indicator_zigzag', description: 'Zig Zag 指标。需要至少 50 根 K 线才能检测到确认的转折点（不足会返回错误提示）', schema: ZigZagInput,
    handler: wrapHandler((args: { candles: { high: number; low: number }[]; deviation: number }) => {
      const i = new ZigZag({ deviation: args.deviation });
      let last: number | null = null;
      for (const c of args.candles) last = i.add(c);
      if (last === null) return { error: true, message: `ZigZag 数据不足，当前 ${args.candles.length} 根 K 线中未检测到确认的转折点（通常需要 50+ 根）` };
      return roundValue({ indicator: 'ZigZag', deviation: args.deviation, last });
    }, 'indicator_zigzag'),
  },
];
