//! Subscription fetching and share-link parsing.
//!
//! Supports V2Ray-style subscription endpoints (base64 body or plain text)
//! and the common share URI schemes: vless://, trojan://, ss://, vmess://.

use serde::Serialize;
use std::collections::HashMap;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SubscriptionNode {
    pub name: String,
    pub protocol: String,
    pub address: String,
    pub port: u16,
    pub params: HashMap<String, String>,
}

/// Fetch a subscription URL and parse every node found in the body.
pub fn fetch(url: &str) -> Result<Vec<SubscriptionNode>, String> {
    let body = ureq::get(url)
        .timeout(std::time::Duration::from_secs(20))
        .call()
        .map_err(|e| format!("下载订阅失败: {e}"))?
        .into_string()
        .map_err(|e| format!("读取订阅内容失败: {e}"))?;
    parse_body(&body)
}

/// Parse a subscription body: plain share-links or a base64 blob of them.
pub fn parse_body(body: &str) -> Result<Vec<SubscriptionNode>, String> {
    let trimmed = body.trim();
    let text = if trimmed.contains("://") {
        trimmed.to_string()
    } else {
        match b64_decode(trimmed) {
            Ok(decoded) => decoded,
            Err(_) => return Err("订阅内容既不是分享链接也不是 base64".into()),
        }
    };

    let mut nodes: Vec<SubscriptionNode> = Vec::new();
    for line in text.lines().chain(text.split_whitespace()) {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Ok(n) = parse_uri(line) {
            if !nodes.iter().any(|e| {
                e.protocol == n.protocol && e.address == n.address && e.port == n.port && e.name == n.name
            }) {
                nodes.push(n);
            }
        }
    }
    if nodes.is_empty() {
        return Err("订阅中没有可识别的节点".into());
    }
    Ok(nodes)
}

/// Parse a single share URI into a node.
pub fn parse_uri(uri: &str) -> Result<SubscriptionNode, String> {
    if let Some(rest) = uri.strip_prefix("vmess://") {
        return parse_vmess(rest);
    }
    let (scheme, rest) = uri
        .split_once("://")
        .ok_or_else(|| format!("无法识别的链接: {uri}"))?;
    let protocol = match scheme {
        "vless" | "trojan" => scheme,
        "ss" => return parse_ss(rest),
        other => return Err(format!("暂不支持的协议: {other}")),
    };
    parse_userinfo_uri(protocol, rest)
}

/// vless://uuid@host:port?query#name and trojan://password@host:port?query#name
fn parse_userinfo_uri(protocol: &str, rest: &str) -> Result<SubscriptionNode, String> {
    let (body, frag) = split_fragment(rest);
    let (userhost, query) = match body.split_once('?') {
        Some((u, q)) => (u, Some(q)),
        None => (body, None),
    };
    let (userinfo, hostport) = userhost
        .rsplit_once('@')
        .ok_or("链接缺少 @user@host 部分")?;
    let (host, port) = split_host_port(hostport)?;

    let mut params: HashMap<String, String> = HashMap::new();
    if protocol == "vless" {
        params.insert("uuid".into(), pct_decode(userinfo));
    } else {
        params.insert("password".into(), pct_decode(userinfo));
    }
    if let Some(q) = query {
        for pair in q.split('&') {
            let (k, v) = pair.split_once('=').unwrap_or((pair, ""));
            match k {
                "type" => params.insert("transport".into(), pct_decode(v)),
                "security" => params.insert("security".into(), pct_decode(v)),
                "sni" => params.insert("sni".into(), pct_decode(v)),
                "host" => params.insert("host".into(), pct_decode(v)),
                "path" => params.insert("path".into(), pct_decode(v)),
                "flow" => params.insert("flow".into(), pct_decode(v)),
                "serviceName" => params.insert("service_name".into(), pct_decode(v)),
                _ => continue,
            };
        }
    }
    Ok(SubscriptionNode {
        name: pct_decode(frag),
        protocol: protocol.into(),
        address: host,
        port,
        params,
    })
}

