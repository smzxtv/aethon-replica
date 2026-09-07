package io.github.aethonreplica.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.aethonreplica.core.SessionStatus
import io.github.aethonreplica.core.SingBoxCore
import io.github.aethonreplica.data.AppConfig
import io.github.aethonreplica.data.ProfileStorage

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConnectScreen() {
    val context = LocalContext.current
    val storage = remember { ProfileStorage(context) }
    val core = remember { SingBoxCore.getInstance() }
    
    var profiles by remember { mutableStateOf(storage.getProfiles()) }
    var selectedProfile by remember { 
        mutableStateOf(storage.getSelectedProfileId()?.let { id -> profiles.find { it.id == id } })
    }
    var status by remember { mutableStateOf(core.status) }
    var logs by remember { mutableStateOf(listOf<String>()) }
    var mode by remember { mutableStateOf("socks5") }
    var scanMode by remember { mutableStateOf("off") }
    
    LaunchedEffect(Unit) {
        profiles = storage.getProfiles()
        if (selectedProfile == null && profiles.isNotEmpty()) {
            selectedProfile = profiles.first()
        }
    }
    
    val statusColor by animateColorAsState(
        when (status) {
            SessionStatus.CONNECTED -> Color(0xFF3FB950)
            SessionStatus.CONNECTING -> Color(0xFFD29922)
            SessionStatus.ERROR -> Color(0xFFF85149)
            else -> Color(0xFF8B949E)
        },
        label = "statusColor"
    )
    
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = statusColor.copy(alpha = 0.1f))
        ) {
            Column(
                modifier = Modifier.padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Icon(
                    imageVector = when (status) {
                        SessionStatus.CONNECTED -> Icons.Filled.CheckCircle
                        SessionStatus.CONNECTING -> Icons.Filled.Sync
                        SessionStatus.ERROR -> Icons.Filled.Error
                        else -> Icons.Filled.PowerOff
                    },
                    contentDescription = null,
                    tint = statusColor,
                    modifier = Modifier.size(64.dp)
                )
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    text = when (status) {
                        SessionStatus.CONNECTED -> "已连接"
                        SessionStatus.CONNECTING -> "连接中..."
                        SessionStatus.ERROR -> "错误"
                        else -> "已断开"
                    },
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold,
                    color = statusColor
                )
            }
        }
        
        Spacer(modifier = Modifier.height(16.dp))
        
        Button(
            onClick = {
                if (status == SessionStatus.CONNECTED) {
                    core.disconnect(context, createListener { status = it }, { logs = (logs + it).takeLast(100) })
                } else {
                    val profile = selectedProfile
                    if (profile == null) {
                        logs = (logs + "[提示] 请先在「配置」页添加一个服务器配置").takeLast(100)
                    } else {
                        core.connect(context, profile.copy(mode = mode), createListener { status = it }, { logs = (logs + it).takeLast(100) })
                    }
                }
            },
            modifier = Modifier.fillMaxWidth().height(56.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = if (status == SessionStatus.CONNECTED) Color(0xFFF85149) else Color(0xFF238636)
            )
        ) {
            Text(
                text = if (status == SessionStatus.CONNECTED) "断开连接" else "连接",
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold
            )
        }
    }
}

private fun createListener(
    onStatus: (SessionStatus) -> Unit,
    onLog: (String) -> Unit
) = object : SingBoxCore.CoreListener {
    override fun onStatusChanged(status: SessionStatus) { onStatus(status) }
    override fun onLog(message: String) { onLog(message) }
    override fun onError(error: String) { onLog("[错误] $error") }
    override fun onVpnPermissionRequired(intent: android.content.Intent) {}
}
