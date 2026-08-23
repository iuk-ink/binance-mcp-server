/**
 * 币安操作模块 — 账户服务（签名请求）
 *
 * 封装官方包 Account API：
 * - 余额 / 持仓 / 账户总览
 * - 逐币对费率 / 收支流水
 *
 * 响应字段由官方包字符串转换为 number 语义类型；
 * 超出 Number 安全整数范围的 ID 类字段（如 tranId）保留字符串防精度丢失。
 *
 * @module exchange/account
 */

import type {
  DerivativesTradingUsdsFutures,
  DerivativesTradingUsdsFuturesRestAPI,
} from "@binance/derivatives-trading-usds-futures";
import { createLogger, type LogMeta, type Logger } from "../utils/logger.js";
import { safeCall, withRecvWindow, type RestResponse } from "./request.js";
import type {
  AccountInfo,
  AssetBalance,
  CommissionRate,
  IncomeQueryParams,
  IncomeRecord,
  Position,
  PositionSide,
} from "./types.js";

/**
 * 账户服务
 *
 * @remarks 所有方法均为签名请求（USER_DATA 权限）。
 */
export class AccountService {
  /**
   * @param client     - 官方包客户端（由 getClient 提供）
   * @param recvWindow - 请求窗口 ms（未配置则不入参）
   * @param logger     - 日志记录器（缺省自建 exchange.account 子记录器）
   */
  constructor(
    private readonly client: DerivativesTradingUsdsFutures,
    private readonly recvWindow?: number,
    private readonly logger: Logger = createLogger({ name: "exchange" }).child({
      component: "account",
    }),
  ) {}

  /**
   * 获取资产余额列表
   *
   * @returns 所有资产的余额（含未实现盈亏）
   * @throws {ExchangeError} 鉴权失败或网络异常
   */
  async getBalances(): Promise<AssetBalance[]> {
    const data = await this.callLogged("查询资产余额失败", () =>
      this.client.restAPI.futuresAccountBalanceV3(this.withRecvWindow({})),
    );
    const balances = data.map((it) => ({
      asset: it.asset ?? "",
      balance: Number(it.balance ?? 0),
      availableBalance: Number(it.availableBalance ?? 0),
      crossWalletBalance: Number(it.crossWalletBalance ?? 0),
      unrealizedProfit: Number(it.crossUnPnl ?? 0),
    }));
    this.logger.debug("查询资产余额", { count: balances.length });
    return balances;
  }

  /**
   * 获取账户总览
   *
   * @returns 钱包余额 / 未实现盈亏 / 保证金等汇总
   * @throws {ExchangeError} 鉴权失败或网络异常
   */
  async getAccountInfo(): Promise<AccountInfo> {
    const data = await this.callLogged("查询账户信息失败", () =>
      this.client.restAPI.accountInformationV3(this.withRecvWindow({})),
    );
    const info = {
      totalWalletBalance: Number(data.totalWalletBalance ?? 0),
      totalUnrealizedProfit: Number(data.totalUnrealizedProfit ?? 0),
      totalMarginBalance: Number(data.totalMarginBalance ?? 0),
      availableBalance: Number(data.availableBalance ?? 0),
      totalPositionInitialMargin: Number(data.totalPositionInitialMargin ?? 0),
      totalOpenOrderInitialMargin: Number(data.totalOpenOrderInitialMargin ?? 0),
    };
    this.logger.debug("查询账户信息", {
      availableBalance: info.availableBalance,
    });
    return info;
  }

