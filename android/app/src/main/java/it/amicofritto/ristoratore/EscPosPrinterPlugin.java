package it.amicofritto.ristoratore;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.Intent;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONException;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

@CapacitorPlugin(
    name = "EscPosPrinter",
    permissions = {
        @Permission(alias = "bluetoothScan", strings = { Manifest.permission.BLUETOOTH_SCAN }),
        @Permission(alias = "bluetoothConnect", strings = { Manifest.permission.BLUETOOTH_CONNECT })
    }
)
public class EscPosPrinterPlugin extends Plugin {
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805f9b34fb");

    @PluginMethod
    public void ensurePermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            call.resolve(buildPermissionsResult());
            return;
        }

        if (hasBluetoothPermission()) {
            call.resolve(buildPermissionsResult());
            return;
        }

        requestPermissionForAliases(new String[] { "bluetoothScan", "bluetoothConnect" }, call, "bluetoothPermissionCallback");
    }

    @PluginMethod
    @SuppressLint("MissingPermission")
    public void listPairedPrinters(PluginCall call) {
        if (!hasBluetoothPermission()) {
            call.reject("Permesso Bluetooth non concesso");
            return;
        }

        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null) {
            call.reject("Bluetooth non disponibile su questo dispositivo");
            return;
        }

        JSArray printers = new JSArray();
        Set<BluetoothDevice> bondedDevices = adapter.getBondedDevices();
        if (bondedDevices != null) {
            for (BluetoothDevice device : bondedDevices) {
                String address = device.getAddress();
                if (address == null || address.trim().isEmpty()) {
                    continue;
                }

                JSObject entry = new JSObject();
                entry.put("name", device.getName() != null ? device.getName() : "Stampante Bluetooth");
                entry.put("address", address);
                printers.put(entry);
            }
        }

        JSObject result = new JSObject();
        result.put("printers", printers);
        call.resolve(result);
    }

    @PluginMethod
    @SuppressLint("MissingPermission")
    public void printReceipt(PluginCall call) {
        if (!hasBluetoothPermission()) {
            call.reject("Permesso Bluetooth non concesso");
            return;
        }

        String address = call.getString("address", "").trim();
        JSArray linesArray = call.getArray("lines");
        Integer copiesValue = call.getInt("copies", 1);
        int copies = copiesValue != null ? Math.max(1, Math.min(copiesValue, 3)) : 1;

        if (address.isEmpty()) {
            call.reject("Indirizzo stampante mancante");
            return;
        }

        if (linesArray == null || linesArray.length() == 0) {
            call.reject("Contenuto stampa mancante");
            return;
        }

        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null) {
            call.reject("Bluetooth non disponibile su questo dispositivo");
            return;
        }

        BluetoothSocket socket = null;
        OutputStream output = null;

        try {
            BluetoothDevice device = adapter.getRemoteDevice(address);
            adapter.cancelDiscovery();

            socket = device.createRfcommSocketToServiceRecord(SPP_UUID);
            socket.connect();

            output = socket.getOutputStream();
            output.write(buildEscPosPayload(linesArray, copies));
            output.flush();

            JSObject result = new JSObject();
            result.put("ok", true);
            call.resolve(result);
        } catch (IllegalArgumentException error) {
            call.reject("Indirizzo Bluetooth non valido");
        } catch (Exception error) {
            call.reject("Errore stampa Bluetooth: " + safeErrorMessage(error));
        } finally {
            closeQuietly(output);
            closeQuietly(socket);
        }
    }

    @PluginMethod
    public void openBluetoothSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_BLUETOOTH_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception error) {
            call.reject("Impossibile aprire le impostazioni Bluetooth");
        }
    }

    @PermissionCallback
    private void bluetoothPermissionCallback(PluginCall call) {
        if (!hasBluetoothPermission()) {
            call.reject("Permesso Bluetooth non concesso");
            return;
        }

        call.resolve(buildPermissionsResult());
    }

    private JSObject buildPermissionsResult() {
        JSObject result = new JSObject();
        result.put("bluetoothScan", permissionStateToString(getPermissionState("bluetoothScan")));
        result.put("bluetoothConnect", permissionStateToString(getPermissionState("bluetoothConnect")));
        return result;
    }

    private boolean hasBluetoothPermission() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.S
            || (
                getPermissionState("bluetoothScan") == PermissionState.GRANTED
                && getPermissionState("bluetoothConnect") == PermissionState.GRANTED
            );
    }

    private String permissionStateToString(PermissionState state) {
        return state.toString().toLowerCase(Locale.US);
    }

    private byte[] buildEscPosPayload(JSArray linesArray, int copies) throws JSONException, IOException {
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();

        for (int copy = 0; copy < copies; copy++) {
            buffer.write(new byte[] { 0x1B, 0x40 });
            buffer.write(new byte[] { 0x1B, 0x61, 0x00 });
            buffer.write(new byte[] { 0x1B, 0x74, 0x00 });
            buffer.write(new byte[] { 0x1B, 0x45, 0x00 });
            buffer.write(new byte[] { 0x1D, 0x21, 0x01 });

            for (int index = 0; index < linesArray.length(); index++) {
                String rawLine = linesArray.isNull(index) ? "" : linesArray.getString(index);
                String line = normalizeForPrinter(rawLine);
                writeStyledLine(buffer, line);
            }

            buffer.write(new byte[] { 0x1B, 0x45, 0x00 });
            buffer.write(new byte[] { 0x1D, 0x21, 0x00 });
            buffer.write(new byte[] { 0x1B, 0x64, 0x04 });
            buffer.write(new byte[] { 0x1D, 0x56, 0x00 });
        }

        return buffer.toByteArray();
    }

    private void writeStyledLine(ByteArrayOutputStream buffer, String line) throws IOException {
        if (isLargeLine(line)) {
            buffer.write(new byte[] { 0x1B, 0x45, 0x01 });
            buffer.write(new byte[] { 0x1D, 0x21, 0x11 });
        } else {
            buffer.write(new byte[] { 0x1B, 0x45, 0x00 });
            buffer.write(new byte[] { 0x1D, 0x21, 0x01 });
        }

        buffer.write(line.getBytes(StandardCharsets.US_ASCII));
        buffer.write('\n');
    }

    private boolean isLargeLine(String line) {
        String trimmed = line != null ? line.trim() : "";
        if (trimmed.isEmpty()) return false;

        return trimmed.equals("AMICO FRITTO")
            || trimmed.startsWith("COMANDA #")
            || trimmed.equals("DOMICILIO")
            || trimmed.equals("ASPORTO")
            || trimmed.equals("TEST STAMPANTE BLUETOOTH");
    }

    private String normalizeForPrinter(String value) {
        String input = value != null ? value : "";
        String normalized = Normalizer.normalize(input, Normalizer.Form.NFD).replaceAll("\\p{M}+", "");
        normalized = normalized.replace("€", " EUR ");
        normalized = normalized.replaceAll("[^\\x20-\\x7E]", "");
        return normalized;
    }

    private String safeErrorMessage(Exception error) {
        String message = error.getMessage();
        return message != null && !message.trim().isEmpty() ? message.trim() : error.getClass().getSimpleName();
    }

    private void closeQuietly(OutputStream output) {
        if (output == null) return;

        try {
            output.close();
        } catch (IOException ignored) {
            // Ignore close errors.
        }
    }

    private void closeQuietly(BluetoothSocket socket) {
        if (socket == null) return;

        try {
            socket.close();
        } catch (IOException ignored) {
            // Ignore close errors.
        }
    }
}