/// ss://BASE64(method:password@host:port)#name or ss://b64(method:password)@host:port#name
fn parse_ss(rest: &str) -> Result<SubscriptionNode, String> {
    let (body, frag) = split_fragment(rest);
    let (userhost, _query) = match body.split_once('?') {
        Some((u, q)) => (u, q),
        None => (body, ""),
    };
    let decoded = if userhost.contains('@') {
        let (userinfo, hostport) = userhost.rsplit_once('@').ok_or("ss 链接格式错误")?;
        let userinfo = if userinfo.contains(':') {
            userinfo.to_string()
        } else {
            b64_decode(userinfo)?
        };
        format!("{userinfo}@{hostport}")
    } else {
        b64_decode(userhost)?
    };
    let (userinfo, hostport) = decoded.rsplit_once('@').ok_or("ss 链接缺少 @")?;
    let (method, password) = userinfo.split_once(':').ok_or("ss 链接缺少 method:password")?;
    let (host, port) = split_host_port(hostport)?;
    let mut params = HashMap::new();
    params.insert("method".into(), method.into());
    params.insert("password".into(), password.into());
    Ok(SubscriptionNode {
        name: pct_decode(frag),
        protocol: "shadowsocks".into(),
        address: host,
        port,
        params,
    })
}

/// vmess://BASE64(json)
fn parse_vmess(rest: &str) -> Result<SubscriptionNode, String> {
    let json_text = b64_decode(rest)?;
    let v: serde_json::Value =
        serde_json::from_str(&json_text).map_err(|e| format!("vmess JSON 解析失败: {e}"))?;
    let get = |k: &str| v.get(k).and_then(|x| x.as_str()).unwrap_or("").to_string();
    let port: u16 = v
        .get("port")
        .and_then(|p| p.as_u64())
        .or_else(|| v.get("port").and_then(|p| p.as_str()).and_then(|s| s.parse().ok()))
        .ok_or("vmess 缺少端口")? as u16;

    let mut params = HashMap::new();
    params.insert("uuid".into(), get("id"));
    let net = get("net");
    if !net.is_empty() {
        params.insert("transport".into(), net.clone());
    }
    let tls = get("tls");
    if !tls.is_empty() {
        params.insert("security".into(), tls);
    }
    let host = get("host");
    if !host.is_empty() {
        params.insert("host".into(), host.clone());
        if net == "ws" {
            params.insert("sni".into(), host);
        }
    }
    let path = get("path");
    if !path.is_empty() {
        params.insert("path".into(), path);
    }
    let sni = get("sni");
    if !sni.is_empty() {
        params.insert("sni".into(), sni);
    }
    Ok(SubscriptionNode {
        name: get("ps"),
        protocol: "vmess".into(),
        address: get("add"),
        port,
        params,
    })
}

fn split_fragment(rest: &str) -> (&str, &str) {
    match rest.split_once('#') {
        Some((b, f)) => (b, f),
        None => (rest, ""),
    }
}

/// Split host:port, handling bracketed IPv6 like [::1]:443.
fn split_host_port(s: &str) -> Result<(String, u16), String> {
    let (host, port_str) = if let Some(inner) = s.strip_prefix('[') {
        let end = inner.find(']').ok_or("IPv6 地址缺少右括号")?;
        let host = &inner[..end];
        let after = &inner[end + 1..];
        let port = after.strip_prefix(':').ok_or("IPv6 地址后缺少端口")?;
        (host, port)
    } else {
        s.rsplit_once(':').ok_or("地址缺少端口")?
    };
    let port: u16 = port_str.parse().map_err(|_| format!("无效端口: {port_str}"))?;
    Ok((host.to_string(), port))
}

