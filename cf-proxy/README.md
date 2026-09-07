# Cloudflare Workers 免费代理 - 部署指南

用这个盒子里的 `worker.js` 在 Cloudflare 的免费服务器上部署一个代理，
部署完成后你会得到 `https://你的子域名.workers.dev` 的免费代理地址，
不需要花钱买 VPS。

## ⚠️ 先阅读（诚实说明）

- **免费计划配额**：每天 10 万次请求，适合日常网页浏览、看文字/图片；
  看视频、下载大文件会很快用完。
- **速度**：由 Cloudflare 的节点决定，一般比 VPS 慢一些，但仍能访问 Google。
- **仅支持 HTTP/HTTPS (CONNECT)**：部分需要 UDP 的功能（游戏、QUIC/HTTP3）不支持。
- 如果 Cloudflare 收紧策略，此方案可能失效——免费方案的天花板就在这。

## 部署步骤（约 10 分钟）

### 1. 注册 Cloudflare 账号（免费）
打开 https://dash.cloudflare.com/sign-up ，用邮箱注册并登录。

### 2. 安装部署工具（Node.js 已装）
在 PowerShell 执行：
```powershell
npm install -g wrangler
```

### 3. 登录 Cloudflare
```powershell
cd C:\Users\smjm\.cline\data\workspaces\chat\aethon-replica\cf-proxy
wrangler login
```
浏览器会弹出授权页面，点 **Allow** 登录你的账号。

### 4. 创建 worker 并部署
```powershell
wrangler deploy
```
如果提示输入名称，输入 `aethon-proxy` 回车即可。

部署成功后终端会显示：
```
Uploaded aethon-proxy (1.36 sec)
Deployed aethon-proxy (1.69 sec)
  https://aethon-proxy.<你的用户名>.workers.dev
  https://aethon-proxy.<你的用户名>.workers.dev/*  (路由)
```

### 5. 验证代理可用
```powershell
curl -x http://aethon-proxy.<你的用户名>.workers.dev:80 -o NUL -w "%{http_code}" https://www.google.com
```
> 返回 `200` 即成功。（注意这里临时用 80 端口验证转发，因为 wokers.dev 免费域名 443 走 TLS；
> 客户端用 https 访问 443 经 CONNECT 隧道更通用——若 443 隧道受限，改用下方备选。）

## 填进 Aethon Replica 客户端

1. 打开客户端 → 「配置」→「添加配置」
2. 填写：
   - 名称：`Cloudflare 免费代理`
   - 协议：**HTTP 代理（Cloudflare）**（客户端已支持）
   - 地址：`aethon-proxy.<你的用户名>.workers.dev`
   - 端口：`443`
   - 用户名/密码：留空
3. 「保存」→ 回「连接」页 → 选「手动 SOCKS5」→ 「连接」
4. 把系统代理设为 `127.0.0.1:1819`，尝试访问 https://www.google.com

## 常见问题

| 现象 | 原因 | 解决 |
|---|---|---|
| `curl: (56) CONNECT 隧道失败` | 免费计划 TCP sockets 受限 | 升级 Workers Paid（$5/月）或改用普通 HTTP 转发目标 |
| 返回 `403` | 目标站反代/Cloudflare 检测流量 | 换其他站点测试；偶尔 IP 共享被限 |
| 速度很慢 | 免费节点拥堵 | 换一个最近的机房区域部署 worker（Settings → Workers → 选择区域） |

## 免责声明

此方案仅供学习、测试与合规地访问互联网使用。请遵守你所在地区的法律法规。