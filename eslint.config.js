/**
 * Binance MCP Server — ESLint Flat Config
 *
 * @module eslint.config
 * @description
 * ESLint 从 v9 开始强制使用 Flat Config 格式（eslint.config.js），
 * 旧的 .eslintrc.* 格式已废弃。本项目使用 ESLint v10 + TypeScript ESLint v8。
 *
 * 配置文件由三层规则叠加组成：
 * - 第 1 层：tseslintConfigs.recommended — TypeScript 推荐规则，覆盖所有文件
 * - 第 2 层：src 目录规则            — 启用类型感知检查 + 项目风格覆盖
 * - 第 3 层：test 目录规则           — 基础规则，不做类型感知检查
 *
 * 检查范围由 package.json 的 lint 命令控制：
 *   "lint": "eslint src test"  —— 只检查 src 和 test 两个目录
 *
 * defineConfig() 是 ESLint 核心提供的配置辅助函数，
 * 替代已弃用的 tseslint.config()，接收配置对象数组并自动推断类型。
 *
 * 依赖：
 * - eslint v10.3.0            — 核心引擎，提供 defineConfig()
 * - typescript-eslint v8.59.2 — TypeScript 规则集和解析器
 */

import { defineConfig } from 'eslint/config';
import { configs as tseslintConfigs } from 'typescript-eslint';

export default defineConfig([

  // ===========================================================================
  // 第 1 层 — TypeScript 推荐规则（适用于所有文件）
  // ===========================================================================
  // ...tseslintConfigs.recommended 是展开语法，将推荐规则数组打散到配置中。
  // 推荐规则包括约 40 条常用规则，如禁止 any 类型、禁止未使用变量等。
  // 下方两层配置会对部分规则做项目级别的覆盖调整。
  ...tseslintConfigs.recommended,

  // ===========================================================================
  // 第 2 层 — 项目源码规则（src 目录，启用类型感知检查）
  // ===========================================================================
  {
    /** 匹配 src 目录下所有 .ts 文件 */
    files: ['src/**/*.ts'],

    languageOptions: {
      parserOptions: {
        /**
         * 关联 tsconfig.json，启用类型感知（Type-Aware）规则。
         *
         * @description
         * 类型感知规则需要 ESLint 能访问完整的 TypeScript 类型信息，
         * 因此必须指定 tsconfig。这会额外启用以下规则：
         * - no-floating-promises          —— 禁止不处理的 Promise
         * - no-misused-promises           —— 禁止误用 Promise
         * - await-thenable                —— 等待非 thenable 值
         * - no-unnecessary-type-assertion —— 废弃的类型断言
         *
         * 注意：这会略微增加 lint 耗时，但能提供更精准的检查。
         */
        project: './tsconfig.json',
        /**
         * tsconfig 文件的根目录。
         * import.meta.dirname 是 Node.js ESM 中当前文件所在目录的绝对路径。
         */
        tsconfigRootDir: import.meta.dirname,
      },
    },

    rules: {
      // ----- 项目风格适配（覆盖推荐规则中的默认行为）-----

      /**
       * 允许 console（off）
       *
       * @description
       * MCP 服务器通过 stderr 输出日志（避免污染 stdout 的 MCP 数据流），
       * logger 模块内部使用 console.error，因此不禁止 console 调用。
       */
      'no-console': 'off',

      /**
       * 未使用变量降为警告（warn），以下划线开头的变量名不检查
       *
       * @description
       * 例如 function(_unused) 中的 _unused 不会触发警告。
       * 设为 warn 而非 error，避免开发过程中因未使用变量阻塞编译。
       */
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],

      /**
       * 关闭"需要显式函数返回类型"（off）
       *
       * @description
       * 项目中的 handler 函数已在 ToolDefinition 接口中声明了
       * 返回类型 Promise<CallToolResult>，类型已经足够清晰。
       */
      '@typescript-eslint/explicit-function-return-type': 'off',

      /**
       * 允许 any 类型（off）
       *
       * @description
       * 项目中有两个场景必须使用 any：
       * - binance-api-node 客户端通过 createRequire 加载 CJS 模块，
       *   返回的动态方法无法精确标注类型。
       * - trading-signals 库的部分内建类型不完整（如某些 indicator
       *   的构造函数签名），外部使用必须做类型断言。
       */
      '@typescript-eslint/no-explicit-any': 'off',

      /**
       * 允许非空断言 ! （off）
       *
       * @description
       * trading-signals 库的 add() 方法在计算初期可能返回 null，
       * 但 getResultOrThrow() 保证了最终结果非空。在确认语义安全后
       * 使用 ! 断言是合理的。
       */
      '@typescript-eslint/no-non-null-assertion': 'off',

      /**
       * 允许 require() 导入（off）
       *
       * @description
       * binance-api-node 是 CJS（CommonJS）模块，且只发布 CJS 产物。
       * 在 ESM 项目中通过 createRequire 加载，产生 require() 调用
       * 是唯一可行的方式。
       */
      '@typescript-eslint/no-require-imports': 'off',

      /**
       * 关闭类成员排序检查（off）
       *
       * @description
       * 项目中的 ToolDefinition[] 是字面量数组，每个元素依次定义
       * name、description、schema、handler。强制成员排序会打乱
       * 这种声明式的工具定义结构。
       */
      '@typescript-eslint/member-ordering': 'off',
    },
  },

  // ===========================================================================
  // 第 3 层 — 测试文件规则（test 目录）
  // ===========================================================================
  {
    /** 匹配 test 目录下所有 .ts 文件 */
    files: ['test/**/*.ts'],

    rules: {
      /**
       * 允许 console（off）
       *
       * @description
       * 测试代码需要输出调试信息，不限制 console 调用。
       */
      'no-console': 'off',

      /**
       * 允许 any 类型（off）
       *
       * @description
       * 测试中使用 mock 对象时类型标注意义不大，不做约束。
       */
      '@typescript-eslint/no-explicit-any': 'off',

      /**
       * 允许 require() 导入（off）
       *
       * @description
       * 测试有时需要动态导入 CJS 模块，不做约束。
       */
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
]);
