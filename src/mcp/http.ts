/**
 * MCP 装配层 — Streamable HTTP 传输
 *
 * 基于 v2 SDK 官方推荐架构（createMcpHandler + toNodeHandler）：
 * - 无手写会话管理：现代协议每请求一次性交换，legacy 流量由 SDK 以
 *   stateless 模式服务，会话语义全部内建于 handler
 * - 每请求经工厂创建轻量 McpServer 壳，重资源层（客户端 / 行情缓存）
 *   进程级共享——缓存跨请求存活，等价于常驻服务进程
 * - responseMode auto：默认单 JSON 响应，仅当交换需要流式时升级 SSE
 *
 * 分层安全（先后有序）：Host 头守卫（DNS rebinding 防护）→ Bearer 令牌认证
 * → MCP handler；/health 探活端点置于认证前（仅暴露非敏感运行信息）。
 *
 * @module mcp/http
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { createMcpHandler } from "@modelcontextprotocol/server";
import {
  hostHeaderValidation,
  localhostHostValidation,
  toNodeHandler,
} from "@modelcontextprotocol/node";
import { loadConfig } from "../config/index.js";
import { isLocalhostBind } from "../config/schema.js";
import { createLogger } from "../utils/logger.js";
import { buildServer, buildServices } from "./server.js";

/** 优雅关闭兜底超时（毫秒）：超时后强制完成 close，防悬挂连接阻塞退出 */
const CLOSE_TIMEOUT_MS = 3_000;

/**
 * 写 401 拒绝响应（无效 / 缺失令牌共用的终止路径）
 *
 * @param res - Node 响应
 */
function rejectUnauthorized(res: ServerResponse): void {
  res.writeHead(401, {
    "content-type": "application/json",
    "www-authenticate": 'Bearer realm="mcp"',
  });
  res.end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32001, message: "无效或缺失的 Bearer 令牌（Authorization: Bearer <token>）" },
      id: null,
    }),
  );
}

/**
 * Bearer 令牌校验（timingSafeEqual 防时序探测）
 *
 * 未配置令牌（localhost 绑定默认）时全放行；令牌长度不一致直接拒绝
 * （长度本身不是秘密，无需恒定时间比较）。
 *
 * 认证方案前缀按 HTTP 规范（RFC 6750 / RFC 7235）大小写不敏感：
 * 仅对剥离前缀后的令牌本体做字节级比较。
 *
 * @param req   - Node 请求（读取 Authorization 头）
 * @param res   - Node 响应（失败时写 401）
 * @param token - 配置的期望令牌；空串表示未启用认证
 * @returns 是否放行
 */
function authorize(req: IncomingMessage, res: ServerResponse, token: string): boolean {
  if (token === "") return true;
  const authHeader = req.headers.authorization ?? "";
  // 前缀缺失或格式非法时直接拒绝，令牌本体比较交由恒定时间路径处理
  if (!/^Bearer\s+/i.test(authHeader)) {
    rejectUnauthorized(res);
    return false;
  }
  const actual = Buffer.from(authHeader.replace(/^Bearer\s+/i, ""));
  const expected = Buffer.from(token);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    rejectUnauthorized(res);
    return false;
  }
  return true;
}

/** createHttpMcpServer 可注入的覆盖项（测试用） */
export interface HttpMcpServerOptions {
  /** 监听端口覆盖（缺省取配置值；0 表示随机端口，测试用） */
  port?: number;
}

/**
 * 创建 Streamable HTTP MCP 服务器
 *
 * @param options - 可选覆盖项（测试注入用）
 * @returns 含 start / close / address 的服务器句柄
 */
export function createHttpMcpServer(options: HttpMcpServerOptions = {}): {
  start: () => Promise<void>;
  close: () => Promise<void>;
  address: () => { host: string; port: number };
} {
  const config = loadConfig();
  const { host, allowedHosts, token } = config.transport.http;
  const port = options.port ?? config.transport.http.port;
  const log = createLogger({ name: "mcp-http", level: config.logLevel });

  // 重资源层进程级共享：行情两极缓存跨请求复用
  const services = buildServices();

  // MCP 核心：每请求由工厂创建轻量实例，会话/协议分派内建于 handler
  const handler = createMcpHandler(() => buildServer(services), {
    responseMode: "auto",
    onerror: (error) => log.warn("MCP handler 错误", { error: error.message }),
  });
  const handleMcp = toNodeHandler(handler, {
    onerror: (error) => log.warn("请求适配错误", { error: error.message }),
  });

  /** Host 守卫：localhost 绑定用 SDK 便捷守卫；对外绑定用白名单守卫 */
  const validateHost = isLocalhostBind(host)
    ? localhostHostValidation()
    : hostHeaderValidation(allowedHosts);

  const server: Server = createServer((req, res) => {
    // DNS rebinding 防护：守卫失败时已代答 403
    if (!validateHost(req, res)) return;

    // 探活端点：认证前放行，仅暴露非敏感运行信息
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, uptime: Math.floor(process.uptime()) }));
      return;
    }

    if (req.url !== "/mcp") {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32601, message: `未知路径 ${req.url ?? ""}（仅支持 /mcp 与 /health）` },
          id: null,
        }),
      );
      return;
    }

    if (!authorize(req, res, token)) return;

    void handleMcp(req, res);
  });

  return {
    /** 开始监听（端口占用等启动错误直接抛出，fail-fast） */
    start: () =>
      new Promise<void>((resolve, reject) => {
        server.once("error", (error: NodeJS.ErrnoException) => {
          if (error.code === "EADDRINUSE") {
            reject(new Error(`端口 ${port} 已被占用，请检查 MCP_HTTP_PORT 配置`));
          } else {
            reject(error);
          }
        });
        server.listen(port, host, () => {
          server.removeAllListeners("error");
          server.on("error", (error) => log.error("HTTP 服务器异常", { error: error.message }));
          log.info("Streamable HTTP 传输就绪", {
            endpoint: `http://${host}:${(server.address() as { port: number }).port}/mcp`,
            auth: token !== "" ? "Bearer" : "无（本机绑定）",
          });
          resolve();
        });
      }),

    /** 实际监听地址（随机端口时 start 后调用才有意义） */
    address: () => {
      const addr = server.address() as { address: string; port: number } | null;
      return { host: addr?.address ?? host, port: addr?.port ?? port };
    },

    /** 优雅关闭：先关 MCP handler（终止在途交换），再关 HTTP 监听，超时强制完成 */
    close: () =>
      new Promise<void>((resolve) => {
        // finish 幂等：正常完成与兜底超时谁先到谁生效，后到者直接忽略并清理 timer
        let finished = false;
        const finish = (): void => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          resolve();
        };
        const timer = setTimeout(finish, CLOSE_TIMEOUT_MS);
        void (async () => {
          await handler.close().catch(() => undefined);
          server.close(finish);
        })();
      }),
  };
}
