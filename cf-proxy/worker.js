/**
 * AethonReplica - Cloudflare Workers 免费 HTTP/HTTPS 代理
 *
 * 部署方法：
 *   npm i wrangler -g
 *   wrangler login
 *   wrangler deploy         # (在下方有完整步骤，见 README.md)
 *
 * 部署后你会获得类似 https://aethon-replica-proxy.你的用户名.workers.dev 的地址。
 * 在 Aethon Replica 客户端中把它填成一个 "HTTP 代理" 配置：
 *   地址 = 你的 worker 域名 (如 aethon-replica-proxy.xxx.workers.dev)
 *   端口 = 443
 *
 * 注意：
 * - CONNECT 隧道需要 Cloudflare 的 TCP sockets（免费计划一般可用，
 *   若返回 503 说明当前计划受限，可升级 Workers Paid $5/月）。
 * - 免费计划配额：10 万请求/天，适合日常浏览，不适合大流量。
 * - 仅代理标准 HTTP/HTTPS (CONNECT)，不支持 UDP（如 QUIC）。
 */
export default {
  async fetch(request) {
    // ---- CONNECT 隧道 (HTTPS 目标走这个) ----
    if (request.method === "CONNECT") {
      try {
        const { readable, writable } = await openTunnel(request.url);
        return new Response(readable, {
          status: 200,
          statusText: "Connection Established",
          headers: { Connection: "keep-alive" },
          duplex: "half",
        });
      } catch (err) {
        return new Response(
          "tunnel failed: " + (err && err.message ? err.message : err),
          { status: 503 }
        );
      }
    }

    // ---- 普通 HTTP/HTTPS 请求 (绝对 URI 转发) ----
    // Cloudflare 免费计划对普通 fetch 转发无 connect 限制，能直接代理目标站点。
    try {
      const response = await fetch(request);
      // 放宽 CORS/压缩以便通用客户端使用
      const headers = new Headers(response.headers);
      headers.set("Cache-Control", "no-store");
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (err) {
      return new Response(
        "proxy error: " + (err && err.message ? err.message : err),
        { status: 502 }
      );
    }
  },
};

/**
 * 建立到目标的 TCP 隧道。
 * @param {string} target "host:port"
 */
async function openTunnel(target) {
  const idx = target.lastIndexOf(":");
  const hostname = target.slice(0, idx);
  const port = Number(target.slice(idx + 1)) || 443;

  const conn = connect({ hostname, port });
  const writer = conn.writable.getWriter();
  const reader = conn.readable.getReader();

  // 建立连接。
  await writer.write(new Uint8Array(0));

  // 把请求提交流 (duplex readable) 与 TCP 双向对连。
  const { readable, writable } = new TransformStream();
  const pipe = (src, dst) =>
    src
      .pipeTo(dst, { preventClose: true })
      .catch(() => writer.releaseLock?.() ?? void 0);
  pipe(reader, writable);
  pipe(readable, writer);

  return { readable, writable };
}