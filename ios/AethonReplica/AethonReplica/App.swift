import SwiftUI
import Foundation
import NetworkExtension
import os.log

@main
struct AethonReplicaApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}

struct ContentView: View {
    @StateObject private var appState = AppState()
    
    var body: some View {
        TabView {
            ConnectView()
                .tabItem {
                    Label("连接", systemImage: "power")
                }
                .environmentObject(appState)
            
            ConfigurationsView()
                .tabItem {
                    Label("配置", systemImage: "list.bullet")
                }
                .environmentObject(appState)
            
            SettingsView()
                .tabItem {
                    Label("设置", systemImage: "gear")
                }
                .environmentObject(appState)
        }
    }
}

class AppState: ObservableObject {
    @Published var status: SessionStatus = .disconnected
    @Published var profiles: [ServerProfile] = []
    @Published var selectedProfileId: String?
    @Published var logs: [String] = []
    @Published var mode: String = "socks5"
    
    var selectedProfile: ServerProfile? {
        guard let id = selectedProfileId else { return profiles.first }
        return profiles.first { $0.id == id }
    }
    
    init() {
        loadProfiles()
    }
    
    func loadProfiles() {
        if let data = UserDefaults.standard.data(forKey: "profiles"),
           let decoded = try? JSONDecoder().decode([ServerProfile].self, from: data) {
            profiles = decoded
        }
        selectedProfileId = UserDefaults.standard.string(forKey: "selectedProfile")
    }
    
    func saveProfiles() {
        if let encoded = try? JSONEncoder().encode(profiles) {
            UserDefaults.standard.set(encoded, forKey: "profiles")
        }
    }
    
    func selectProfile(_ profile: ServerProfile) {
        selectedProfileId = profile.id
        UserDefaults.standard.set(profile.id, forKey: "selectedProfile")
    }
    
    func addLog(_ message: String) {
        DispatchQueue.main.async {
            self.logs.append(message)
            if self.logs.count > 100 {
                self.logs.removeFirst()
            }
        }
    }
}

enum SessionStatus {
    case disconnected
    case connecting
    case connected
    case error
}

struct ServerProfile: Codable, Identifiable {
    let id: String
    var name: String
    var protocol: String
    var server: String
    var serverPort: Int
    var uuid: String
    var password: String
    var method: String
    var tls: String
    var sni: String
    var transport: String
    var wsPath: String
    var wsHost: String
    var flow: String
    
    init(id: String = UUID().uuidString, name: String = "", protocol: String = "vless", server: String = "", serverPort: Int = 443, uuid: String = "", password: String = "", method: String = "aes-128-gcm", tls: String = "tls", sni: String = "", transport: String = "tcp", wsPath: String = "/", wsHost: String = "", flow: String = "") {
        self.id = id
        self.name = name
        self.protocol = `protocol`
        self.server = server
        self.serverPort = serverPort
        self.uuid = uuid
        self.password = password
        self.method = method
        self.tls = tls
        self.sni = sni
        self.transport = transport
        self.wsPath = wsPath
        self.wsHost = wsHost
        self.flow = flow
    }
}
