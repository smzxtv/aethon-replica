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
            "type": "socks",
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
        }
        "trojan" => {
            let password = params.get("password").ok_or("trojan requires a 'password'")?;
            out["password"] = json!(password);
            apply_tls(&mut out, params);
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