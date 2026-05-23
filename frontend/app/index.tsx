import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  Pressable,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import Animated, { FadeIn } from "react-native-reanimated";

import { API, Conversion, safeFilename } from "@/src/lib/converter";
import { HistoryRow } from "@/src/components/HistoryRow";
import { PlayerModal } from "@/src/components/PlayerModal";
import { ConfirmDelete } from "@/src/components/ConfirmDelete";

export default function Index() {
  const [url, setUrl] = useState("");
  const [converting, setConverting] = useState(false);
  const [history, setHistory] = useState<Conversion[]>([]);
  const [selected, setSelected] = useState<Conversion | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Conversion | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/conversions`);
      if (r.ok) {
        const data = await r.json();
        setHistory(data);
      }
    } catch (e) {
      console.warn("history load failed", e);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handlePaste = async () => {
    const text = await Clipboard.getStringAsync();
    if (text) setUrl(text.trim());
  };

  const handleConvert = async () => {
    Keyboard.dismiss();
    const trimmed = url.trim();
    if (!trimmed) {
      Alert.alert("Missing URL", "Paste an audio URL first.");
      return;
    }
    setConverting(true);
    try {
      const r = await fetch(`${API}/api/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Conversion failed");
      setHistory((prev) => [data, ...prev.filter((p) => p.id !== data.id)]);
      setUrl("");
      setSelected(data);
    } catch (e: any) {
      Alert.alert("Conversion failed", e?.message || "Unknown error");
    } finally {
      setConverting(false);
    }
  };

  const handleSaveToFiles = async () => {
    if (!selected) return;
    setDownloading(true);
    try {
      const name = safeFilename(selected.title);
      const fileUri = `${FileSystem.cacheDirectory}${name}.mp3`;
      const { uri } = await FileSystem.downloadAsync(
        `${API}/api/file/${selected.id}`,
        fileUri
      );
      const can = await Sharing.isAvailableAsync();
      if (!can) {
        Alert.alert("Sharing unavailable", `Saved locally at:\n${uri}`);
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: "audio/mpeg",
        dialogTitle: "Save MP3 to Files",
        UTI: "public.mp3",
      });
    } catch (e: any) {
      Alert.alert("Save failed", e?.message || "Could not save the MP3.");
    } finally {
      setDownloading(false);
    }
  };

  const handleDelete = async (item: Conversion) => {
    try {
      await fetch(`${API}/api/conversions/${item.id}`, { method: "DELETE" });
      setHistory((p) => p.filter((c) => c.id !== item.id));
      if (selected?.id === item.id) setSelected(null);
    } catch {}
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={styles.flex} onPress={Keyboard.dismiss}>
          <View style={styles.header}>
            <View style={styles.brandRow}>
              <View style={styles.brandDot} />
              <Text style={styles.brandLabel} testID="brand-label">
                AURAL / MP3
              </Text>
            </View>
            <Text style={styles.headline} testID="app-title">
              AUDIO{"\n"}TO MP3.
            </Text>
            <Text style={styles.subhead}>
              Paste a SoundCloud, YouTube, or direct audio URL. We convert it
              to a clean 192 kbps MP3 you can save to Files.
            </Text>
          </View>

          <ScrollView
            style={styles.listWrap}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>RECENT CONVERSIONS</Text>
              <Text style={styles.sectionCount}>
                {history.length.toString().padStart(2, "0")}
              </Text>
            </View>

            {history.length === 0 ? (
              <Animated.View
                entering={FadeIn.duration(300)}
                style={styles.emptyBox}
                testID="empty-state"
              >
                <Ionicons name="musical-notes-outline" size={28} color="#A0A0A0" />
                <Text style={styles.emptyTitle}>NO TRACKS YET</Text>
                <Text style={styles.emptyBody}>
                  Convert your first audio URL to see it here.
                </Text>
              </Animated.View>
            ) : (
              history.map((item, idx) => (
                <HistoryRow
                  key={item.id}
                  item={item}
                  index={idx}
                  onOpen={setSelected}
                  onRequestDelete={setPendingDelete}
                />
              ))
            )}
            <View style={styles.bottomSpacer} />
          </ScrollView>

          <View style={styles.dock} testID="convert-dock">
            <View style={styles.inputWrap}>
              <TextInput
                value={url}
                onChangeText={setUrl}
                placeholder="https://soundcloud.com/..."
                placeholderTextColor="#5a5a5a"
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                returnKeyType="go"
                onSubmitEditing={handleConvert}
                editable={!converting}
                testID="url-input"
              />
              <TouchableOpacity
                onPress={handlePaste}
                style={styles.pasteBtn}
                testID="paste-button"
              >
                <Ionicons name="clipboard-outline" size={18} color="#fff" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.convertBtn, converting && { opacity: 0.7 }]}
              onPress={handleConvert}
              disabled={converting}
              activeOpacity={0.85}
              testID="convert-button"
            >
              {converting ? (
                <View style={styles.convertingRow}>
                  <ActivityIndicator color="#fff" />
                  <Text style={styles.convertLabel}>CONVERTING…</Text>
                </View>
              ) : (
                <Text style={styles.convertLabel}>CONVERT TO MP3</Text>
              )}
            </TouchableOpacity>
          </View>
        </Pressable>
      </KeyboardAvoidingView>

      <PlayerModal
        track={selected}
        downloading={downloading}
        onClose={() => setSelected(null)}
        onSave={handleSaveToFiles}
      />

      <ConfirmDelete
        target={pendingDelete}
        onCancel={() => setPendingDelete(null)}
        onConfirm={(item) => {
          handleDelete(item);
          setPendingDelete(null);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: "#050505" },
  header: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8 },
  brandRow: { flexDirection: "row", alignItems: "center", marginBottom: 24 },
  brandDot: {
    width: 10,
    height: 10,
    backgroundColor: "#FF3B30",
    marginRight: 10,
  },
  brandLabel: {
    color: "#A0A0A0",
    fontFamily: "JetBrainsMono_700Bold",
    fontSize: 11,
    letterSpacing: 3,
  },
  headline: {
    color: "#fff",
    fontFamily: "Outfit_900Black",
    fontSize: 44,
    lineHeight: 46,
    letterSpacing: -2,
    textTransform: "uppercase",
  },
  subhead: {
    color: "#A0A0A0",
    fontFamily: "JetBrainsMono_400Regular",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 14,
    maxWidth: "92%",
  },
  listWrap: { flex: 1, marginTop: 8 },
  listContent: { paddingHorizontal: 24, paddingTop: 18 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    paddingTop: 16,
    marginBottom: 8,
  },
  sectionLabel: {
    color: "#A0A0A0",
    fontFamily: "JetBrainsMono_700Bold",
    fontSize: 10,
    letterSpacing: 2.5,
  },
  sectionCount: {
    color: "#FF3B30",
    fontFamily: "JetBrainsMono_700Bold",
    fontSize: 10,
    letterSpacing: 2.5,
  },
  emptyBox: { marginTop: 40, alignItems: "center", paddingHorizontal: 24 },
  emptyTitle: {
    color: "#fff",
    fontFamily: "Outfit_900Black",
    fontSize: 18,
    letterSpacing: 2,
    marginTop: 14,
  },
  emptyBody: {
    color: "#A0A0A0",
    fontFamily: "JetBrainsMono_400Regular",
    fontSize: 12,
    textAlign: "center",
    marginTop: 8,
    maxWidth: 260,
  },
  bottomSpacer: { height: 220 },
  dock: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: Platform.OS === "ios" ? 32 : 20,
    backgroundColor: "rgba(5,5,5,0.96)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    height: 56,
    backgroundColor: "#121212",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    marginBottom: 10,
  },
  input: {
    flex: 1,
    color: "#fff",
    fontFamily: "JetBrainsMono_400Regular",
    fontSize: 14,
    paddingHorizontal: 14,
    height: "100%",
  },
  pasteBtn: {
    width: 52,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    borderLeftWidth: 1,
    borderLeftColor: "rgba(255,255,255,0.08)",
  },
  convertBtn: {
    height: 60,
    backgroundColor: "#FF3B30",
    alignItems: "center",
    justifyContent: "center",
  },
  convertingRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  convertLabel: {
    color: "#fff",
    fontFamily: "Outfit_900Black",
    fontSize: 16,
    letterSpacing: 2,
  },
});
