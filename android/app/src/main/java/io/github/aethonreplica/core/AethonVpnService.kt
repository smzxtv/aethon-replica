package io.github.aethonreplica.core

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import android.net.VpnService
import android.os.Build
import android.os.ParcelFileDescriptor
import android.util.Log
import io.github.aethonreplica.R
import io.github.aethonreplica.ui.MainActivity
import java.io.File

/**
 * Android VpnService implementation for Aethon.
 * Manages the TUN interface and starts the sing-box core.
 */
class AethonVpnService : VpnService() {

    companion object {
        private const val TAG = "AethonVpnService"
        private const val NOTIFICATION_CHANNEL_ID = "aethon_vpn"
        private const val NOTIFICATION_ID = 1
        
        const val ACTION_CONNECT = "io.github.aethonreplica.CONNECT"
        const val ACTION_DISCONNECT = "io.github.aethonreplica.DISCONNECT"
        const val EXTRA_CONFIG_PATH = "config_path"
        
        @Volatile
        var isRunning = false
            private set
    }
    
    private var vpnInterface: ParcelFileDescriptor? = null
    private var coreProcess: Process? = null
    
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_CONNECT -> {
                val configPath = intent.getStringExtra(EXTRA_CONFIG_PATH)
                if (configPath != null) {
                    startVpn(configPath)
                }
            }
            ACTION_DISCONNECT -> {
                stopVpn()
            }
        }
        return START_STICKY
    }
    
    private fun startVpn(configPath: String) {
        try {
            // Build VPN interface
            val builder = Builder()
                .setSession("Aethon VPN")
                .setMtu(1500)
                .addAddress("172.19.0.1", 30)
                .addAddress("fdfe:dcba:9876::1", 126)
                .addRoute("0.0.0.0", 0)
                .addRoute("::", 0)
                .addDnsServer("8.8.8.8")
                .addDnsServer("1.1.1.1")
                .addDnsServer("2001:4860:4860::8888")
                .setBlocking(true)
                .setMeteredHint(false)
            
            // Allow app bypass for Aethon itself
            try {
                builder.addAllowedApplication(packageName)
            } catch (e: PackageManager.NameNotFoundException) {
                Log.w(TAG, "Could not allow own package", e)
            }
            
            vpnInterface = builder.establish()
            
            if (vpnInterface == null) {
                Log.e(TAG, "Failed to establish VPN interface")
                return
            }
            
            // Start sing-box core
            startSingBoxCore(configPath)
            
            isRunning = true
            startForeground(NOTIFICATION_ID, createNotification())
            
            Log.i(TAG, "VPN started successfully")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start VPN", e)
            stopVpn()
        }
    }
    
    private fun startSingBoxCore(configPath: String) {
        val corePath = applicationInfo.nativeLibraryDir + "/libsing-box.so"
        val command = listOf(
            corePath,
            "run",
            "-c",
            configPath,
            "-D",
            filesDir.absolutePath
        )
        
        val processBuilder = ProcessBuilder(command)
        processBuilder.redirectErrorStream(true)
        coreProcess = processBuilder.start()
        
        // Log output
        Thread {
            try {
                coreProcess?.inputStream?.bufferedReader()?.useLines { lines ->
                    lines.forEach { line ->
                        Log.i("sing-box", line)
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error reading core output", e)
            }
        }.start()
    }
    
    private fun stopVpn() {
        try {
            coreProcess?.destroy()
            coreProcess = null
            
            vpnInterface?.close()
            vpnInterface = null
            
            isRunning = false
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            
            Log.i(TAG, "VPN stopped")
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping VPN", e)
        }
    }
    
    private fun createNotification(): Notification {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                "Aethon VPN",
                NotificationManager.IMPORTANCE_LOW
            )
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
        
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE
        )
        
        return Notification.Builder(this, NOTIFICATION_CHANNEL_ID)
            .setContentTitle("Aethon VPN")
            .setContentText("VPN is active")
            .setSmallIcon(R.drawable.ic_shield)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build()
    }
    
    override fun onDestroy() {
        stopVpn()
        super.onDestroy()
    }
    
    override fun onRevoke() {
        stopVpn()
        super.onRevoke()
    }
}
