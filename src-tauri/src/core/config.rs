use std::collections::HashMap;

use serde_json::{json, Value};

/// Connection parameters coming from the frontend.
#[derive(Clone, Debug)]
pub struct ConnectParams {
    pub mode: String, // "vpn" | "socks5"
    pub protocol: String,
    pub address: String,
    pub port: u16,
    pub params: HashMap<String, String>,
    pub socks_port: u16,
    pub log_level: String,
}

/// Build a sing-box configuration representing one connect() session.
pub fn build_config(p: &ConnectParams) -> Result<Value, String> {
    let mut inbounds: Vec<Value> = Vec::new();
    match p.mode.as_str() {
        "socks5" => inbounds.push(json!({
            "type": "mixed",
            "tag": "socks-in",
            "listen": "127.0.0.1",
            "listen_port": p.socks_port,
        })),
        "vpn" => inbounds.push(json!({
            "type": "tun",
            "tag": "tun-in",
            "auto_route": true,
            "strict_route": true,
            "stack": "mixed",
            "mtu": 1500,
            "address": ["172.19.0.1/30", "fdfe:dcba:9876::1/126"],
            "endpoint_independent_nat": true,
        })),
        other => return Err(format!("unknown mode: {other}")),
    }

    let outbound = build_outbound(&p.protocol, &p.address, p.port, &p.params)?;

    Ok(json!({
        "log": { "level": p.log_level, "timestamp": true },
        "inbounds": inbounds,
        "outbounds": [
            outbound,
            { "type": "direct", "tag": "direct" },
            { "type": "block", "tag": "block" }
        ],
        "route": { "final": "proxy" }
    }))
}

fn build_outbound(
    protocol: &str,
    address: &str,
    port: u16,
    params: &HashMap<String, String>,
) -> Result<Value, String> {
    let mut out = json!({
        "type": protocol,
        "tag": "proxy",
        "server": address,
        "server_port": port,
    });

    match protocol {
        "shadowsocks" => {
            let method = params.get("method").cloned().unwrap_or_else(|| "aes-128-gcm".into());
            let password = params.get("password").ok_or("shadowsocks requires a 'password'")?;
            out["method"] = json!(method);
            out["password"] = json!(password);
        }
        "vmess" => {
            let uuid = params.get("uuid").ok_or("vmess requires a 'uuid'")?;
            out["uuid"] = json!(uuid);
            let security = params.get("security").cloned().unwrap_or_else(|| "auto".into());
            out["security"] = json!(security);
            if let Some(alter_id) = params.get("alter_id") {
                out["alter_id"] = json!(alter_id);
            }
        }
        "vless" => {
            let uuid = params.get("uuid").ok_or("vless requires a 'uuid'")?;
            out["uuid"] = json!(uuid);
            if let Some(flow) = params.get("flow") {
                out["flow"] = json!(flow);
            }
            // Apply TLS if security is "tls" or "reality".
            let security = params.get("security").cloned().unwrap_or_else(|| "tls".into());
            if !security.is_empty() && security != "none" {
                apply_tls(&mut out, params);
            }
            // Apply transport (ws/grpc/http).
            apply_transport(&mut out, params);
        }
        "trojan" => {
            let password = params.get("password").ok_or("trojan requires a 'password'")?;
            out["password"] = json!(password);
            apply_tls(&mut out, params);
            apply_transport(&mut out, params);
        }
        "http" => {
            // HTTP 代理出站：适用于 Cloudflare Worker / 通用 HTTP 代理。
            // 免费 worker 域名走 443 TLS；带 sni 会自动配 server_name。
            apply_tls(&mut out, params);
            if let Some(username) = params.get("username") {
                out["username"] = json!(username);
            }
            if let Some(password) = params.get("password") {
                out["password"] = json!(password);
            }
        }
        "hysteria2" => {
            let password = params.get("password").ok_or("hysteria2 requires a 'password'")?;
            out["password"] = json!(password);
            apply_tls(&mut out, params);
        }
        "tuic" => {
            let uuid = params.get("uuid").ok_or("tuic requires a 'uuid'")?;
            out["uuid"] = json!(uuid);
            if let Some(password) = params.get("password") {
                out["password"] = json!(password);
            }
            apply_tls(&mut out, params);
        }
        other => return Err(format!("unsupported protocol: {other}")),
    }

    Ok(out)
}

