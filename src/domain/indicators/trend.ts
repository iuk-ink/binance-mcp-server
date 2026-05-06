/**
 * Binance MCP Server v2.0 — 趋势类技术指标工具 (13 个)
 * @module domain/indicators/trend
 */
import { SMA, EMA, DEMA, RMA, WMA, WSMA, SMA15, DMA, ADX, DX, PSAR, LinearRegression, VWAP } from 'trading-signals';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { logError } from '../../utils/error-handling.js';
import type { ToolDefinition } from '../../types/common.js';
import { roundValue } from './format.js';
import { SMAInput, EMAInput, DEMAInput, RMAInput, WMAInput, WSMAInput, SMA15Input, DMAInput, DXInput, ADXInput, PSARInput, LinRegInput, VWAPInput } from './schemas.js';

const ctors: Record<string, new (n: number) => { add(v: number): number | null; getResultOrThrow(): unknown }> = { EMA, RMA, SMA, WMA, WSMA };

function ok(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(roundValue(data), null, 2) }] };
}

function pickCtor(name?: string): new (n: number) => { add(v: number): number | null; getResultOrThrow(): unknown } {
  return ctors[name || 'EMA'] || EMA;
}

export const trendTools: ToolDefinition[] = [
  { name: 'indicator_sma', description: '简单移动平均线 (SMA)', schema: SMAInput, handler: async (a: unknown) => { const { values, interval } = a as { values: number[]; interval: number }; try { const i = new SMA(interval); for (const v of values) i.add(v); return ok({ indicator: 'SMA', interval, last: i.getResult() }); } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); } } },
  { name: 'indicator_ema', description: '指数移动平均线 (EMA)', schema: EMAInput, handler: async (a: unknown) => { const { values, interval } = a as { values: number[]; interval: number }; try { const i = new EMA(interval); for (const v of values) i.add(v); return ok({ indicator: 'EMA', interval, last: i.getResultOrThrow() }); } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); } } },
  { name: 'indicator_dema', description: '双指数移动平均线 (DEMA)', schema: DEMAInput, handler: async (a: unknown) => { const { values, interval } = a as { values: number[]; interval: number }; try { const i = new DEMA(interval); for (const v of values) i.add(v); return ok({ indicator: 'DEMA', interval, last: i.getResultOrThrow() }); } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); } } },
  { name: 'indicator_rma', description: '相对移动平均线 (RMA)', schema: RMAInput, handler: async (a: unknown) => { const { values, interval } = a as { values: number[]; interval: number }; try { const i = new RMA(interval); for (const v of values) i.add(v); return ok({ indicator: 'RMA', interval, last: i.getResultOrThrow() }); } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); } } },
  { name: 'indicator_wma', description: '加权移动平均线 (WMA)', schema: WMAInput, handler: async (a: unknown) => { const { values, interval } = a as { values: number[]; interval: number }; try { const i = new WMA(interval); for (const v of values) i.add(v); return ok({ indicator: 'WMA', interval, last: i.getResult() }); } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); } } },
  { name: 'indicator_wsma', description: "Wilder's 平滑移动平均线 (WSMA)", schema: WSMAInput, handler: async (a: unknown) => { const { values, interval } = a as { values: number[]; interval: number }; try { const i = new WSMA(interval); for (const v of values) i.add(v); return ok({ indicator: 'WSMA', interval, last: i.getResult() }); } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); } } },
  { name: 'indicator_sma15', description: "Spencer's 15点移动平均线 (SMA15)", schema: SMA15Input, handler: async (a: unknown) => { const { values } = a as { values: number[] }; try { const i = new (SMA15 as any)(15); for (const v of values) i.add(v); return ok({ indicator: 'SMA15', last: i.getResultOrThrow() }); } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); } } },
  {
    name: 'indicator_dma', description: '双均线 (DMA)', schema: DMAInput,
    handler: async (a: unknown) => {
      const { values, short, long, smoothingType } = a as { values: number[]; short: number; long: number; smoothingType?: string };
      try { const C = pickCtor(smoothingType); const i = new DMA(short, long, C as any); for (const v of values) i.add(v); return ok({ indicator: 'DMA', short, long, result: i.getResultOrThrow() as { long: number; short: number } }); }
      catch (e) { return ok({ error: true, message: (e as Error).message }); }
    },
  },
  {
    name: 'indicator_dx', description: '方向性运动指标 (DX)', schema: DXInput,
    handler: async (a: unknown) => {
      const { candles, interval, smoothingType } = a as { candles: { high: number; low: number; close: number }[]; interval: number; smoothingType?: string };
      try { const C = pickCtor(smoothingType); const i = new DX(interval, C as any); for (const c of candles) i.add(c); const ind = i as unknown as { mdi?: number; pdi?: number }; return ok({ indicator: 'DX', interval, value: i.getResultOrThrow(), pdi: ind.pdi, mdi: ind.mdi }); }
      catch (e) { return ok({ error: true, message: (e as Error).message }); }
    },
  },
  {
    name: 'indicator_adx', description: '平均趋向指数 (ADX)', schema: ADXInput,
    handler: async (a: unknown) => {
      const { candles, interval, smoothingType } = a as { candles: { high: number; low: number; close: number }[]; interval: number; smoothingType?: string };
      try { const C = pickCtor(smoothingType); const i = new ADX(interval, C as any); for (const c of candles) i.add(c); const ind = i as unknown as { pdi?: number; mdi?: number }; return ok({ indicator: 'ADX', interval, value: i.getResultOrThrow(), pdi: ind.pdi, mdi: ind.mdi }); }
      catch (e) { return ok({ error: true, message: (e as Error).message }); }
    },
  },
  {
    name: 'indicator_linreg', description: '线性回归 (Linear Regression)', schema: LinRegInput,
    handler: async (a: unknown) => {
      const { values, interval } = a as { values: number[]; interval: number };
      try { const i = new LinearRegression(interval); for (const v of values) i.add(v); return ok({ indicator: 'LinearRegression', interval, result: i.getResultOrThrow() as { prediction: number; slope: number; intercept: number } }); }
      catch (e) { return ok({ error: true, message: (e as Error).message }); }
    },
  },
  {
    name: 'indicator_psar', description: '抛物线 SAR (PSAR)', schema: PSARInput,
    handler: async (a: unknown) => {
      const { candles, accelerationStep, accelerationMax } = a as { candles: { high: number; low: number }[]; accelerationStep: number; accelerationMax: number };
      try { const i = new PSAR({ accelerationStep, accelerationMax }); let last: number | null = null; for (const c of candles) last = i.add(c); return ok({ indicator: 'PSAR', accelerationStep, accelerationMax, last }); }
      catch (e) { return ok({ error: true, message: (e as Error).message }); }
    },
  },
  {
    name: 'indicator_vwap', description: '成交量加权平均价 (VWAP)', schema: VWAPInput,
    handler: async (a: unknown) => {
      const { candles } = a as { candles: { open: number; high: number; low: number; close: number; volume: number }[] };
      try { const i = new VWAP(); for (const c of candles) i.add(c); return ok({ indicator: 'VWAP', last: i.getResultOrThrow() }); }
      catch (e) { return ok({ error: true, message: (e as Error).message }); }
    },
  },
];
