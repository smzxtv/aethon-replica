# Aethon Replica

独立的开源网络客户端（Windows 桌面端），基于 **Tauri v2 + React + Rust** 构建，使用 **sing-box** 作为网络核心。

> 由「数码解码」出品并维护 · 技术支持请加入 [Telegram 群组](https://t.me/+tVg48WK48tlkNGVl)

---

## ✨ 功能特性

### 核心功能
| 功能 | 说明 |
|---|---|
| **VPN 模式（TUN）** | 系统级全局路由，所有程序无需配置直接走代理，需管理员权限 |
| **手动 SOCKS5 模式** | 本地混合代理（HTTP + SOCKS5 同端口），浏览器设置代理即可用 |
| **自动系统代理** | SOCKS5 模式连接时自动设置 Windows 系统代理，断开自动还原，零配置 |
| **多协议支持** | Shadowsocks / VMess / VLESS / Trojan / Hysteria2 / TUIC / HTTP |
| **传输层支持** | TCP / WebSocket / HTTP/2 / gRPC，支持 TLS（含 SNI） |
| **订阅节点** | 支持从 V2Ray/Clash 订阅链接导入节点（内置 120+ 个节点） |

### 路由与诊断
| 功能 | 说明 |
|---|---|
| **预检（Pre-flight）** | 连接 VPN 前自动检查管理员权限、wintun.dll、残留适配器 |
| **路由诊断** | 实时查看网卡、路由表、DNS 配置快照 |
| **残留适配器恢复** | 自动检测并清理崩溃会话遗留的 TUN 适配器 |
| **会话回收** | 核心启动失败时自动清除卡死的会话状态，绝不卡死 |
| **连接测试** | 一键测试服务器端点可达性 |
| **实时日志** | 底部诊断面板实时显示核心输出，可清空 |
| **DNS 刷新** | 断开/恢复网络时自动刷新 DNS 缓存 |

### 更新系统
| 功能 | 说明 |
|---|---|
| **自动检查** | 启动时 + 每 12 小时自动检查 GitHub Releases 新版本 |
| **手动检查** | 设置页「立即检查」按钮 |
| **应用内下载** | 显示下载进度条，下载完成自动运行安装程序 |
| **SHA-256 校验** | 下载完成后校验文件完整性 |
| **发布说明** | 应用内直接查看最新版本的更新内容 |

### 界面
- 🇨🇳 **全中文界面**（连接 / 配置 / 设置三页）
- 深色主题，现代化设计
- 状态徽章：已断开 / 连接中… / 已连接 / 错误
- 内置「数码解码」技术支持入口与 Telegram 群组链接

---

## 📦 安装使用

### 下载安装（普通用户）
1. 到 [Releases](https://github.com/smzxtv/aethon-replica/releases) 页面下载 `Aethon-Replica-v1.0.0-Windows-x64-Installer.exe`
2. 双击安装（Windows 可能提示 SmartScreen，点「仍要运行」）
3. 启动 Aethon Replica

### 快速上手（3 步连接）
1. **配置节点**：左侧「配置」→「添加配置」，或直接使用内置订阅节点
2. **选择模式**：
   - 🔹 **手动 SOCKS5**：推荐新手。点「连接」后系统代理自动开启，浏览器直接上网，**无需任何配置**
   - 🔹 **VPN 模式**：全局代理。需要以**管理员身份**运行程序，所有软件自动走代理
3. **点「连接」**，看到状态变为「已连接」即可

### SOCKS5 模式细节
- 本地监听地址：`127.0.0.1:1819`（端口可在设置页修改）
- 同端口支持 **HTTP 代理** 和 **SOCKS5 代理**（mixed 模式）
- 连接后自动设置系统代理 → Edge / Chrome / 大部分软件直接可用
- 断开时自动还原系统代理为直连
- 手动设置代理的用户：系统代理或 SwitchyOmega 填 `127.0.0.1:1819`

### VPN 模式细节
- 右键程序 → **以管理员身份运行**
- 创建 TUN 虚拟网卡（172.19.0.1/30），接管系统默认路由
- 所有程序零配置直接走代理
- 断开后自动清理路由、刷新 DNS
- 若上次异常退出留下残留适配器，用「恢复适配器」按钮一键清理

### 添加自定义节点
「配置」→「添加配置」，按协议填写：

| 协议 | 必填字段 |
|---|---|
| Shadowsocks | 地址、端口、密码、加密方式（如 aes-128-gcm） |
| VMess | 地址、端口、UUID、传输方式（tcp/ws）、TLS |
| VLESS | 地址、端口、UUID、传输方式、TLS、SNI |
| Trojan | 地址、端口、密码、SNI |
| Hysteria2 | 地址、端口、密码、SNI |
| TUIC | 地址、端口、UUID、密码 |

支持直接粘贴分享链接（`vless://`、`ss://`、`vmess://`、`trojan://`）导入。

---

## 🔧 开发构建

### 环境要求
- Windows 10/11 x64
- Node.js 22+
- Rust stable（x86_64-pc-windows-msvc）
- Visual Studio Build Tools（含 MSVC）

### 开发运行
```powershell
npm ci                # 安装依赖
npm run fetch:core    # 下载 sing-box 核心（SHA-256 校验）
npm test              # 类型检查 + 前端构建
cargo test --manifest-path src-tauri/Cargo.toml --locked   # Rust 测试
npm run tauri dev     # 开发模式启动
```

### 正式打包
```powershell
npm run tauri build   # 输出到 src-tauri/target/release + NSIS 安装包
```

### 项目结构
```
src/               React 前端（连接/配置/设置三页 + 中文 UI）
src-tauri/         Rust 后端
  src/core/
    config.rs      sing-box 配置构建器（多协议 + TUN + mixed 入站）
    session.rs     核心进程生命周期管理（日志泵 + 存活检测）
    routing.rs     TUN 路由助手（预检/诊断/恢复/清理）
    elevate.rs     UAC 提权与重启
    sysproxy.rs    Windows 系统代理自动设置/还原
    updater.rs     GitHub Releases 更新检查 + 下载 + SHA-256
    singbox.rs     核心路径解析
  src/commands.rs  Tauri 命令层（connect/disconnect/路由/更新…）
scripts/           核心下载脚本（SHA-256 校验）
android/           Android 客户端（规划中）
```

### Rust 单元测试
```powershell
cargo test --manifest-path src-tauri/Cargo.toml --locked
```
覆盖：配置构建（各协议/TUN/mixed）、版本比较、系统代理开关。

---

## 🌐 内置节点说明

应用内置了订阅导入功能，节点数据保存在本地配置目录：
```
%APPDATA%\io.github.aethonreplica.desktop\app-state.json
```
首次启动内置一套示例配置；使用你自己的订阅或节点替换即可。详见 [docs/NODES.md](docs/NODES.md)。

---

## ❓ 常见问题

**Q: 连接后浏览器打不开网页？**
A: SOCKS5 模式会自动设置系统代理。如果手动关闭了系统代理，请在 Windows 设置 → 网络和 Internet → 代理 中开启，或重新点一次「连接」。

**Q: VPN 模式报「需要管理员权限」？**
A: 右键程序图标 → 以管理员身份运行。TUN 网卡创建需要管理员权限。

**Q: 报「missing interface address」？**
A: 已在 1.0.0 修复（TUN 自动配置 172.19.0.1/30）。请更新到最新版。

**Q: 断开后上不了网？**
A: 点「恢复网络」按钮，会停止核心 + 还原系统代理 + 刷新 DNS。

**Q: 端口 1819 被占用？**
A: 设置页修改本地端口，保存后重新连接。

---

## 📄 许可

本项目为独立前端，非上游项目。网络引擎使用 [sing-box](https://github.com/SagerNet/sing-box)（GPL-3.0）。

## 💬 技术支持

- Telegram 群组：https://t.me/+tVg48WK48tlkNGVl
- **数码解码** · 出品
