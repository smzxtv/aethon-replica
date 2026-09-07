package io.github.aethonreplica.data

import com.google.gson.Gson

/**
 * Parse share links into AppConfig.
 * Supports: vless://, vmess://, trojan://, ss://, hysteria2://, tuic://
 */
object ShareLinkParser {
    private val gson = Gson()
    
    fun parse(link: String): AppConfig? {
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
    
    private fun parseVless(link: String): AppConfig {
        val uri = java.net.URI(link.substring(8))
        val params = parseQuery(uri.query)
        
        return AppConfig(
            name = uri.fragment?.let { java.net.URLDecoder.decode(it, "UTF-8") } ?: "VLESS",
            protocol = "vless",
            server = uri.host,
            serverPort = uri.port.takeIf { it > 0 } ?: 443,
            uuid = uri.userInfo,
            flow = params["flow"] ?: "",
            tls = params["security"]?.takeIf { it != "none" } ?: "tls",
            sni = params["sni"] ?: "",
            realityPublicKey = params["pbk"] ?: "",
            realityShortId = params["sid"] ?: "",
            transport = params["type"] ?: "tcp",
            wsPath = params["path"] ?: "/",
            wsHost = params["host"] ?: ""
        )
    }
    
    private fun parseVmess(link: String): AppConfig {
        val base64 = link.substring(8)
        val json = String(android.util.Base64.decode(base64, android.util.Base64.DEFAULT))
        val map = gson.fromJson(json, Map::class.java)
        
        return AppConfig(
            name = map["ps"]?.toString() ?: "VMess",
            protocol = "vmess",
            server = map["add"]?.toString() ?: "",
            serverPort = map["port"]?.toString()?.toIntOrNull() ?: 443,
            uuid = map["id"]?.toString() ?: "",
            method = map["scy"]?.toString() ?: "auto",
            tls = map["tls"]?.toString()?.takeIf { it != "none" } ?: "tls",
            sni = map["sni"]?.toString() ?: "",
            transport = map["net"]?.toString() ?: "tcp",
            wsPath = map["path"]?.toString() ?: "/",
            wsHost = map["host"]?.toString() ?: ""
        )
    }
    
    private fun parseTrojan(link: String): AppConfig {
        val uri = java.net.URI(link.substring(9))
        val params = parseQuery(uri.query)
        
        return AppConfig(
            name = uri.fragment?.let { java.net.URLDecoder.decode(it, "UTF-8") } ?: "Trojan",
            protocol = "trojan",
            server = uri.host,
            serverPort = uri.port.takeIf { it > 0 } ?: 443,
            password = uri.userInfo,
            tls = params["security"]?.takeIf { it != "none" } ?: "tls",
            sni = params["sni"] ?: "",
            transport = params["type"] ?: "tcp",
            wsPath = params["path"] ?: "/",
            wsHost = params["host"] ?: ""
        )
    }
    
    private fun parseShadowsocks(link: String): AppConfig {
        val uri = java.net.URI(link.substring(5))
        val userInfo = String(android.util.Base64.decode(uri.userInfo, android.util.Base64.DEFAULT))
        val parts = userInfo.split(":")
        
        return AppConfig(
            name = uri.fragment?.let { java.net.URLDecoder.decode(it, "UTF-8") } ?: "SS",
            protocol = "shadowsocks",
            server = uri.host,
            serverPort = uri.port.takeIf { it > 0 } ?: 443,
            method = parts.getOrNull(0) ?: "aes-128-gcm",
            password = parts.getOrNull(1) ?: ""
        )
    }
    
    private fun parseHysteria2(link: String): AppConfig {
        val uri = java.net.URI(link.substring(12))
        val params = parseQuery(uri.query)
        
        return AppConfig(
            name = uri.fragment?.let { java.net.URLDecoder.decode(it, "UTF-8") } ?: "Hysteria2",
            protocol = "hysteria2",
            server = uri.host,
            serverPort = uri.port.takeIf { it > 0 } ?: 443,
            password = uri.userInfo,
            tls = "tls",
            sni = params["sni"] ?: "",
            realityPublicKey = params["pbk"] ?: "",
            realityShortId = params["sid"] ?: ""
        )
    }
    
    private fun parseTuic(link: String): AppConfig {
        val uri = java.net.URI(link.substring(7))
        val params = parseQuery(uri.query)
        
        return AppConfig(
            name = uri.fragment?.let { java.net.URLDecoder.decode(it, "UTF-8") } ?: "TUIC",
            protocol = "tuic",
            server = uri.host,
            serverPort = uri.port.takeIf { it > 0 } ?: 443,
            uuid = uri.userInfo.split(":").firstOrNull() ?: "",
            password = uri.userInfo.split(":").getOrNull(1) ?: "",
            tls = "tls",
            sni = params["sni"] ?: "",
            congestion = params["congestion"] ?: "cubic"
        )
    }
    
    private fun parseQuery(query: String?): Map<String, String> {
        if (query.isNullOrEmpty()) return emptyMap()
        return query.split("&").associate { param ->
            val parts = param.split("=", limit = 2)
            parts[0] to (parts.getOrNull(1) ?: "")
        }
    }
}
