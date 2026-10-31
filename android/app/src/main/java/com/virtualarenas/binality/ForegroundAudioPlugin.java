package com.virtualarenas.binality;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.lang.ref.WeakReference;

/**
 * JS bridge for the playback foreground service. Used via BinalityPlatform.keepAlive
 * (js/platform.js); not called directly from app code.
 *
 * Methods: start({title}), stop(), checkNotificationPermission(),
 * requestNotificationPermission(). Event: "stopRequested" (notification Stop tapped).
 * Denying POST_NOTIFICATIONS never blocks playback: the service still runs, just without a
 * visible notification.
 */
@CapacitorPlugin(
    name = "ForegroundAudio",
    permissions = {
        @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications")
    }
)
public class ForegroundAudioPlugin extends Plugin {

    private static WeakReference<ForegroundAudioPlugin> instance = new WeakReference<>(null);

    @Override
    public void load() {
        instance = new WeakReference<>(this);
    }

    @Override
    protected void handleOnDestroy() {
        if (instance.get() == this) {
            instance = new WeakReference<>(null);
        }
    }

    /** Called by the service when the notification Stop action is tapped. */
    static boolean requestStopFromNotification() {
        ForegroundAudioPlugin p = instance.get();
        if (p == null) return false;
        p.notifyListeners("stopRequested", new JSObject(), true);
        return true;
    }

    private boolean notificationsGranted() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
                || getPermissionState("notifications") == PermissionState.GRANTED;
    }

    private JSObject permissionResult() {
        JSObject ret = new JSObject();
        ret.put("granted", notificationsGranted());
        return ret;
    }

    @PluginMethod
    public void checkNotificationPermission(PluginCall call) {
        call.resolve(permissionResult());
    }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (notificationsGranted()) {
            call.resolve(permissionResult());
        } else {
            requestPermissionForAlias("notifications", call, "notificationPermissionCallback");
        }
    }

    @PermissionCallback
    private void notificationPermissionCallback(PluginCall call) {
        call.resolve(permissionResult());
    }

    @PluginMethod
    public void start(PluginCall call) {
        Context ctx = getContext();
        Intent intent = new Intent(ctx, AudioForegroundService.class);
        intent.putExtra(AudioForegroundService.EXTRA_TITLE, call.getString("title", ""));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ctx.startForegroundService(intent);
        } else {
            ctx.startService(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Context ctx = getContext();
        ctx.stopService(new Intent(ctx, AudioForegroundService.class));
        call.resolve();
    }
}