fn apply_tls(out: &mut Value, params: &HashMap<String, String>) {
    let mut tls = json!({ "enabled": true });
    if let Some(sni) = params.get("sni") {
        tls["server_name"] = json!(sni);
    }
    if let Some(insecure) = params.get("insecure") {
        tls["insecure"] = json!(insecure == "true" || insecure == "1");
    }
    out["tls"] = tls;
}

fn apply_transport(out: &mut Value, params: &HashMap<String, String>) {
    let transport_type = match params.get("transport") {
        Some(t) if !t.is_empty() => t.as_str(),
        _ => return, // no transport
    };
    let mut transport = json!({ "type": transport_type });
    if let Some(path) = params.get("path") {
        transport["path"] = json!(path);
    }
    if let Some(host) = params.get("host") {
        transport["headers"] = json!({ "host": host });
    }
    out["transport"] = transport;
}

#[cfg(test)]
mod tests {
    use super::*;

    fn params(extra: HashMap<String, String>) -> ConnectParams {
        let mut p = HashMap::new();
        p.insert("password".into(), "secret".into());
        p.extend(extra);
        ConnectParams {
            mode: "socks5".into(),
            protocol: "shadowsocks".into(),
            address: "example.com".into(),
            port: 8388,
            params: p,
            socks_port: 1819,
            log_level: "info".into(),
        }
    }

    #[test]
    fn socks5_inbound_and_listen_port() {
        let cfg = build_config(&params(HashMap::new())).unwrap();
        let inbound = &cfg["inbounds"][0];
        assert_eq!(inbound["type"], "mixed");
        assert_eq!(inbound["listen_port"], 1819);
        assert_eq!(cfg["route"]["final"], "proxy");
    }

    #[test]
    fn vpn_mode_uses_tun_inbound() {
        let mut p = params(HashMap::new());
        p.mode = "vpn".into();
        let cfg = build_config(&p).unwrap();
        assert_eq!(cfg["inbounds"][0]["type"], "tun");
        assert_eq!(cfg["inbounds"][0]["auto_route"], true);
        assert!(cfg["inbounds"][0]["address"].is_array());
    }

    #[test]
    fn shadowsocks_outbound_carries_credentials() {
        let cfg = build_config(&params(HashMap::new())).unwrap();
        let out = &cfg["outbounds"][0];
        assert_eq!(out["type"], "shadowsocks");
        assert_eq!(out["method"], "aes-128-gcm");
        assert_eq!(out["password"], "secret");
        assert_eq!(out["server"], "example.com");
        assert_eq!(out["server_port"], 8388);
    }

    #[test]
    fn vless_with_ws_transport() {
        let mut p = params(HashMap::new());
        p.protocol = "vless".into();
        p.address = "example.com".into();
        p.port = 443;
        p.params.insert("uuid".into(), "abc-123".into());
        p.params.insert("security".into(), "tls".into());
        p.params.insert("sni".into(), "example.com".into());
        p.params.insert("transport".into(), "ws".into());
        p.params.insert("path".into(), "/ws".into());
        p.params.insert("host".into(), "example.com".into());
        let cfg = build_config(&p).unwrap();
        let out = &cfg["outbounds"][0];
        assert_eq!(out["type"], "vless");
        assert_eq!(out["uuid"], "abc-123");
        assert_eq!(out["tls"]["enabled"], true);
        assert_eq!(out["tls"]["server_name"], "example.com");
        assert_eq!(out["transport"]["type"], "ws");
        assert_eq!(out["transport"]["path"], "/ws");
        assert_eq!(out["transport"]["headers"]["host"], "example.com");
    }

    #[test]
    fn unknown_mode_or_protocol_is_rejected() {
        let mut p = params(HashMap::new());
        p.mode = "bogus".into();
        assert!(build_config(&p).is_err());

        let mut p2 = params(HashMap::new());
        p2.protocol = "nope".into();
        assert!(build_config(&p2).is_err());
    }

    #[test]
    fn tls_protocols_get_tls_enabled() {
        let mut p = params(HashMap::new());
        p.protocol = "trojan".into();
        p.params.insert("sni".into(), "cdn.example.com".into());
        let cfg = build_config(&p).unwrap();
        let out = &cfg["outbounds"][0];
        assert_eq!(out["tls"]["enabled"], true);
        assert_eq!(out["tls"]["server_name"], "cdn.example.com");
    }
}