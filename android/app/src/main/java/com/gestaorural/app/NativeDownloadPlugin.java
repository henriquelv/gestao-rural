package com.gestaorural.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.Locale;

@CapacitorPlugin(
    name = "NativeDownload",
    permissions = {
        @Permission(alias = "storage", strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE }),
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class NativeDownloadPlugin extends Plugin {
    private static final String DOWNLOAD_FOLDER = "Gestao Rural";
    private static final String CHANNEL_ID = "gestao_rural_downloads";

    @PluginMethod
    public void save(PluginCall call) {
        if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.P && getPermissionState("storage") != PermissionState.GRANTED) {
            requestPermissionForAlias("storage", call, "storagePermissionCallback");
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "notificationPermissionCallback");
            return;
        }
        saveFile(call);
    }

    @PermissionCallback
    private void storagePermissionCallback(PluginCall call) {
        if (getPermissionState("storage") != PermissionState.GRANTED) {
            call.reject("Permissão necessária para salvar o arquivo em Downloads.");
            return;
        }
        saveFile(call);
    }

    @PermissionCallback
    private void notificationPermissionCallback(PluginCall call) {
        // Mesmo sem notificação, o download deve ser concluído e permanecer acessível.
        saveFile(call);
    }

    private void saveFile(PluginCall call) {
        String base64 = call.getString("base64", "");
        String requestedName = call.getString("fileName", "exportacao.xlsx");
        String mimeType = normalizeMimeType(call.getString("mimeType", "application/octet-stream"));
        String fileName = sanitizeFileName(requestedName);

        if (base64.isEmpty()) {
            call.reject("Arquivo vazio.");
            return;
        }

        Uri createdUri = null;
        try {
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                createdUri = saveWithMediaStore(bytes, fileName, mimeType);
            } else {
                createdUri = saveLegacy(bytes, fileName, mimeType);
            }

            boolean notificationShown = showDownloadNotification(createdUri, fileName, mimeType);
            JSObject result = new JSObject();
            result.put("uri", createdUri.toString());
            result.put("notificationShown", notificationShown);
            call.resolve(result);
        } catch (Exception error) {
            if (createdUri != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                try {
                    getContext().getContentResolver().delete(createdUri, null, null);
                } catch (Exception ignored) {
                    // Remove somente o arquivo parcial criado por esta chamada.
                }
            }
            call.reject("Não foi possível salvar a planilha em Downloads.", error);
        }
    }

    private Uri saveWithMediaStore(byte[] bytes, String fileName, String mimeType) throws Exception {
        ContentResolver resolver = getContext().getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
        values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
        values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/" + DOWNLOAD_FOLDER);
        values.put(MediaStore.MediaColumns.IS_PENDING, 1);

        Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (uri == null) throw new IllegalStateException("O Android não criou o arquivo em Downloads.");
        try (OutputStream output = resolver.openOutputStream(uri, "w")) {
            if (output == null) throw new IllegalStateException("O Android não abriu o arquivo para escrita.");
            output.write(bytes);
            output.flush();
        }
        values.clear();
        values.put(MediaStore.MediaColumns.IS_PENDING, 0);
        resolver.update(uri, values, null, null);
        return uri;
    }

    @SuppressWarnings("deprecation")
    private Uri saveLegacy(byte[] bytes, String fileName, String mimeType) throws Exception {
        File downloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
        File folder = new File(downloads, DOWNLOAD_FOLDER);
        if (!folder.exists() && !folder.mkdirs()) throw new IllegalStateException("Não foi possível criar a pasta de Downloads.");

        File target = uniqueFile(folder, fileName);
        try (FileOutputStream output = new FileOutputStream(target)) {
            output.write(bytes);
            output.flush();
        }
        return FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", target);
    }

    private File uniqueFile(File folder, String fileName) {
        File candidate = new File(folder, fileName);
        if (!candidate.exists()) return candidate;
        int dot = fileName.lastIndexOf('.');
        String base = dot > 0 ? fileName.substring(0, dot) : fileName;
        String extension = dot > 0 ? fileName.substring(dot) : "";
        int suffix = 2;
        while (candidate.exists()) candidate = new File(folder, base + " (" + suffix++ + ")" + extension);
        return candidate;
    }

    private boolean showDownloadNotification(Uri uri, String fileName, String mimeType) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && getPermissionState("notifications") != PermissionState.GRANTED) {
            return false;
        }

        Context context = getContext();
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Downloads de planilhas", NotificationManager.IMPORTANCE_DEFAULT);
            channel.setDescription("Arquivos exportados pelo Gestão Rural");
            manager.createNotificationChannel(channel);
        }

        Intent view = new Intent(Intent.ACTION_VIEW);
        view.setDataAndType(uri, mimeType);
        view.setClipData(ClipData.newRawUri("planilha", uri));
        view.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        Intent chooser = Intent.createChooser(view, "Abrir planilha");
        chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) pendingFlags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pendingIntent = PendingIntent.getActivity(context, fileName.hashCode(), chooser, pendingFlags);

        NotificationCompat.Builder notification = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download_done)
            .setContentTitle("Planilha pronta")
            .setContentText("Toque para abrir " + fileName)
            .setStyle(new NotificationCompat.BigTextStyle().bigText("Arquivo salvo em Downloads/" + DOWNLOAD_FOLDER + ". Toque para abrir " + fileName + "."))
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT);
        NotificationManagerCompat.from(context).notify(Math.abs(fileName.hashCode()), notification.build());
        return true;
    }

    private String sanitizeFileName(String value) {
        String sanitized = String.valueOf(value).replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
        if (sanitized.isEmpty()) sanitized = "exportacao.xlsx";
        return sanitized.length() > 120 ? sanitized.substring(0, 120) : sanitized;
    }

    private String normalizeMimeType(String value) {
        String mime = String.valueOf(value).toLowerCase(Locale.ROOT);
        if (mime.contains("spreadsheetml")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        if (mime.startsWith("text/csv")) return "text/csv";
        return "application/octet-stream";
    }
}
