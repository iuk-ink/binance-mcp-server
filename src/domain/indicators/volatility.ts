/**
 * Binance MCP Server v2.0 — 波动率类技术指标工具 (8 个)
 * @module domain/indicators/volatility
 */
import { AccelerationBands, ATR, BollingerBands, BollingerBandsWidth, IQR, MAD, TR, ZigZag, EMA, SMA } from 'trading-signals';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { logError } from '../../utils/error-handling.js';
import type { ToolDefinition } from '../../types/common.js';
import { roundValue } from './format.js';
import { ABandsInput, ATRInput, BBandsInput, BBWInput, IQRInput, MADInput, TRInput, ZigZagInput } from './schemas.js';

const ctors: Record<string, unknown> = { EMA, SMA };

function ok(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(roundValue(data), null, 2) }] };
}

export const volatilityTools: ToolDefinition[] = [
  {
    name: 'indicator_abands', description: '加速带 (Acceleration Bands)', schema: ABandsInput,
    handler: async (a: unknown) => { const { candles, interval, width, smoothingType } = a as { candles: { high: number; low: number; close: number }[]; interval: number; width: number; smoothingType?: string }; try { const i = new AccelerationBands(interval, width, (ctors[smoothingType || 'SMA'] || SMA) as any); let last = null; for (const c of candles) last = (i as unknown as { add(v: { high: number; low: number; close: number }): { lower: number; middle: number; upper: number } | null }).add(c); return ok({ indicator: 'ABANDS', interval, width, result: last }); } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); } }
  },
  {
    name: 'indicator_atr', description: '平均真实范围 (ATR)', schema: ATRInput,
    handler: async (a: unknown) => { const { candles, interval, smoothingType } = a as { candles: { high: number; low: number; close: number }[]; interval: number; smoothingType?: string }; try { const i = new ATR(interval, (ctors[smoothingType || 'EMA'] || EMA) as any); for (const c of candles) (i as unknown as { add(v: { high: number; low: number; close: number }): number | null }).add(c); return ok({ indicator: 'ATR', interval, last: i.getResultOrThrow() }); } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); } }
  },
  {
    name: 'indicator_bbands', description: '布林带 (Bollinger Bands)', schema: BBandsInput,
    handler: async (a: unknown) => { const { values, interval, deviationMultiplier } = a as { values: number[]; interval: number; deviationMultiplier: number }; try { const i = new BollingerBands(interval, deviationMultiplier); let last: { lower: number; middle: number; upper: number } | null = null; for (const v of values) last = i.add(v); if (last === null) return ok({ error: true, message: `BBANDS 数据不足，需要至少 ${interval + 1} 个数据点才能计算出标准差` }); return ok({ indicator: 'BBANDS', interval, deviationMultiplier, result: last }); } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); } }
  },
  {
    name: 'indicator_bbw', description: '布林带宽度 (Bollinger Bands Width)', schema: BBWInput,
    handler: async (a: unknown) => { const { values, interval, deviationMultiplier } = a as { values: number[]; interval: number; deviationMultiplier: number }; try { const bb = new BollingerBands(interval, deviationMultiplier); const i = new BollingerBandsWidth(bb); let last: number | null = null; for (const v of values) { bb.add(v); const r = i.add(v); if (r !== null) last = r; } return ok({ indicator: 'BBW', interval, deviationMultiplier, last }); } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); } }
  },
  {
    name: 'indicator_iqr', description: '四分位距 (IQR)', schema: IQRInput,
    handler: async (a: unknown) => { const { values, interval } = a as { values: number[]; interval: number }; try { const i = new IQR(interval); for (const v of values) i.add(v); return ok({ indicator: 'IQR', interval, last: i.getResultOrThrow() }); } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); } }
  },
  {
    name: 'indicator_mad', description: '平均绝对偏差 (MAD)', schema: MADInput,
    handler: async (a: unknown) => { const { values, interval } = a as { values: number[]; interval: number }; try { const i = new MAD(interval); for (const v of values) i.add(v); return ok({ indicator: 'MAD', interval, last: i.getResultOrThrow() }); } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); } }
  },
  {
    name: 'indicator_tr', description: '真实范围 (True Range)', schema: TRInput,
    handler: async (a: unknown) => { const { candles } = a as { candles: { high: number; low: number; close: number }[] }; try { const i = new TR(); for (const c of candles) i.add(c); return ok({ indicator: 'TR', last: i.getResultOrThrow() }); } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); } }
  },
  {
    name: 'indicator_zigzag', description: 'Zig Zag 指标', schema: ZigZagInput,
    handler: async (a: unknown) => { const { candles, deviation } = a as { candles: { high: number; low: number }[]; deviation: number }; try { const i = new ZigZag({ deviation }); let last: number | null = null; for (const c of candles) last = i.add(c); if (last === null) return ok({ error: true, message: `ZigZag 数据不足，当前 ${candles.length} 根 K 线中未检测到确认的转折点（通常需要 50+ 根）` }); return ok({ indicator: 'ZigZag', deviation, last }); } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); } }
  },
];
