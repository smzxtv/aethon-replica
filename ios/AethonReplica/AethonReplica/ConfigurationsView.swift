import SwiftUI

struct ConfigurationsView: View {
    @EnvironmentObject var appState: AppState
    @State private var showingAddSheet = false
    
    var body: some View {
        NavigationView {
            List {
                ForEach(appState.profiles) { profile in
                    VStack(alignment: .leading) {
                        Text(profile.name).font(.headline)
                        Text("\(profile.server):\(profile.serverPort)").font(.caption).foregroundColor(.secondary)
                    }
                }
                .onDelete(perform: deleteProfile)
            }
            .navigationTitle("配置")
            .toolbar {
                Button(action: { showingAddSheet = true }) {
                    Image(systemName: "plus")
                }
            }
            .sheet(isPresented: $showingAddSheet) {
                AddProfileView()
                    .environmentObject(appState)
            }
        }
    }
    
    func deleteProfile(at offsets: IndexSet) {
        appState.profiles.remove(atOffsets: offsets)
        appState.saveProfiles()
    }
}

struct AddProfileView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) var dismiss
    @State private var name = ""
    @State private var protocol = "vless"
    @State private var server = ""
    @State private var port = "443"
    @State private var uuid = ""
    @State private var password = ""
    
    var body: some View {
        NavigationView {
            Form {
                Section("基本信息") {
                    TextField("名称", text: $name)
                    Picker("协议", selection: $protocol) {
                        Text("VLESS").tag("vless")
                        Text("VMess").tag("vmess")
                        Text("Trojan").tag("trojan")
                        Text("Shadowsocks").tag("shadowsocks")
                    }
                }
                Section("服务器") {
                    TextField("地址", text: $server)
                    TextField("端口", text: $port)
                    TextField("UUID/密码", text: $uuid)
                }
            }
            .navigationTitle("添加配置")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("保存") {
                        let profile = ServerProfile(
                            name: name.isEmpty ? "未命名" : name,
                            protocol: protocol,
                            server: server,
                            serverPort: Int(port) ?? 443,
                            uuid: uuid,
                            password: password
                        )
                        appState.profiles.append(profile)
                        appState.saveProfiles()
                        dismiss()
                    }
                }
            }
        }
    }
}