fn pct_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' if i + 2 < bytes.len() => {
                let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or("");
                match u8::from_str_radix(hex, 16) {
                    Ok(b) => {
                        out.push(b);
                        i += 3;
                    }
                    Err(_) => {
                        out.push(bytes[i]);
                        i += 1;
                    }
                }
            }
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b => {
                out.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Tolerant base64: standard / url-safe, padding optional, whitespace ignored.
fn b64_decode(input: &str) -> Result<String, String> {
    use base64::Engine;
    let cleaned: String = input.chars().filter(|c| !c.is_whitespace()).collect();
    let engines: [base64::engine::GeneralPurpose; 2] = [
        base64::engine::general_purpose::STANDARD,
        base64::engine::general_purpose::URL_SAFE,
    ];
    for engine in engines.iter() {
        for candidate in [cleaned.as_str(), pad_b64(&cleaned).as_str()] {
            if let Ok(bytes) = engine.decode(candidate) {
                return Ok(String::from_utf8_lossy(&bytes).into_owned());
            }
        }
    }
    Err("base64 解码失败".into())
}

fn pad_b64(s: &str) -> String {
    let rem = s.len() % 4;
    if rem == 0 {
        s.to_string()
    } else {
        format!("{}{}", s, "=".repeat(4 - rem))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn b64e(s: &str) -> String {
        use base64::Engine;
        base64::engine::general_purpose::STANDARD.encode(s)
    }

    #[test]
    fn vless_ws_tls_link() {
        let node = parse_uri(
            "vless://6c1e3e2a-1111-2222-3333-444455556666@111-6jh.pages.dev:443?encryption=none&security=tls&sni=cf.example.com&type=ws&host=cf.example.com&path=%2Fsub%3Ftoken%3Dabc#%E9%A6%99%E6%B8%AF-01",
        )
        .unwrap();
        assert_eq!(node.protocol, "vless");
        assert_eq!(node.address, "111-6jh.pages.dev");
        assert_eq!(node.port, 443);
        assert_eq!(node.name, "香港-01");
        assert_eq!(
            node.params.get("uuid").unwrap(),
            "6c1e3e2a-1111-2222-3333-444455556666"
        );
        assert_eq!(node.params.get("transport").unwrap(), "ws");
        assert_eq!(node.params.get("security").unwrap(), "tls");
        assert_eq!(node.params.get("sni").unwrap(), "cf.example.com");
        assert_eq!(node.params.get("host").unwrap(), "cf.example.com");
        assert_eq!(node.params.get("path").unwrap(), "/sub?token=abc");
    }

    #[test]
    fn trojan_grpc_link() {
        let node =
            parse_uri("trojan://pass-word@hk.example.org:443?security=tls&type=grpc&serviceName=trojan-go#HK")
                .unwrap();
        assert_eq!(node.protocol, "trojan");
        assert_eq!(node.params.get("password").unwrap(), "pass-word");
        assert_eq!(node.params.get("transport").unwrap(), "grpc");
        assert_eq!(node.params.get("service_name").unwrap(), "trojan-go");
    }

    #[test]
    fn ss_base64_userinfo_link() {
        let cred = b64e("aes-128-gcm:secret99");
        let node = parse_uri(&format!("ss://{cred}@1.2.3.4:8388#US-node")).unwrap();
        assert_eq!(node.protocol, "shadowsocks");
        assert_eq!(node.params.get("method").unwrap(), "aes-128-gcm");
        assert_eq!(node.params.get("password").unwrap(), "secret99");
        assert_eq!(node.address, "1.2.3.4");
        assert_eq!(node.name, "US-node");
    }

    #[test]
    fn vmess_base64_json_link() {
        let json = r#"{"v":"2","ps":"JP-东京","add":"jp.example.com","port":"443","id":"aaaa-bbbb","net":"ws","host":"cdn.jp.example.com","path":"/ws","tls":"tls"}"#;
        let node = parse_uri(&format!("vmess://{}", b64e(json))).unwrap();
        assert_eq!(node.protocol, "vmess");
        assert_eq!(node.name, "JP-东京");
        assert_eq!(node.address, "jp.example.com");
        assert_eq!(node.port, 443);
        assert_eq!(node.params.get("uuid").unwrap(), "aaaa-bbbb");
        assert_eq!(node.params.get("transport").unwrap(), "ws");
        assert_eq!(node.params.get("sni").unwrap(), "cdn.jp.example.com");
    }

    #[test]
    fn base64_subscription_body() {
        let links = "vless://u1@a.com:443?security=tls&type=ws#N1\nvless://u2@b.com:443?security=tls&type=ws#N2";
        let nodes = parse_body(&b64e(links)).unwrap();
        assert_eq!(nodes.len(), 2);
        assert_eq!(nodes[0].name, "N1");
        assert_eq!(nodes[1].address, "b.com");
    }

    #[test]
    fn ipv6_host_port() {
        let (host, port) = split_host_port("[2001:db8::1]:443").unwrap();
        assert_eq!(host, "2001:db8::1");
        assert_eq!(port, 443);
    }
}
