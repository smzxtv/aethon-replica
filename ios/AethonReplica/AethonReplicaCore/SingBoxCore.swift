import Foundation
import NetworkExtension
import os.log

class SingBoxCore {
    static let shared = SingBoxCore()
    private var vpnManager: NETunnelProviderManager?
    private init() {}
    
    func connect(profile: ServerProfile, mode: String, completion: @escaping (Bool, String?) -> Void) {
        let config = buildConfig(profile: profile, mode: mode)
        NETunnelProviderManager.loadAllFromPreferences { managers, error in
            let manager = managers?.first ?? NETunnelProviderManager()
            manager.localizedDescription = "Aethon VPN"
            let proto = NETunnelProviderProtocol()
            proto.providerConfiguration = ["config": config]
            proto.serverAddress = "Aethon VPN"
            manager.protocolConfiguration = proto
            manager.isEnabled = true
            manager.saveToPreferences { error in
                if let error = error {
                    completion(false, error.localizedDescription)
                    return
                }
                self.vpnManager = manager
                do {
                    try manager.connection.startVPNTunnel()
                    completion(true, nil)
                } catch {
                    completion(false, error.localizedDescription)
                }
            }
        }
    }
    
    func disconnect(completion: @escaping (Bool) -> Unit) {
        guard let manager = vpnManager else { completion(true); return }
        manager.connection.stopVPNTunnel()
        completion(true)
    }
    
    private func buildConfig(profile: ServerProfile, mode: String) -> String {
        var config: [String: Any] = ["log": ["level": "info"]]
        var inbounds: [[String: Any]] = [["type": "socks", "tag": "socks-in", "listen": "127.0.0.1", "listen_port": 1819]]
        if mode == "vpn" {
            inbounds.append(["type": "tun", "tag": "tun-in", "interface_name": "aethon-tun", "address": ["172.19.0.1/30", "fdfe:dcba:9876::1/126"], "auto_route": true, "strict_route": false, "stack": "system"])
        }
        config["inbounds"] = inbounds
        config["outbounds"] = [buildOutbound(profile: profile), ["type": "direct", "tag": "direct"]]
        config["route"] = ["rules": [["ip_cidr": ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"], "outbound": "direct"]], "auto_detect_interface": true]
        if let data = try? JSONSerialization.data(withJSONObject: config), let json = String(data: data, encoding: .utf8) { return json }
        return "{}"
    }
    
    private func buildOutbound(profile: ServerProfile) -> [String: Any] {
        var out: [String: Any] = ["tag": "proxy", "server": profile.server, "server_port": profile.serverPort]
        out[`profile`.protocol] = `profile`.protocol == "vless" || `profile`.protocol == "vmess" || `profile`.protocol == "tuic" ? profile.uuid : profile.password
        if profile.tls == "tls" { out["tls"] = ["enabled": true, "server_name": profile.sni.isEmpty ? profile.server : profile.sni] }
        return out
    }
}
