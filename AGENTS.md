# 参考文档

- Electrobun 文档入口：https://blackboard.sh/electrobun/docs/

# 项目定位

- `rimun` 是一个 RimWorld mod 管理器。
- 该项目面向桌面端使用场景。

# 技术栈

- 客户端容器：Electrobun，作为 webview 客户端。
- Web UI：React。
- JavaScript runtime / tooling：Bun。
- UI 组件与样式体系：shadcn/ui。
- 界面职责：使用 React + shadcn/ui 构建并渲染整个 Web 界面。

# 开发与测试环境

- 可能在 WSL 中进行开发与测试。
- RimWorld 安装在 Windows 环境中。
- 涉及 RimWorld 安装目录、mod 目录、配置目录时，默认按 WSL 与 Windows 跨环境协作来设计与验证。

# 包管理与工具链约定

- 统一使用 Bun 作为 package manager、runtime 与脚本执行入口。
- 不引入 `npm`、`pnpm`、`yarn` 作为并行包管理方案，除非用户明确要求。
- 前端依赖安装默认使用 `bun install`。
- 新增脚本时，优先使用统一命名：`dev`、`build`、`test`、`lint`、`check`、`format`。
- 脚本执行默认使用 `bun run <script>`。

# 路径与文件系统策略

- 涉及 RimWorld、Workshop、Mods、配置文件等真实游戏路径时，必须显式区分 `Windows path` 与 `WSL path`。
- 面向应用配置、用户选择结果、外部集成时，优先保留 Windows 绝对路径，避免把 WSL 挂载路径暴露为产品层标准路径。
- 仅在文件系统访问边界层执行 Windows / WSL 路径转换，不在业务逻辑中散落路径格式转换代码。
- 禁止在同一个数据结构字段中混用两种路径语义；字段语义必须固定。
- 处理路径时优先使用明确的路径工具与封装，避免手写字符串拼接。

# WSL / Windows 桥接规则

- 默认假设开发环境在 WSL，游戏运行环境与安装目录在 Windows。
- 任何与 RimWorld 安装探测、mod 扫描、配置读取相关的能力，都要先考虑跨环境访问是否可行。
- 需要访问 Windows 文件时，应通过明确的桥接层处理，而不是把 `/mnt/<drive>/...` 访问逻辑散落到 UI 或业务流程中。
- 设计接口时，优先把“路径发现”“路径转换”“目录读写”分成独立职责，便于后续测试和替换实现。
- 涉及平台差异的逻辑时，优先封装成独立模块，不把平台分支直接写进 React 组件。

# 开发命令约定

- 本地开发默认命令：`bun run dev`。
- 浏览器开发与浏览器自动化测试统一入口：`bun run dev:web`。
- `bun run dev:web` 必须同时启动 Web UI 与真实 Bun dev host；后续凡是需要让 LLM / browser agent 通过浏览器模拟用户操作的场景，默认都从这个入口启动。
- 生产构建默认命令：`bun run build`。
- 单元测试默认命令：`bun run test`。
- 静态检查默认命令：`bun run lint` 或 `bun run check`。
- 代码格式化默认命令：`bun run format`。
- 若项目初始化阶段尚未提供上述脚本，后续补齐时应优先采用这套命名，不再另起平行命名。

# 测试约定

- 测试优先覆盖路径转换、目录扫描、配置解析、mod 元数据处理等核心逻辑。
- 单元测试应尽量避免依赖真实的 RimWorld 安装目录，优先使用 fixture、临时目录与 mock 数据。
- 涉及 Windows / WSL 桥接的测试，优先拆成可重复执行的纯逻辑测试与少量人工验证步骤。
- 浏览器自动化测试默认使用 `bun run dev:web` 作为被测入口，并优先使用 `agent-browser` 之类的浏览器代理直接驱动页面，而不是要求先打开 Electrobun GUI。
- `bun run dev:web` 对应真实 Bun host，默认视为接近桌面客户端行为的测试入口；除非任务明确要求隔离环境，否则浏览器自动化可按真实本地数据路径进行验证。
- 需要真实 Windows 环境才能完成的验证，应明确标注为手工验证，不污染默认自动化测试链路。

