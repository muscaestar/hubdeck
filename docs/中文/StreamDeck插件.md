# HubDeck 的 Stream Deck 插件（研究于 2026-10-13）

原文：[docs/STREAMDECK-PLUGINS.md](../STREAMDECK-PLUGINS.md)。基线 `0cbdde3`，2026-10-22。以下为原作者研究、计划和后续测试记录。

目标：兼容用户已有应用；此类设备事实上的标准是 Stream Deck plugin。本篇记录实现前的发现与计划。

## Stream Deck plugin 是什么

- `<uuid>.sdPlugin` 文件夹内含 `manifest.json`，以 Elgato CLI `pack` 生成的 zip `.streamDeckPlugin` 分发，每插件独立进程。
- host 启动 `CodePath`（或 `CodePathMac` / `CodePathWin`），传 `-port <p> -pluginUUID <uuid> -registerEvent <event> -info <json>`。插件连 `127.0.0.1:<p>` WebSocket，发 `{"event": <registerEvent>, "uuid": <pluginUUID>}`。`-info` 描述 app、OS、devices（id、name、size 的 columns/rows、type）。
- manifest 的 `Nodejs.Version` 为 `"20"` 或 `"24"` 时，`CodePath` 是 Node 运行的 JavaScript；Stream Deck 自带 Node。否则为 C#、C++、Go 等 native 程序，往往仅 Windows。
- 关键字段：`Actions[]` 的 UUID、Name、Icon、含图的 States、Controllers（Keypad/Encoder/Neo）、Encoder.layout、PropertyInspectorPath、SupportedInMultiActions；另有 ApplicationsToMonitor、Profiles、OS、Software.MinimumVersion（6.4..7.6）、SDKVersion（2 或 3）。

### Host 发送事件

`keyDown` / `keyUp` 含 controller、coordinates {column,row}、settings、state；`willAppear` / `willDisappear`；`dialRotate` 含 ticks、pressed；`dialDown` / `dialUp`；`touchTap` 含 tapPos、hold；`didReceiveSettings`、`didReceiveGlobalSettings`、`titleParametersDidChange`；`deviceDidConnect` / `deviceDidChange` / `deviceDidDisconnect`；`applicationDidLaunch` / `applicationDidTerminate`；`systemDidWakeUp`；`propertyInspectorDidAppear` / `Disappear`；`sendToPlugin`、`didReceiveDeepLink`、`didReceiveResources`。

### 插件发送命令

`setTitle`、`setImage`（插件内文件或 base64 data URL，PNG/JPEG，实际也有 SVG）、`setState`、`showOk`、`showAlert`；`setFeedback` 为触控条逐 layout item 提供 title/value/indicator bar/icon；`setFeedbackLayout` 支持 `$A0`、`$A1`、`$B1`、`$B2`、`$C1`、`$X1` 或自定义 JSON；`setTriggerDescription`、`openUrl`；`setSettings` / `getSettings`、`setGlobalSettings` / `getGlobalSettings`；`switchToProfile`、`sendToPropertyInspector`、`logMessage`、7.1+ 的 `setResources` / `getResources`。

### Property inspector：动作设置页

来自插件文件夹的 HTML，host 展示后调用 `window.connectElgatoStreamDeckSocket(port, uuid, registerEvent, info, actionInfo)`，页面再连同一 WebSocket。HubDeck 用编辑器 iframe，由本地 server 提供插件页面，加载后执行此调用。

## 其他兼容宿主

- **OpenDeck**（GPL-3.0）：声称兼容大多数插件，包括 Elgato Discord；macOS/Linux 可用 Wine 跑 Windows 插件，支持 property inspector，官方硬件仅 Elgato。作者只参考行为，不复制其 GPL 代码；HubDeck 为 MIT OR Apache-2.0，按 Elgato 公开文档实现。
- **OpenAction**：声称 backwards-compatible with the Stream Deck SDK，支持各设备/OS，带扩展。不用扩展的插件也能跑 Stream Deck、Mirabox Stream Dock。开源目录为 OpenAction Marketplace（marketplace.rivul.us）。
- **Mirabox Stream Dock**：在自家硬件跑同类插件。

## 获取插件

