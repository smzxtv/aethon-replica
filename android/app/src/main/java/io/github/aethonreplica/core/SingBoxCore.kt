package io.github.aethonreplica.core

import android.content.Context
import android.content.Intent
import android.net.VpnService
import android.os.ParcelFileDescriptor
import android.util.Log
import com.google.gson.Gson
import com.google.gson.JsonObject
import com.google.gson.JsonArray
import io.github.aethonreplica.data.AppConfig
import java.io.File
import java.util.concurrent.atomic.AtomicReference

/**
 * sing-box core manager for Android.
 * Manages the native sing-box process and TUN interface.
 */
class SingBoxCore private constructor() {
    
    companion object {
        private const val TAG = "SingBoxCore"
        
        @Volatile
        private var instance: SingBoxCore? = null
        
        fun getInstance(): SingBoxCore {
            return instance ?: synchronized(this) {
                instance ?: SingBoxCore().also { instance = it }
            }
        }
    }
    
    private val _status = AtomicReference(SessionStatus.DISCONNECTED)
    val status: SessionStatus get() = _status.get()
    
    private var vpnInterface: ParcelFileDescriptor? = null
    private val gson = Gson()
    
    fun connect(context: Context, config: AppConfig, listener: CoreListener): Boolean {
        if (_status.get() == SessionStatus.CONNECTED) {
            listener.onError("A session is already active; disconnect first")
            return false
        }
        
        _status.set(SessionStatus.CONNECTING)
        listener.onStatusChanged(SessionStatus.CONNECTING)
        
        try {
            val configJson = buildConfig(config)
            val configFile = File(context.filesDir, "singbox_config.json")
            configFile.writeText(configJson)
            
            val prepareIntent = VpnService.prepare(context)
            if (prepareIntent != null) {
                listener.onVpnPermissionRequired(prepareIntent)
                _status.set(SessionStatus.DISCONNECTED)
                return false
            }
    
    private fun buildConfig(config: AppConfig): String {
        val root = JsonObject()
        
        val log = JsonObject()
        log.addProperty("level", config.logLevel.ifEmpty { "info" })
        root.add("log", log)
        
        val inbounds = JsonArray()
        
        val socksInbound = JsonObject()
        socksInbound.addProperty("type", "socks")
        socksInbound.addProperty("tag", "socks-in")
        socksInbound.addProperty("listen", config.listenAddress.ifEmpty { "127.0.0.1" })
        socksInbound.addProperty("listen_port", config.listenPort)
        inbounds.add(socksInbound)
        
        if (config.mode == "vpn") {
            val tunInbound = JsonObject()
            tunInbound.addProperty("type", "tun")
            tunInbound.addProperty("tag", "tun-in")
            tunInbound.addProperty("interface_name", "aethon-tun")
            tunInbound.addProperty("address", "172.19.0.1/30")
            tunInbound.addProperty("auto_route", true)
            tunInbound.addProperty("strict_route", false)
            tunInbound.addProperty("stack", "system")
            inbounds.add(tunInbound)
        }
        
        root.add("inbounds", inbounds)
        
        val outbounds = JsonArray()
        outbounds.add(buildOutbound(config))
        
        val directOutbound = JsonObject()
        directOutbound.addProperty("type", "direct")
        directOutbound.addProperty("tag", "direct")
        outbounds.add(directOutbound)
        
        root.add("outbounds", outbounds)
        
        val route = JsonObject()
        val rules = JsonArray()
        
        val privateRule = JsonObject()
        val privateIpDst = JsonArray()
        listOf("0.0.0.0/8", "10.0.0.0/8", "127.0.0.0/8", "169.254.0.0/16", "172.16.0.0/12", "192.168.0.0/16", "224.0.0.0/4").forEach { privateIpDst.add(it) }
        privateRule.add("ip_cidr", privateIpDst)
        privateRule.addProperty("outbound", "direct")
        rules.add(privateRule)
        
        route.add("rules", rules)
    
    private fun buildOutbound(config: AppConfig): JsonObject {
        val outbound = JsonObject()
        
        when (config.protocol) {
            "vless" -> {
                outbound.addProperty("type", "vless")
                outbound.addProperty("tag", "proxy")
                outbound.addProperty("server", config.server)
                outbound.addProperty("server_port", config.serverPort)
                outbound.addProperty("uuid", config.uuid)
                
                if (config.flow.isNotEmpty()) {
                    outbound.addProperty("flow", config.flow)
                }
                
                if (config.tls == "tls" || config.tls == "reality") {
                    val tls = JsonObject()
                    tls.addProperty("enabled", true)
                    tls.addProperty("server_name", config.sni.ifEmpty { config.server })
                    
                    if (config.tls == "reality") {
                        val reality = JsonObject()
                        reality.addProperty("enabled", true)
                        reality.addProperty("public_key", config.realityPublicKey)
                        reality.addProperty("short_id", config.realityShortId)
                        tls.add("reality", reality)
                    }
                    outbound.add("tls", tls)
                }
                
                if (config.transport == "ws") {
                    val transport = JsonObject()
                    transport.addProperty("type", "ws")
                    transport.addProperty("path", config.wsPath.ifEmpty { "/" })
                    val headers = JsonObject()
                    headers.addProperty("Host", config.wsHost.ifEmpty { config.server })
                    transport.add("headers", headers)
                    outbound.add("transport", transport)
                }
            }
            
            "trojan" -> {
                outbound.addProperty("type", "trojan")
                outbound.addProperty("tag", "proxy")
                outbound.addProperty("server", config.server)
                outbound.addProperty("server_port", config.serverPort)
                outbound.addProperty("password", config.password)
                
                if (config.tls == "tls") {
                    val tls = JsonObject()
                    tls.addProperty("enabled", true)
                    tls.addProperty("server_name", config.sni.ifEmpty { config.server })
                    outbound.add("tls", tls)
                }
            }
            
            "shadowsocks" -> {
                outbound.addProperty("type", "shadowsocks")
                outbound.addProperty("tag", "proxy")
                outbound.addProperty("server", config.server)
                outbound.addProperty("server_port", config.serverPort)
                outbound.addProperty("method", config.method.ifEmpty { "aes-128-gcm" })
                outbound.addProperty("password", config.password)
            }
            
            "vmess" -> {
                outbound.addProperty("type", "vmess")
                outbound.addProperty("tag", "proxy")
                outbound.addProperty("server", config.server)
                outbound.addProperty("server_port", config.serverPort)
                outbound.addProperty("uuid", config.uuid)
                outbound.addProperty("security", config.method.ifEmpty { "auto" })
            }
            
            "hysteria2" -> {
                outbound.addProperty("type", "hysteria2")
                outbound.addProperty("tag", "proxy")
                outbound.addProperty("server", config.server)
                outbound.addProperty("server_port", config.serverPort)
                outbound.addProperty("password", config.password)
                
                if (config.tls == "tls") {
                    val tls = JsonObject()
                    tls.addProperty("enabled", true)
                    tls.addProperty("server_name", config.sni.ifEmpty { config.server })
                    outbound.add("tls", tls)
                }
            }
            
            "tuic" -> {
                outbound.addProperty("type", "tuic")
                outbound.addProperty("tag", "proxy")
                outbound.addProperty("server", config.server)
                outbound.addProperty("server_port", config.serverPort)
                outbound.addProperty("uuid", config.uuid)
                outbound.addProperty("password", config.password)
                outbound.addProperty("congestion_control", "cubic")
                
                if (config.tls == "tls") {
                    val tls = JsonObject()
                    tls.addProperty("enabled", true)
                    tls.addProperty("server_name", config.sni.ifEmpty { config.server })
                    outbound.add("tls", tls)
                }
            }
            
            else -> {
                outbound.addProperty("type", "direct")
                outbound.addProperty("tag", "proxy")
            }
        }
        
        return outbound
    }
    
    interface CoreListener {
        fun onStatusChanged(status: SessionStatus)
        fun onLog(message: String)
        fun onError(error: String)
        fun onVpnPermissionRequired(intent: Intent)
    }
}

enum class SessionStatus {
    DISCONNECTED,
    CONNECTING,
    CONNECTED,
    ERROR
}
        route.addProperty("auto_detect_interface", true)
        root.add("route", route)
        
        return gson.toJson(root)
    }

            
            val intent = Intent(context, AethonVpnService::class.java).apply {
                action = AethonVpnService.ACTION_CONNECT
                putExtra(AethonVpnService.EXTRA_CONFIG_PATH, configFile.absolutePath)
            }
            context.startService(intent)
            
            _status.set(SessionStatus.CONNECTED)
            listener.onStatusChanged(SessionStatus.CONNECTED)
            listener.onLog("sing-box started (Android)")
            
            return true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to connect", e)
            _status.set(SessionStatus.ERROR)
            listener.onError(e.message ?: "Unknown error")
            return false
        }
    }
    
    fun disconnect(context: Context, listener: CoreListener) {
        try {
            val intent = Intent(context, AethonVpnService::class.java).apply {
                action = AethonVpnService.ACTION_DISCONNECT
            }
            context.startService(intent)
            
            _status.set(SessionStatus.DISCONNECTED)
            listener.onStatusChanged(SessionStatus.DISCONNECTED)
            listener.onLog("session stopped")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to disconnect", e)
            listener.onError(e.message ?: "Disconnect failed")
        }
    }
