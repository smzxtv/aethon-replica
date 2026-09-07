import SwiftUI
import NetworkExtension

struct ConnectView: View {
    @EnvironmentObject var appState: AppState
    @State private var scanMode = "off"
    
    var statusColor: Color {
        switch appState.status {
        case .connected: return .green
        case .connecting: return .orange
        case .error: return .red
        case .disconnected: return .gray
        }
    }
    
    var statusText: String {
        switch appState.status {
        case .connected: return "已连接"
        case .connecting: return "连接中..."
        case .error: return "错误"
        case .disconnected: return "已断开"
        }
    }
    
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 16) {
                    // Status Card
                    VStack(spacing: 12) {
                        Image(systemName: appState.status == .connected ? "checkmark.circle.fill" : "power")
                            .font(.system(size: 60))
                            .foregroundColor(statusColor)
                        
                        Text(statusText)
                            .font(.title)
                            .fontWeight(.bold)
                            .foregroundColor(statusColor)
                        
                        if let profile = appState.selectedProfile {
                            Text(profile.name)
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(24)
                    .background(statusColor.opacity(0.1))
                    .cornerRadius(12)
                    
                    // Connect Button
                    Button(action: toggleConnection) {
                        Text(appState.status == .connected ? "断开连接" : "连接")
                            .font(.headline)
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity)
                            .frame(height: 50)
                            .background(appState.status == .connected ? Color.red : Color.green)
                            .cornerRadius(12)
                    }
                    
                    // Profile Picker
                    Picker("服务器配置", selection: Binding(
                        get: { appState.selectedProfileId ?? "" },
                        set: { appState.selectProfile(appState.profiles.first { $0.id == $0 } ?? ServerProfile()) }
                    )) {
                        ForEach(appState.profiles) { profile in
                            Text(profile.name).tag(profile.id)
                        }
                    }
                    .pickerStyle(MenuPickerStyle())
                    
                    // Mode Picker
                    Picker("模式", selection: $appState.mode) {
                        Text("SOCKS5").tag("socks5")
                        Text("VPN").tag("vpn")
                    }
                    .pickerStyle(SegmentedPickerStyle())
                    
                    // Scan Mode
                    Picker("扫描模式", selection: $scanMode) {
                        Text("关闭").tag("off")
                        Text("快速").tag("fast")
                        Text("完整").tag("full")
                    }
                    .pickerStyle(SegmentedPickerStyle())
                    
                    // Logs
                    VStack(alignment: .leading) {
                        Text("诊断日志")
                            .font(.headline)
                        
                        ScrollView {
                            VStack(alignment: .leading, spacing: 4) {
                                ForEach(appState.logs, id: \.self) { log in
                                    Text(log)
                                        .font(.system(.caption, design: .monospaced))
                                        .foregroundColor(log.contains("[错误]") ? .red : .primary)
                                }
                            }
                        }
                        .frame(height: 150)
                        .background(Color(.systemGray6))
                        .cornerRadius(8)
                    }
                }
                .padding()
            }
            .navigationTitle("连接")
        }
    }
    
    func toggleConnection() {
        if appState.status == .connected {
            SingBoxCore.shared.disconnect { success in
                DispatchQueue.main.async {
                    appState.status = .disconnected
                    appState.addLog("session stopped")
                }
            }
        } else {
            guard let profile = appState.selectedProfile else {
                appState.addLog("[提示] 请先在「配置」页添加一个服务器配置")
                return
            }
            
            appState.status = .connecting
            SingBoxCore.shared.connect(profile: profile, mode: appState.mode) { success, error in
                DispatchQueue.main.async {
                    if success {
                        appState.status = .connected
                        appState.addLog("sing-box started (iOS)")
                    } else {
                        appState.status = .error
                        appState.addLog("[错误] \(error ?? "Unknown error")")
                    }
                }
            }
        }
    }
}