1. 插件作者网站或 GitHub Releases 的 `.streamDeckPlugin`，多数开源插件会提供。HubDeck 可打开文件、拖入窗口或 Settings > Plugins 选文件，先显示名/作者/版本。Windows Open with 会列 HubDeck，仅没有其他关联时才成为默认，不抢已有 Stream Deck 关联。
2. 顶栏 Plugins 的免费一键目录：`scripts/plugins/catalog.mjs` 每天生成，与网站发布到 `przemotar.github.io/hubdeck/plugins.json`。来源包括 Elgato 下载前 300 中作者开放文件的插件（2026-10-17 手核前 100 的 36 个，查作者与 id，记录于 `sdcatalog.json` 的 `elgatoOpen`）、OpenAction，以及 GitHub topic `streamdeck-plugin` / `stream-deck-plugin` / `elgato-stream-deck` 下两年内更新且有 `.streamDeckPlugin` release 的仓库。未测标 Not tried yet。条目含来源、Elgato 排名或 stars、更新时间、OS、分类、dial 能力，可筛选排序。排除只能由 Elgato 安装的和为其他硬件提供驱动的 OpenDeck 插件；目录不可读时应用自行合并 OpenAction 与 Elgato 列表。2026-10-18 共 302：Elgato 36、OpenAction 152、GitHub 114。
3. 本机 Stream Deck 目录：Windows `%APPDATA%\Elgato\StreamDeck\Plugins\`，macOS `~/Library/Application Support/com.elgato.StreamDeck/Plugins/`；Settings > Plugins 的 Use in HubDeck 复制一份，原插件保留。
4. Elgato Marketplace 经账号和 Stream Deck 的 Open in Stream Deck 安装。原文称自 2026-01 起有 DRM，目的为未经作者同意其他厂商不能运行。2026-10-17 测 HWiNFO Deck Bridge，`manifest.json` 在磁盘加密，开头 `ELGATO\x01`；HubDeck 无法得知动作，会明确提示，不绕过保护，付费/受保护插件留给 Elgato。

## MasterHUB 映射

| 模块 | Stream Deck controller | 说明 |
|---|---|---|
| 15 IPS 键，5×3 | `Keypad`，5×3 | 图片绘到 79×75 可视窗口 |
| 圆屏 dial，240×240，可转可按 | `Encoder` 及 touch-strip feedback | `$A0`..`$C1` 转 SVG 到圆屏；无触摸，不能 `touchTap` |
| 三旋钮，可转可按、有 LED | 无屏 `Encoder` | 转动反馈临时显示 dial 或忽略 |
| 双滚轮、五推杆 | SDK 无对应类型 | 滚轮转 Encoder ticks；推杆转 ticks 或 OpenAction 扩展；本项目协议原生保留推杆/滚轮/LED |

`-info` 与 `deviceDidConnect` 宣告 5×3 keypad 加 encoders，type 仿 Stream Deck +，使插件提供 encoder actions。

## 限制

- Windows-only 插件只在 Windows 跑，初期无 Wine。
- Node 插件需 Node 20/24；可用已装版本，或经允许首次下载官方 Node（约 40 MB 到应用数据目录）。
- 依赖 Elgato 账号、OBS 连接、随 `Profiles` 打包 profile 等专属能力的插件可能不完整。Discord voice 需批准 client；若插件带 Elgato 已批 client 可用，OpenDeck 报告 Elgato Discord 可用。
- HubDeck 用“runs Stream Deck plugins”描述兼容性，不把商标放进产品名。

## 原始计划

1. 在 `engine/plugins.rs` 增第二种 WebSocket dialect：Stream Deck 启动参数、注册、按键与 dial/knob 事件和命令；按控件保存 settings。
2. 支持打开/拖入安装，列本机已装插件并 Use；寻找 Node 或经允许获取。
3. What should it do? 列 manifest 名/图标；setImage/setTitle 绘键，setFeedback 绘 dial。
4. iframe 显示 property inspector。
5. 两平台试一些开源插件，在下节记结果。

<a id="tried"></a>
## 已试插件

Windows 测试副本 2026-10-16/17/18，`node scripts/ui/plugin-check.mjs <catalog ids>`：53 个中 44 个能安装、启动、连接、在分配按键上绘图。**未逐动作按下，HA、Hue、Twitch、GoXLR 等未连接真实服务**。目录标 tried in HubDeck，来源 `sdcatalog.rs` 的 `TRIED`。

| 结果 | 插件 |
|---|---|
| 启动、连接、绘制（26） | Essentials for Spotify（Mac 也测）、Discord、System Information、Weather、Home Assistant、Flight Tracker、Google Meet、Twitchat、Audio Output Switch、HWiNFO、Philips Hue、CPU、IFTTT、DevOps for StreamDeck、Mic Mute Toggle、WSProxy、YouTube Music Desktop、JetBrains IDE、Discord Volume Mixer、GoXLR Utility、Open Hardware Sensor、API Request、ScriptDeck、Uptime Kuma、HWiNFO Reader、Sound Deck |
| 同上，2026-10-18（18） | Audio Mixer、GPU Utilization、VS Code commands (streamdeckvsc)、Bitfocus Companion、VTube Studio、Multi OBS、VLC、Color Picker、Tomato timer、Dice、Libre Hardware Monitor、RAM、Task Timer、Focused App Volume、Nanoleaf、TeamSpeak 3、Windows Display Settings、On Air Clock |
| 为其他系统编写，显示说明（5） | VS Code、KMLink、Xcode、OSA Script 仅 macOS；Volume Controller 仅 Linux |
| Elgato 外不可运行（1） | RME TotalMix FX 5.5.1，文件加密 |
| 非设备插件（1） | Touchy-Pad 为 OpenDeck 另一触控硬件，无 actions |
| 仅 macOS，显示说明（1） | Meld Studio，2026-10-18 |
| 安装但不能运行（1） | Stocks 向 Elgato 专用插件目录写日志，目录缺失即停；`sdcatalog.json` 的 `wontRun` 排除 |

2026-10-17 顺便修复：DevOps 多套一层 zip；Flight Tracker manifest UTF-8 BOM、只有 prerelease；ScriptDeck 按 OS 分文件（选 Windows PowerShell 而非 PowerShell 7）、binary WebSocket frame。System Information 持续一分钟占单核 42–50%，每 10 s 测；同 OpenAction library 的 Discord 为 0%，插件自身每秒仅刷新 CPU/内存，HubDeck 未发送形成回环的内容，原因未知。Settings > Plugins 标记超过 20% 的插件。

2026-10-18 修复空 `application.platformVersion` 导致 .NET 插件解析 `Version` 后启动退出，Windows Display Settings 为 0xe0434352，Windows Application 的 .NET Runtime 日志可见。现传系统版本，如 `10.0.19045`。启动瞬间测 Focused App Volume 单核 83%、Audio Mixer 26%，尚未持续测。

| 插件 | 平台 | 结果 |
|---|---|---|
| Essentials for Spotify 1.2.0.0，Node，ntanis-dev | macOS，2026-10-13 | 安装，按键/窗口有图标，openUrl 打开配置页，global settings 保留，实体播放/暂停/下一首可用。首次配置后 no device，重启插件后恢复，只重启插件不重启 HubDeck；待查是否等待 setGlobalSettings 后的 Stream Deck 事件。需要用户自己的 developer.spotify.com app 和 Premium |

## 来源

- [Elgato events-sent](https://docs.elgato.com/sdk/plugins/events-sent)、[events-received](https://docs.elgato.com/sdk/plugins/events-received)、[manifest](https://docs.elgato.com/sdk/plugins/manifest)、[registration](https://docs.elgato.com/sdk/plugins/registration-procedure)、[property inspector](https://docs.elgato.com/sdk/plugins/property-inspector)、[packaging](https://docs.elgato.com/sdk/plugins/packaging)。
- [OpenDeck](https://github.com/nekename/OpenDeck)、[Flathub](https://flathub.org/apps/me.amankhanna.opendeck)。
- [OpenAction](https://openaction.amankhanna.me/)、[crate](https://docs.rs/crate/openaction/latest)。
- [Elgato Marketplace 安装](https://help.elgato.com/hc/en-us/articles/33589587352337)。
