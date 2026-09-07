package io.github.aethonreplica.data

import com.google.gson.Gson
import com.google.gson.reflect.TypeToken

data class AppConfig(
    val id: String = java.util.UUID.randomUUID().toString(),
    val name: String = "",
    val protocol: String = "vless",
    val mode: String = "socks5",
    val server: String = "",
    val serverPort: Int = 443,
    val uuid: String = "",
    val password: String = "",
    val method: String = "aes-128-gcm",
    val tls: String = "tls",
    val sni: String = "",
    val realityPublicKey: String = "",
    val realityShortId: String = "",
    val transport: String = "tcp",
    val wsPath: String = "/",
    val wsHost: String = "",
    val flow: String = "",
    val listenAddress: String = "127.0.0.1",
    val listenPort: Int = 1819,
    val logLevel: String = "info",
    var congestion: String = "cubic"
) {
    companion object {
        private val gson = Gson()
        
        fun fromShareLink(link: String): AppConfig? {
            return try {
                when {
                    link.startsWith("vless://") -> parseVless(link)
                    link.startsWith("vmess://") -> parseVmess(link)
                    link.startsWith("trojan://") -> parseTrojan(link)
                    link.startsWith("ss://") -> parseShadowsocks(link)
                    link.startsWith("hysteria2://") -> parseHysteria2(link)
                    link.startsWith("tuic://") -> parseTuic(link)
                    else -> null
                }
            } catch (e: Exception) {
                null
            }
        }
    }
}
