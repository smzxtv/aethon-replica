package io.github.aethonreplica.data

import android.content.Context
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken

class ProfileStorage(private val context: Context) {
    
    private val prefs = context.getSharedPreferences("profiles", Context.MODE_PRIVATE)
    private val gson = Gson()
    
    fun getProfiles(): List<AppConfig> {
        val json = prefs.getString("profiles_list", null) ?: return emptyList()
        val type = object : TypeToken<List<AppConfig>>() {}.type
        return gson.fromJson(json, type) ?: emptyList()
    }
    
    fun saveProfiles(profiles: List<AppConfig>) {
        prefs.edit().putString("profiles_list", gson.toJson(profiles)).apply()
    }
    
    fun addProfile(profile: AppConfig) {
        val profiles = getProfiles().toMutableList()
        profiles.add(profile)
        saveProfiles(profiles)
    }
    
    fun updateProfile(profile: AppConfig) {
        val profiles = getProfiles().toMutableList()
        val index = profiles.indexOfFirst { it.id == profile.id }
        if (index >= 0) {
            profiles[index] = profile
            saveProfiles(profiles)
        }
    }
    
    fun deleteProfile(id: String) {
        val profiles = getProfiles().filter { it.id != id }
        saveProfiles(profiles)
    }
    
    fun getSelectedProfileId(): String? {
        return prefs.getString("selected_profile", null)
    }
    
    fun setSelectedProfileId(id: String) {
        prefs.edit().putString("selected_profile", id).apply()
    }
}
