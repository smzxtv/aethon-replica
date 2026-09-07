# 内置节点说明

本文档记录 Aethon Replica 内置/测试过的节点来源。

## 订阅来源

### 来源 1：Cloudflare Pages 订阅
- **订阅链接**：`https://111-6jh.pages.dev/c4f4450f-704a-4c22-afba-5aecffd73289/sub`
- **节点数量**：5 个
- **协议**：VLESS + WebSocket + TLS
- **UUID**：`c4f4450f-704a-4c22-afba-5aecffd73289`
- **节点列表**：

| 名称 | 地址 | 端口 |
|---|---|---|
| 订阅节点-1 | 111-6jh.pages.dev | 443 |
| 订阅节点-2 | cf.090227.xyz | 443 |
| 订阅节点-3 | bestcf.top | 443 |
| 订阅节点-4 | cloudflare.182682.xyz | 443 |
| 订阅节点-5 | cf.zhetengsha.eu.org | 443 |

### 来源 2：主订阅（120+ 节点）
- **订阅链接**：`https://shuma.ccwu.cc/sub?token=75e5d0def89c694458e5c39d9c697402`
- **节点数量**：120 个
- **协议**：VLESS + WebSocket + TLS
- **覆盖地区**：香港、日本、新加坡、美国、加拿大、德国、法国、英国、澳大利亚、台湾、韩国、马来西亚等

> ⚠️ **隐私警告**：以上订阅链接包含你的私人 token，任何拿到链接的人都可以使用你的节点流量。
> 如果此仓库是公开的，建议：
> 1. 不要把带 token 的订阅链接分享给别人
> 2. 定期更换订阅 token
> 3. 或将本仓库设为 Private

## 如何在应用中导入

1. 打开 Aethon Replica
2. 左侧「配置」→「添加配置」
3. 选择协议 VLESS，填入上表中的地址/端口/UUID
4. 传输方式选 WebSocket，TLS 开启
5. 保存 → 回「连接」页选择该节点 → 连接

## 节点存储位置

导入的节点保存在本地（不会上传）：
```
%APPDATA%\io.github.aethonreplica.desktop\app-state.json
```