# 目录结构约定

- 项目目录默认按 `app shell`、`web ui`、`domain logic`、`infrastructure adapters` 分层组织。
- React 页面、布局、通用组件、feature 组件应分目录存放，不把所有 UI 代码堆在单一目录。
- RimWorld mod、存档、配置、路径探测等核心业务逻辑应集中在独立的 domain / service 模块，不直接耦合到 React 组件。
- 平台相关能力，例如文件系统访问、目录扫描、系统路径探测、Electrobun bridge，应放在基础设施层或 bridge 层。
- UI 资源、样式 token、常量、schema、fixture、测试工具应独立归档，避免与业务逻辑混放。

# 状态管理约定

- 默认优先使用 React 原生状态能力解决局部状态：`useState`、`useReducer`、`context`。
- 跨页面共享且具有明确业务含义的客户端状态，允许引入单独的 store，但必须保持最小化。
- 不要为了简单表单、弹窗开关、hover 状态引入全局状态。
- 服务端数据、文件扫描结果、配置读取结果与 UI 瞬时状态应分开管理，避免混成单一大 store。
- 状态结构优先按业务边界建模，不按组件树临时拼装。

# Electrobun Bridge 约定

- React UI 不直接访问底层文件系统、系统命令或平台 API，必须通过 Electrobun bridge 暴露的明确接口调用。
- bridge 层只负责能力暴露、参数校验、错误映射与边界转换，不承载复杂业务编排。
- 业务逻辑应尽量在 domain / service 层实现，由 bridge 调用，而不是反过来由业务逻辑依赖 UI。
- bridge 接口应保持显式、窄口、可测试；避免暴露“万能执行器”式的宽泛接口。
- 每个 bridge 接口都应有清晰的输入输出结构；涉及路径、mod 元数据、扫描结果时，优先定义稳定 schema。
- 错误处理要区分用户可恢复错误、环境错误、系统错误，不把底层异常原样泄漏到 UI。

# 前端分层约定

- React 组件默认分为 `page`、`feature`、`shared ui` 三层，避免跨层随意引用。
- 页面负责路由级拼装，feature 负责业务交互，shared ui 负责纯展示与复用控件。
- 数据获取、命令调用、表单提交流程应放在 feature 层或 hooks / controller 层，不直接塞进纯展示组件。
- 复杂列表、树、筛选、排序、启停状态等交互要优先考虑可维护性与可测试性，不写成超长单组件。

# shadcn/ui 使用约定

- shadcn/ui 作为基础组件层使用，可以定制，但不要把生成出来的组件再次包装成无意义薄封装。
- 优先复用 shadcn/ui 已有组件组合页面，只有在业务语义明显不同或交互复杂时才创建上层业务组件。
- 对 shadcn/ui 组件的改动应保持局部、明确，避免为了单个页面需求污染全局基础组件。
- 主题 token、颜色、圆角、间距、阴影等视觉基线应集中管理，不在页面内散落硬编码样式。
- 无障碍相关属性、键盘交互、焦点状态不能因为二次封装而退化。

# 组件与样式约定

- 样式优先遵循统一 design tokens，不直接在业务代码中重复硬编码颜色、尺寸、z-index。
- 公共组件优先保持无业务依赖；带业务语义的组件应明确收敛到 feature 范围。
- 表格、树、列表、卡片等高频展示组件要优先考虑 RimWorld mod 管理场景下的大量数据可读性。
- 需要支持空状态、加载状态、错误状态，不允许只实现成功态。

# 数据与 schema 约定

- mod 元数据、扫描结果、配置文件结构、用户设置等数据应优先定义明确 schema 或类型边界。
- UI 展示模型与底层原始文件模型可以分离，不强行让 React 组件直接消费底层原始结构。
- 对外持久化的数据结构一旦确定，应避免频繁重命名字段；必要调整时采用硬切换统一修改，不保留兼容分支。