  /**
   * 获取持仓列表
   *
   * @param symbol - 交易对（缺省返回全部持仓）
   * @returns 持仓列表
   * @throws {ExchangeError} 鉴权失败或网络异常
   */
  async getPositions(symbol?: string): Promise<Position[]> {
    const data = await this.callLogged("查询持仓失败", () =>
      this.client.restAPI.positionInformationV3(this.withRecvWindow(symbol ? { symbol } : {})),
    );
    const positions = data.map((it) => ({
      symbol: it.symbol ?? "",
      positionSide: (it.positionSide ?? "BOTH") as PositionSide,
      positionAmt: Number(it.positionAmt ?? 0),
      entryPrice: Number(it.entryPrice ?? 0),
      markPrice: Number(it.markPrice ?? 0),
      unRealizedProfit: Number(it.unRealizedProfit ?? 0),
      liquidationPrice: Number(it.liquidationPrice ?? 0),
      // 官方类型声明缺失 marginType，但 API 实际返回，安全取值
      marginType: (it as { marginType?: string }).marginType ?? "",
      notional: Number(it.notional ?? 0),
      initialMargin: Number(it.initialMargin ?? 0),
      maintMargin: Number(it.maintMargin ?? 0),
      updateTime: Number(it.updateTime ?? 0),
    }));
    this.logger.debug("查询持仓", { count: positions.length, symbol: symbol ?? "all" });
    return positions;
  }

  /**
   * 查询逐币对用户费率
   *
   * 已含 VIP 等级折扣 + BNB 抵扣效果。
   *
   * @param symbol - 交易对
   * @returns 逐币对费率（taker / maker）
   * @throws {ExchangeError} 鉴权失败或网络异常
   */
  async getCommissionRate(symbol: string): Promise<CommissionRate> {
    const data = await this.callLogged(
      "查询费率失败",
      () =>
        this.client.restAPI.userCommissionRate({
          symbol,
          ...this.withRecvWindow({}),
        }),
      { symbol },
    );
    return {
      symbol,
      makerCommissionRate: Number(data.makerCommissionRate ?? 0),
      takerCommissionRate: Number(data.takerCommissionRate ?? 0),
    };
  }

  /**
   * 查询收支流水
   *
   * 资金费（FUNDING_FEE）/ 手续费（COMMISSION）/ 已实现盈亏（REALIZED_PNL）等。
   * income 负数=支出，正数=收入。
   *
   * @param params - 查询参数（symbol / incomeType / 时间范围 / limit）
   * @returns 流水记录数组
   * @throws {ExchangeError} 鉴权失败或网络异常
   */
  async getIncomeHistory(params: IncomeQueryParams): Promise<IncomeRecord[]> {
    const request: Record<string, unknown> = {};
    if (params.symbol) request.symbol = params.symbol;
    if (params.incomeType) request.incomeType = params.incomeType;
    if (params.startTime !== undefined) request.startTime = params.startTime;
    if (params.endTime !== undefined) request.endTime = params.endTime;
    if (params.limit !== undefined) request.limit = params.limit;
    Object.assign(request, this.withRecvWindow({}));

    const data = await this.callLogged("查询收支流水失败", () =>
      // 官方请求类型含字符串枚举字段，业务层以动态字段组装后按官方类型断言
      this.client.restAPI.getIncomeHistory(
        request as DerivativesTradingUsdsFuturesRestAPI.GetIncomeHistoryRequest,
      ),
    );
    return (Array.isArray(data) ? data : []).map((it) => ({
      symbol: it.symbol ?? null,
      incomeType: it.incomeType ?? "",
      income: Number(it.income ?? 0),
      asset: it.asset ?? null,
      time: Number(it.time ?? 0),
      // tranId 为 19 位大整数（官方返回 bigint），转字符串防精度丢失
      tranId: String(it.tranId ?? ""),
    }));
  }

  /**
   * 统一解包 REST 调用并在失败时记录告警后上抛
   *
   * @param logMessage - 失败告警文案
   * @param fn         - 返回 RestApiResponse 的调用
   * @param meta       - 可选的日志上下文（如 symbol）
   * @returns 解包后的业务数据
   * @throws {ExchangeError} 网络 / 服务端异常
   */
  private async callLogged<T>(
    logMessage: string,
    fn: () => Promise<RestResponse<T>>,
    meta: LogMeta = {},
  ): Promise<T> {
    try {
      return await safeCall(fn);
    } catch (err) {
      this.logger.warn(logMessage, {
        ...meta,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  /** 若配置了 recvWindow 则注入到请求参数（委托公共实现） */
  private withRecvWindow<T extends object>(params: T): T & { recvWindow?: number } {
    return withRecvWindow(params, this.recvWindow);
  }
}
