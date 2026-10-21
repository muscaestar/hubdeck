# 用 AI 助手构建 profile（MCP）

原文：[docs/MCP.md](../MCP.md)。基线 `0cbdde3`，2026-10-22。

HubDeck 内置 MCP server，让用户自己的 AI 助手（Claude Desktop、Claude Code 或任意 [Model Context Protocol](https://modelcontextprotocol.io) client）设计并构建 profile：各控件功能、布局、快捷键、图片、动画、灯光、页面。HubDeck 自身无需 AI key，不向外发送信息；助手只与同一电脑的 HubDeck 通信。

## 工作方式

```
assistant (Claude Desktop / Code)  --stdio, JSON-RPC 2.0-->  hubdeck --mcp
hubdeck --mcp  --HTTP 127.0.0.1, bearer token-->  the running HubDeck (local API, engine/api.rs)
```

- 同一程序加 `hubdeck --mcp` 即在 stdin/stdout 提供 MCP，一行一条 JSON。client 关闭 stdin 时退出；不打开窗口，不直接接触硬件。
- 每次 tool call 转换为运行中应用本地 HTTP API 请求，使用 `<data>/api-token`、`<data>/api-http-port`。Windows data 为 `%APPDATA%\dev.hubdeck.app`，macOS 为 `~/Library/Application Support/dev.hubdeck.app`。每次调用重读 token/port，以找到重启后的 HubDeck。
- HubDeck 未运行会返回明确错误，由助手提示启动；旧版缺少路由时提示版本过旧。
- 协议版本：最新 `2025-11-25`，兼容 `2025-06-18`、`2025-03-26`、`2024-11-05`。已知 client 版本则回应相同版本，否则用最新。capabilities 包含 tools 和一个 resource `hubdeck://design-guide`。

## 连接

Settings > Connections > **AI assistant (MCP)**：

- **Connect Claude Desktop**：将 `mcpServers.hubdeck = {"command": "<path to hubdeck.exe>", "args": ["--mcp"]}` 加入 Windows `%APPDATA%\Claude\claude_desktop_config.json` 或 macOS `~/Library/Application Support/Claude/claude_desktop_config.json`。保留其他 server 和设置，旧文件备份为 `claude_desktop_config.json.hubdeck-backup`，无效 JSON 不覆盖；之后重启 Claude Desktop。
- **Connect Claude Code**：在 PATH、`~/.local/bin`、`~/.claude/local`、npm 找到 `claude` 后，运行 `claude mcp remove --scope user hubdeck`，再运行 `claude mcp add --scope user hubdeck -- "<path to hubdeck.exe>" --mcp`。找不到时按钮复制命令。
- **Copy JSON for other apps**：复制任意 MCP client 可用的 `mcpServers` 片段。

Claude Code 手工配置：

```
claude mcp add --scope user hubdeck -- "C:\Program Files\HubDeck\hubdeck.exe" --mcp
```

## Tools

| Tool | 功能 | HTTP route |
|---|---|---|
| `design_guide` | 设计规则（`docs/PROFILE-DESIGN.md`，也作为 `hubdeck://design-guide`） | 内置 |
| `list_modules` | 已连接/已拥有的模块类型，各类控件 | `GET /api/modules` |
| `list_actions` | 精简动作表；带 `search` 则含参数；特殊键、样式、LED 效果 | `GET /api/catalog` |
| `list_icons` | 内置图标及 `game:<name>` 图标 | `GET /api/catalog` |
| `list_apps` | 已装应用的 name/target/exe 和最近应用 | `GET /api/apps` |
| `list_games` | Steam、Epic、GOG 已装游戏与启动 target | `GET /api/games` |
| `list_profiles` | 所有 profile、活动和 home | `GET /api/profiles` |
| `get_profile` | 读取一个 profile | `GET /api/profiles/<id>` |
| `create_profile` | 单次建立整套；`replace` 覆盖前先备份 | `POST /api/profiles` |
| `update_profile` | 名称、应用、颜色、边缘灯、panel | `POST /api/profiles/<id>/update` |
| `set_control` / `clear_control` | 单个控件 binding | `POST /api/profiles/<id>/controls` |
| `add_page` / `delete_page` | 按键页面 | `POST /api/profiles/<id>/pages`、`.../pages/<page>/delete` |
| `set_lights` | profile 边缘灯颜色、旋钮/推杆 LED | `POST /api/profiles/<id>/lights` |
| `get_deck_lights` / `set_deck_lights` | 全设备灯光风格、亮度、响应 | `GET` / `POST /api/lights` |
| `add_image` | 存 SVG、PNG/JPEG/GIF/WebP，返回 `look.image` 名称 | `POST /api/images` |
| `add_animation` | SVG/图片帧 + fps 转 animated GIF，按键 80×80、dial 240×240、panel 480×272 | `POST /api/animations` |
| `preview_control` | 硬件实际收到的按键或 dial PNG 及其 SVG | `POST /api/preview` |
| `activate_profile` | 立即显示 profile | `POST /api/profiles/<id>/activate` |

助手提交的全部内容在保存前由 `api::check_profile` 检查：控件 id（`keys.0`–`keys.14`、`dial`、`knobs.N`、`faders.N`、`rollers.N`、`:hold`、`:double`、`<page>/keys.N`）、存在且输入适配控件的动作、select 参数、可解析 hotkey、已知图标、已存图片、`#rrggbb`、按键样式、LED 效果。错误拒绝整个改动并给理由；长标签、给按键设 LED 等 warning 随结果返回。

限制：SVG 最大 2 MB，图片最大 15 MB，动画最多 120 帧、1–15 fps、15 MB，请求 body 最大 16 MB。

## 不用 MCP 也可调用

任意 HTTP client 加 token 可使用所有 route：

```
curl -H "Authorization: Bearer $(cat "$APPDATA/dev.hubdeck.app/api-token")" \
     http://127.0.0.1:$(cat "$APPDATA/dev.hubdeck.app/api-http-port")/api/modules
```

## 无硬件试用

可以手工向 `hubdeck --mcp` stdin 逐行写入 `initialize`、`notifications/initialized`、`tools/list`、`tools/call`。`engine/mcp.rs` 的 Rust tests 用 fake app 测试此流程，并对 fake local API 做 HTTP 往返。

## 助手工作期间使用设备（`--mcp-deck`）

第二个小型 server 按项目开启，用于工作期间操控设备；每个 tool 占助手 context，因此不全局注册。项目目录运行：

```
claude mcp add --scope project hubdeck-deck -- "<path to hubdeck.exe>" --mcp-deck
```

Settings > Connections > “Deck tools for a project” 可复制此命令。

| Tool | 功能 | HTTP route |
|---|---|---|
| `notify` | dial 显示短消息数秒，底座边缘以指定色 breathing | `POST /api/notify` |
| `show_status` | dial 保持状态直到改变/清除，空文本清除 | `POST /api/status` |
| `ask_physical` | dial 显示问题、按键显示答案，返回实体按下的选择；按 dial 取消，也可超时 | `POST /api/ask` 后轮询 `GET /api/ask/<id>` |
| `read_controls` | 活动 profile/page，以及推杆、旋钮、dial 最后设置的 0–100 数值 | `GET /api/controls` |

`POST /api/ask` 立即返回 id，tool 每 0.4 s 查询，API 本身不阻塞等用户。问题显示期间，按键用于回答，不执行原动作。
