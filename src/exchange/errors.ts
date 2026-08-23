/**
 * 币安操作模块 — 错误定义与归一化
 *
 * 官方包从顶层导出全部错误类，本模块采用「instanceof 优先 + name 兜底」
 * 双重策略分类，确保各类错误均能归类。
 *
 * @module exchange/errors
 */

import {
  BadRequestError,
  ConnectorClientError,
  ForbiddenError,
  NetworkError,
  NotFoundError,
  RateLimitBanError,
  RequiredError,
  ServerError,
  TooManyRequestsError,
  UnauthorizedError,
} from "@binance/derivatives-trading-usds-futures";
import { BINANCE_ERROR_CODE_BACKEND_TIMEOUT } from "../constants/index.js";

// ============================================================================
//  类型与常量
// ============================================================================

/** 错误分类（上层可据此做差异化处理） */
export type ExchangeErrorKind =
  | "INVALID_PARAMS"   // 请求参数非法（含过滤器不满足）
  | "UNAUTHORIZED"     // 鉴权失败 / 无权限
  | "RATE_LIMITED"     // 触发限频或 IP 封禁
  | "SERVER_ERROR"     // 服务端 5xx
  | "NETWORK"          // 网络异常 / 超时
  | "NOT_FOUND"        // 资源不存在
  | "UNKNOWN";         // 兜底

/** name → kind 的映射表（instanceof 之外的兜底） */
const NAME_TO_KIND: Readonly<Record<string, ExchangeErrorKind>> = {
  RequiredError: "INVALID_PARAMS",
  ConnectorClientError: "INVALID_PARAMS",
  BadRequestError: "INVALID_PARAMS",
  UnauthorizedError: "UNAUTHORIZED",
  ForbiddenError: "UNAUTHORIZED",
  TooManyRequestsError: "RATE_LIMITED",
  RateLimitBanError: "RATE_LIMITED",
  ServerError: "SERVER_ERROR",
  NetworkError: "NETWORK",
  NotFoundError: "NOT_FOUND",
};

/** 判定为可重试的 kind 集合 */
const RETRYABLE_KINDS: ReadonlySet<ExchangeErrorKind> = new Set([
  "RATE_LIMITED",
  "SERVER_ERROR",
  "NETWORK",
]);

// ============================================================================
//  统一异常类
// ============================================================================

/**
 * 统一交易所异常
 *
 * 所有从官方包抛出的错误经 {@link fromConnectorError} 归一化后，
 * 以本类型上抛给调用方。
 */
export class ExchangeError extends Error {
  /** 官方包错误码（存在时） */
  readonly code?: number;
  /** 分类枚举 */
  readonly kind: ExchangeErrorKind;
  /** 是否建议重试 */
  readonly retryable: boolean;
  /** 原始错误对象（仅调试用） */
  readonly raw: unknown;

  constructor(
    message: string,
    kind: ExchangeErrorKind,
    options?: { code?: number; raw?: unknown },
  ) {
    super(message);
    this.name = "ExchangeError";
    this.kind = kind;
    this.retryable = RETRYABLE_KINDS.has(kind);
    this.code = options?.code;
    this.raw = options?.raw ?? null;
  }
}

// ============================================================================
//  公开函数
// ============================================================================

/**
 * 判断是否为已归一化的 ExchangeError
 *
 * @param err - 待判断对象
 * @returns true 表示已是 ExchangeError
 */
export function isExchangeError(err: unknown): err is ExchangeError {
  return err instanceof ExchangeError;
}

/**
 * 直接构造一个 ExchangeError（用于本地校验失败场景）
 *
 * @param message - 错误信息
 * @param kind    - 错误分类（默认 INVALID_PARAMS）
 * @returns 构造完成的 ExchangeError
 */
export function makeExchangeError(
  message: string,
  kind: ExchangeErrorKind = "INVALID_PARAMS",
): ExchangeError {
  return new ExchangeError(message, kind);
}

/**
 * 从官方包抛出的原始错误归一化为 {@link ExchangeError}
 *
 * 分类逻辑：
 * 1. 已是 ExchangeError → 原样返回（幂等）
 * 2. 币安错误码 -1007（后端超时）→ SERVER_ERROR（虽经 HTTP 400 返回，语义为服务端故障）
 * 3. instanceof 精确匹配已导出的错误类
 * 4. 依据错误 name 映射兜底
 * 5. 兜底按 UNKNOWN 处理
 *
 * @param err - 捕获到的原始错误
 * @returns 归一化后的 ExchangeError
 */
export function fromConnectorError(err: unknown): ExchangeError {
  if (isExchangeError(err)) return err;

  if (!(err instanceof Error)) {
    return new ExchangeError(`未知错误：${String(err)}`, "UNKNOWN", { raw: err });
  }

  const code = (err as { code?: number }).code;

  let kind: ExchangeErrorKind;
  if (code === BINANCE_ERROR_CODE_BACKEND_TIMEOUT) {
    kind = "SERVER_ERROR";
  } else if (err instanceof RequiredError || err instanceof BadRequestError || err instanceof ConnectorClientError) {
    kind = "INVALID_PARAMS";
  } else if (err instanceof UnauthorizedError || err instanceof ForbiddenError) {
    kind = "UNAUTHORIZED";
  } else if (err instanceof TooManyRequestsError || err instanceof RateLimitBanError) {
    kind = "RATE_LIMITED";
  } else if (err instanceof ServerError) {
    kind = "SERVER_ERROR";
  } else if (err instanceof NetworkError) {
    kind = "NETWORK";
  } else if (err instanceof NotFoundError) {
    kind = "NOT_FOUND";
  } else {
    // 其余异常类未从包顶层导出，按类名匹配
    kind = NAME_TO_KIND[err.name] ?? "UNKNOWN";
  }

  return new ExchangeError(err.message, kind, { code, raw: err });
}
