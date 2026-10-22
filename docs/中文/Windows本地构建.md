# Windows 本地构建记录

最后更新：2026-10-22。源码提交：`452d819`（应用代码基于上游 `0cbdde3`，版本 0.1.9）。本次按仓库 test-build 参数做 release 构建，应用与设备体验待主人验收。

## 本机构建环境

| 项目 | 实际版本 |
|---|---|
| 系统 | Windows 11 x64，build 26200 |
| Node.js / npm | 24.19.0 / 11.17.0 |
| pnpm | 10.34.7 |
| rustup | 1.29.2 |
| Rust / Cargo | 1.99.1，`stable-x86_64-pc-windows-msvc` |
| Visual Studio | Community 2022，17.14.36121.58 |
| MSVC | 14.44.35207 |
| Windows SDK | 10.0.26100.7705，目录版本 `10.0.26100.0` |
| WebView2 Runtime | 155.0.4283.62 |

Node、Visual Studio C++ 和 WebView2 原先已有；本次新增 Rust、pnpm、Windows SDK。pnpm 用 `npm install --global pnpm@10`；SDK 用 WinGet 包 `Microsoft.WindowsSDK.10.0.26100` 安装，安装器 hash 验证通过；Rust 用官方 `rustup-init.exe`，先与官方 `.sha256` 比对，再以 minimal/MSVC/stable 安装。用户 PATH 中已有 npm 全局目录，Rust 安装器加入 Cargo 目录；没有改系统代理。

依赖按原有 `pnpm-lock.yaml` / `Cargo.lock` 获取，没有为首次构建升级项目依赖。安装要求可参考 [Tauri Windows prerequisites](https://v2.tauri.app/zh-cn/start/prerequisites/) 和 [Windows SDK 下载](https://learn.microsoft.com/en-us/windows/apps/windows-sdk/downloads)。

## 可复现命令

在 PowerShell 中，从仓库根目录开始。代理只设置给当前进程及子进程；电脑需已有对应本地代理。

```powershell
Set-Location "$env:USERPROFILE\Projects\hubdeck"
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:APPDATA\npm;$env:PATH"
$env:HTTP_PROXY = 'http://127.0.0.1:7890'
$env:HTTPS_PROXY = 'http://127.0.0.1:7890'
$env:CARGO_HTTP_PROXY = 'http://127.0.0.1:7890'
$env:CARGO_BUILD_JOBS = '8'

# 与 scripts/test-build.ps1 相同的编译参数，产物独立存放。
$env:CARGO_TARGET_DIR = Join-Path (Get-Location) 'target\test-build'
$env:CARGO_PROFILE_RELEASE_LTO = 'thin'
$env:CARGO_PROFILE_RELEASE_CODEGEN_UNITS = '16'
$env:CARGO_PROFILE_RELEASE_INCREMENTAL = 'true'

Set-Location app
pnpm install --frozen-lockfile
pnpm tauri build --bundles nsis -- --locked
```

`pnpm tauri build` 会执行 `pnpm build`（TypeScript + Vite）、编译 Rust、下载打包工具并生成 NSIS。仅需 EXE 时，可加 `--no-bundle`；要使用仓库默认发行优化参数，移除上面的三个 `CARGO_PROFILE_RELEASE_*` 环境变量，并改用普通 `target` 目录。本机没有上游的发布私钥，本地构建不使用 `tauri.release.conf.json`。

已有 [scripts/test-build.ps1](../../scripts/test-build.ps1) 可简化日常试编译；[scripts/win-install.ps1](../../scripts/win-install.ps1) 是另一步实际安装，不属于 build 本身。本次没有运行安装脚本，也没有启动 GUI 接管 MasterHUB。

## 验证记录

| 检查 | 本机结果 |
|---|---|
| 前端 `pnpm test` | 2 个文件、19 项测试通过 |
| 前端 `pnpm build` | TypeScript 与 Vite 成功，退出码 0 |
| `cargo test --locked -p mh-protocol -p mh-device --lib` | mh-protocol 13 项、mh-device 7 项通过 |
| 应用 release 编译 / NSIS | 成功，打包退出码 0；Rust 编译约 3 分 15 秒，完整 build 约 3 分 32 秒（不含工具链安装与首次依赖下载） |
| EXE PE 检查 | `hubdeck.exe` 为 Windows x64（machine `0x8664`） |
| EXE 无硬件启动检查 | `hubdeck.exe --mcp` 成功回应 initialize 与 tools/list，版本 0.1.9、24 个工具，进程退出码 0 |
| Authenticode | 应用 EXE 与 NSIS 安装包均为 `NotSigned`，本地构建未做签名 |

Rust library 测试只用解析、构造、状态变化与路径样本；未运行硬件 examples 或 ignored output_timing。前端存在 chunk 大于 500 kB 的提示，构建仍成功。pnpm 默认跳过 esbuild 的安装脚本，本机现有原生依赖已足够完成前端构建，没有放开所有依赖的安装脚本权限。

本次不以“能编译”代替全部 Engine 单元测试、GUI 流程、长时运行或 MasterHUB 实物验收。

MCP 检查只走 main.rs 中早于 GUI 的 stdio 分支，发送初始化与工具目录请求，不调用动作或本地应用 API，也不启动设备 Hub。GUI 与 HID 实机验收仍留给主人。

## 产物与日志

已生成产物目录：

```text
target/test-build/release/hubdeck.exe
target/test-build/release/bundle/nsis/HubDeck_0.1.9_x64-setup.exe
```

| 文件 | 实际大小 | SHA-256 |
|---|---:|---|
| `hubdeck.exe` | 27,607,552 B，26.33 MiB | `aae68431330c58b8119de08590463f19e2c38e5c8079474e8c001d9aa374e19b` |
| `HubDeck_0.1.9_x64-setup.exe` | 10,218,268 B，9.74 MiB | `f19e70ec80948f7bca47d7b5e2cbfa61b5524bb7c285cb5d2c1dbb114bcd8f8d` |

NSIS 引导器自身的 PE machine 为 x86（`0x14c`），其中的应用为 x64，打包器也报告 `Target: x64`。安装包没有在本机执行，现有官方 MasterHUB 应用与设备配置未被本次构建接管。

本机构建日志放在已忽略的 `logs/`：`pnpm-install.log`、`frontend-tests.log`、`frontend-build-native.log`、`protocol-device-tests.log`、`windows-build.log`、`exe-mcp-smoke.log`；结构化结果为 `windows-build-result.json` 和 `artifact-verification.json`。二进制、依赖缓存和日志不提交 Git；本页保存复现参数和最终校验信息。
