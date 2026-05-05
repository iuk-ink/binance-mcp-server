# Binance MCP Server

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-≥18-green)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-blue)](https://www.typescriptlang.org/)
[![MCP SDK](https://img.shields.io/badge/MCP_SDK-1.29-purple)](https://modelcontextprotocol.io/)

🌐 **Language:** [English](README.en.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [简体中文](../README.md)

Model Context Protocol (MCP) 기반의 **Binance 선물 API 서버** — 73 개의 도구로 시세·주문·기술적 지표 3대 영역을 커버합니다.

## 빠른 시작

- **환경:** Node.js >= 18
- **API Key:** 선택사항（미설정 시 시세 및 지표만, 설정 시 주문 가능）

```bash
npm install
cp .env.example .env
npm run dev   # 또는: npm run build && npm start
```

## 도구 목록（총 73 개）

### 선물 공개（12 개, Key 불필요）

| 도구 | 기능 |
|------|------|
| `futures_ping` | 연결 테스트 |
| `futures_time` | 서버 시간 |
| `futures_exchange_info` | 거래 규칙 / 수수료 / 최소 주문량 |
| `futures_orderbook` | 호가창 깊이 |
| `futures_klines` | 캔들 데이터（1m ~ 1M） |
| `futures_agg_trades` | 집계 체결（페이지네이션 + 시간 범위） |
| `futures_trades` | 최신 개별 체결 |
| `futures_daily_stats` | 24시간 통계 |
| `futures_prices` | 전 종목 실시간 가격 |
| `futures_all_book_tickers` | 전 종목 최우선 매수/매도 호가 |
| `futures_mark_price` | 마크 가격（청산 기준） |
| `futures_force_orders` | 강제 청산 주문 이력 |

### 선물 인증（17 개, Key 필요）

| 분류 | 도구 | 기능 |
|------|------|------|
| 🏦 계좌 조회 | `futures_account_balance` | 계좌 잔고 |
| | `futures_income` | 수익 내역（펀딩비/손익/수수료） |
| | `futures_user_trades` | 체결 내역 |
| ⚙️ 레버리지 및 증거금 | `futures_leverage` | 레버리지 설정 1-125x |
| | `futures_margin_type` | ISOLATED / CROSSED 전환 |
| | `futures_position_margin` | 격리 증거금 증감 |
| | `futures_margin_history` | 증거금 변동 기록 |
| 📊 레버리지 구간 | `futures_leverage_bracket` | 명목 포지션 레버리지 구간표 |
| 📝 주문 | `futures_order` | 주문（7 종류） |
| | `futures_update_order` | 주문 수정 |
| | `futures_get_order` | 단일 주문 조회 |
| | `futures_all_orders` | 전체 주문（이력 포함） |
| | `futures_batch_orders` | 일괄 주문（≤5） |
| | `futures_cancel_batch_orders` | 일괄 취소 |
| ❌ 취소 및 활성 | `futures_cancel_order` | 단일 취소（조건부 주문 algoId 지원） |
| | `futures_cancel_all_open_orders` | 전체 미체결 주문 취소 |
| | `futures_open_orders` | 현재 활성 주문 |

#### 주문 유형 요약

| type | 용도 | 필수 파라미터 | 청산 방법 |
|------|------|------|------|
| `MARKET` | 시장가 진입/청산 | `quantity` | SELL+LONG 시 자동 reduceOnly |
| `LIMIT` | 지정가 주문 | `price`, `quantity` | 상동 |
| `STOP_MARKET` | 시장가 손절 | `stopPrice` | `closePosition=true` |
| `TAKE_PROFIT_MARKET` | 시장가 익절 | `stopPrice` | `closePosition=true` |
| `TRAILING_STOP_MARKET` | 트레일링 스탑 | `activationPrice`, `callbackRate` | `closePosition=true` |
| `STOP` | 지정가 손절 | `price`, `stopPrice` | `closePosition=true` |

#### 청산 요약

| 시나리오 | 파라미터 |
|------|------|
| 시장가 전량 청산 | `side=SELL, positionSide=LONG, type=MARKET, quantity=포지션수량` |
| 손절 청산 | `type=STOP_MARKET, closePosition=true, stopPrice=트리거가격` |
| 익절 청산 | `type=TAKE_PROFIT_MARKET, closePosition=true, stopPrice=트리거가격` |
| 트레일링 스탑 청산 | `type=TRAILING_STOP_MARKET, closePosition=true, activationPrice=활성화가격, callbackRate="1"` |
| 조건부 주문 취소 | `futures_cancel_order(symbol, algoId=xxx)` |

### 기술적 지표（44 개, Key 불필요）

| 분류 | 개수 | 도구 목록 |
|------|:--:|------|
| **추세** | 13 | `indicator_sma`, `indicator_ema`, `indicator_dema`, `indicator_rma`, `indicator_wma`, `indicator_wsma`, `indicator_sma15`, `indicator_dma`, `indicator_dx`, `indicator_adx`, `indicator_linreg`, `indicator_psar`, `indicator_vwap` |
| **모멘텀** | 14 | `indicator_ao`, `indicator_ac`, `indicator_mom`, `indicator_cci`, `indicator_cg`, `indicator_macd`, `indicator_obv`, `indicator_rei`, `indicator_roc`, `indicator_rsi`, `indicator_stoch`, `indicator_stoch_rsi`, `indicator_tds`, `indicator_williams_r` |
| **변동성** | 8 | `indicator_abands`, `indicator_atr`, `indicator_bbands`, `indicator_bbw`, `indicator_iqr`, `indicator_mad`, `indicator_tr`, `indicator_zigzag` |
| **유틸리티** | 9 | `util_average`, `util_grid`, `util_max`, `util_min`, `util_median`, `util_quartile`, `util_stddev`, `util_streaks`, `util_weekday` |

## 환경 설정

| 변수 | 필수 | 설명 |
|------|:--:|------|
| `BINANCE_API_KEY` | 아니오 | Binance API 키 |
| `BINANCE_API_SECRET` | 아니오 | Binance API 시크릿 |
| `BINANCE_TESTNET` | 아니오 | 테스트넷 전환, 기본값 `true` |
| `HTTP_FUTURES_BASE` | 아니오 | 선물 엔드포인트, 공백 시 testnet 자동 전환 |
| `HTTP_PROXY` | 아니오 | HTTP 프록시, 예: `http://user:pass@host:8080` |
| `MCP_SERVER_NAME` | 아니오 | 서버명, 기본값 `binance-mcp-server` |
| `LOG_LEVEL` | 아니오 | 로그 레벨: `debug` / `info` / `warn` / `error` |

### 환경 변수 우선순위

```
MCP 설정 env 블록  >  .env 파일  >  코드 기본값
```

MCP 설정 파일（`mcp.json` 등）의 `env` 블록이 최우선, `.env`는 보완입니다. dotenv는 **기존 환경 변수를 덮어쓰지 않습니다**.

> **보안 팁:** 키는 MCP 설정의 `env` 블록으로 관리하고, `.env` 값은 비워 두세요.

## AI 어시스턴트 설정

> **주의:** MCP 설정 파일은 프로젝트 디렉터리 외부에 있으므로 **절대 경로가 필수**입니다. 아래 예시는 `E:/Github/I-binance-mcp` 기준입니다.

### 사전 준비: 빌드

```bash
npm run build
```

### Cursor / Trae / OpenCode

```json
{
  "mcpServers": {
    "binance": {
      "command": "node",
      "args": ["E:/Github/I-binance-mcp/dist/index.js"],
      "env": {
        "BINANCE_API_KEY": "your_key",
        "BINANCE_API_SECRET": "your_secret",
        "BINANCE_TESTNET": "true"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add binance -- node E:/Github/I-binance-mcp/dist/index.js
```

## 아키텍처

```
src/
├── index.ts              ← 진입점
├── server.ts             ← McpServer 생성 + 조건부 등록
├── config/binance.ts     ← 설정（엔드포인트 / 프록시 / 인증）
├── types/common.ts       ← ToolDefinition 제네릭
├── utils/                ← 로거 / 검증 / 오류 무결화
└── domain/
    ├── futures/          ← 선물: 공개 (12) + 인증 (17)
    │   ├── schemas.ts    ← Zod 스키마（42개 입력 정의）
    │   ├── public.ts     ← 공개 핸들러
    │   ├── authenticated.ts ← 인증 핸들러
    │   └── index.ts
    └── indicators/       ← 기술적 지표 (44)
        ├── schemas.ts    ← 지표 파라미터 스키마
        ├── trend.ts (13) / momentum.ts (14)
        ├── volatility.ts (8) / utility.ts (9)
        └── index.ts
```

**조건부 등록:** API Key 있음 → 73 도구；없음 → 56 도구。

## 명령어

| 명령어 | 설명 |
|------|------|
| `npm run dev` | 개발 모드（tsx） |
| `npm run build` | 컴파일 |
| `npm start` | 컴파일된 결과 실행 |
| `npm run typecheck` | 타입 체크 |
| `npm run watch` | 핫 리로드 |
| `npx tsx test/smoke-test.ts` | 스모크 테스트（31 항목） |

## 기술 스택

| 컴포넌트 | 버전 | 용도 |
|------|------|------|
| `@modelcontextprotocol/sdk` | ^1.29 | MCP 프레임워크（`registerTool`） |
| `binance-api-node` | ^0.13 | Binance API 클라이언트 |
| `trading-signals` | ^7.4 | 기술적 지표 계산 |
| `zod` | ^4.4 | 스키마 → JSON Schema 자동 생성 |
| `dotenv` | ^17.4 | 환경 변수 |
| `typescript` | ^6.0 | 주 언어 |

## 보안

- 키는 환경 변수로만 주입, 코드나 로그에 기록되지 않음
- 오류 메시지 자동 무결화（`api_key` → `[API_KEY]`, `signature` → `[SIGNATURE]`）
- 거래 기능은 반드시 `BINANCE_TESTNET=true` 환경에서 먼저 테스트하세요
- 프로덕션 환경에서는 `LOG_LEVEL=error` 권장

## 라이선스

MIT
