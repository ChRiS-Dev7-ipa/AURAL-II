import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  TouchableWithoutFeedback,
  Image,
  Alert,
  Modal,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";

const API = process.env.EXPO_PUBLIC_BACKEND_URL;
const FALLBACK_ART =
  "https://images.unsplash.com/photo-1580656449278-e8381933522c?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzF8MHwxfHNlYXJjaHwxfHx2aW55bCUyMHJlY29yZCUyMGFic3RyYWN0fGVufDB8fHx8MTc3OTUyMTgwNnww&ixlib=rb-4.1.0&q=85";

type Conversion = {
  id: string;
  url: string;
  title: string;
  artist?: string | null;
  duration?: number | null;
  thumbnail?: string | null;
  filename: string;
  size_bytes: number;
  created_at: string;
};

function formatDuration(seconds?: number | null): string {
  if (!seconds || seconds <= 0) return "--:--";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatBytes(b: number): string {
  if (!b) return "0 KB";
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export default function Index() {
  const [url, setUrl] = useState("");
  const [converting, setConverting] = useState(false);
  const [history, setHistory] = useState<Conversion[]>([]);
  const [selected, setSelected] = useState<Conversion | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Conversion | null>(null);

  const audioUri = useMemo(
    () => (selected ? `${API}/api/file/${selected.id}` : null),
    [selected]
  );
  const player = useAudioPlayer(audioUri);
  const status = useAudioPlayerStatus(player);

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
      if (!r.ok) {
        throw new Error(data.detail || "Conversion failed");
      }
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
      const safeName =
        (selected.title || "audio")
          .replace(/[^a-zA-Z0-9 _-]/g, "")
          .trim()
          .slice(0, 80) || "audio";
      const fileUri = `${FileSystem.cacheDirectory}${safeName}.mp3`;
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

  const handleDelete = async (id: string) => {
    try {
      await fetch(`${API}/api/conversions/${id}`, { method: "DELETE" });
      setHistory((p) => p.filter((c) => c.id !== id));
      if (selected?.id === id) setSelected(null);
    } catch {}
  };

  const togglePlay = () => {
    if (!player) return;
    if (status?.playing) player.pause();
    else player.play();
  };

  const closePlayer = () => {
    try {
      player?.pause();
    } catch {}
    setSelected(null);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={{ flex: 1 }}>
            {/* Header */}
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

            {/* History list */}
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
                  <Animated.View
                    key={item.id}
                    entering={FadeInDown.delay(idx * 40).duration(280)}
                  >
                    <View style={styles.row}>
                      <TouchableOpacity
                        onPress={() => setSelected(item)}
                        activeOpacity={0.7}
                        style={styles.rowMain}
                        testID={`history-item-${idx}`}
                      >
                        <Image
                          source={{ uri: item.thumbnail || FALLBACK_ART }}
                          style={styles.thumb}
                        />
                        <View style={{ flex: 1, marginLeft: 14 }}>
                          <Text numberOfLines={1} style={styles.rowTitle}>
                            {item.title}
                          </Text>
                          <Text numberOfLines={1} style={styles.rowMeta}>
                            {(item.artist || "UNKNOWN").toUpperCase()} ·{" "}
                            {formatDuration(item.duration)} ·{" "}
                            {formatBytes(item.size_bytes)}
                          </Text>
                        </View>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setPendingDelete(item)}
                        hitSlop={12}
                        style={styles.rowDelete}
                        testID={`delete-item-${idx}`}
                      >
                        <Ionicons name="close" size={20} color="#A0A0A0" />
                      </TouchableOpacity>
                    </View>
                  </Animated.View>
                ))
              )}
              <View style={{ height: 220 }} />
            </ScrollView>

            {/* Bottom dock: URL input + Convert */}
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
                style={[
                  styles.convertBtn,
                  converting && { opacity: 0.7 },
                ]}
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
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      {/* Player modal */}
      <Modal
        visible={!!selected}
        animationType="slide"
        transparent
        onRequestClose={closePlayer}
      >
        <View style={styles.modalBackdrop}>
          <ScrollView
            style={styles.modalSheet}
            contentContainerStyle={styles.modalSheetContent}
            showsVerticalScrollIndicator={false}
            testID="player-modal"
          >
            <View style={styles.modalHandle} />
            <View style={styles.modalTopRow}>
              <Text style={styles.modalLabel}>NOW PLAYING</Text>
              <TouchableOpacity onPress={closePlayer} testID="close-player">
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            {selected ? (
              <>
                <Image
                  source={{ uri: selected.thumbnail || FALLBACK_ART }}
                  style={styles.modalArt}
                />
                <Text style={styles.modalTitle} numberOfLines={2}>
                  {selected.title}
                </Text>
                <Text style={styles.modalMeta}>
                  {(selected.artist || "UNKNOWN").toUpperCase()} ·{" "}
                  {formatDuration(selected.duration)}
                </Text>

                {/* Progress */}
                <View style={styles.progressBg}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${
                          status?.duration
                            ? Math.min(
                                100,
                                ((status.currentTime || 0) / status.duration) *
                                  100
                              )
                            : 0
                        }%`,
                      },
                    ]}
                  />
                </View>
                <View style={styles.timeRow}>
                  <Text style={styles.timeText}>
                    {formatDuration(status?.currentTime)}
                  </Text>
                  <Text style={styles.timeText}>
                    {formatDuration(status?.duration || selected.duration)}
                  </Text>
                </View>

                {/* Transport */}
                <View style={styles.transport}>
                  <TouchableOpacity
                    onPress={() => {
                      if (player) player.seekTo(Math.max(0, (status?.currentTime || 0) - 10));
                    }}
                    style={styles.transportBtn}
                    testID="seek-back"
                  >
                    <Ionicons name="play-back" size={22} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={togglePlay}
                    style={styles.playBtn}
                    testID="play-pause"
                  >
                    <Ionicons
                      name={status?.playing ? "pause" : "play"}
                      size={28}
                      color="#050505"
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      if (player && status?.duration)
                        player.seekTo(
                          Math.min(status.duration, (status?.currentTime || 0) + 10)
                        );
                    }}
                    style={styles.transportBtn}
                    testID="seek-forward"
                  >
                    <Ionicons name="play-forward" size={22} color="#fff" />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[styles.saveBtn, downloading && { opacity: 0.7 }]}
                  onPress={handleSaveToFiles}
                  disabled={downloading}
                  testID="save-to-files"
                >
                  {downloading ? (
                    <ActivityIndicator color="#050505" />
                  ) : (
                    <>
                      <Ionicons
                        name="download-outline"
                        size={20}
                        color="#050505"
                      />
                      <Text style={styles.saveLabel}>SAVE TO FILES</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            ) : null}
          </ScrollView>
        </View>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        visible={!!pendingDelete}
        animationType="fade"
        transparent
        onRequestClose={() => setPendingDelete(null)}
      >
        <Pressable
          style={styles.confirmBackdrop}
          onPress={() => setPendingDelete(null)}
        >
          <Pressable style={styles.confirmCard} testID="confirm-delete-modal">
            <Text style={styles.confirmLabel}>DELETE TRACK</Text>
            <Text style={styles.confirmTitle} numberOfLines={2}>
              {pendingDelete?.title}
            </Text>
            <Text style={styles.confirmBody}>
              This will permanently remove the MP3 and its history entry.
            </Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={styles.confirmCancelBtn}
                onPress={() => setPendingDelete(null)}
                testID="confirm-cancel"
              >
                <Text style={styles.confirmCancelLabel}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmDeleteBtn}
                onPress={() => {
                  if (pendingDelete) handleDelete(pendingDelete.id);
                  setPendingDelete(null);
                }}
                testID="confirm-delete"
              >
                <Text style={styles.confirmDeleteLabel}>DELETE</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  emptyBox: {
    marginTop: 40,
    alignItems: "center",
    paddingHorizontal: 24,
  },
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  rowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  rowDelete: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  thumb: {
    width: 52,
    height: 52,
    backgroundColor: "#1a1a1a",
  },
  rowTitle: {
    color: "#fff",
    fontFamily: "Outfit_700Bold",
    fontSize: 15,
  },
  rowMeta: {
    color: "#A0A0A0",
    fontFamily: "JetBrainsMono_400Regular",
    fontSize: 11,
    marginTop: 4,
    letterSpacing: 0.5,
  },
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
  convertingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  convertLabel: {
    color: "#fff",
    fontFamily: "Outfit_900Black",
    fontSize: 16,
    letterSpacing: 2,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#0A0A0A",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    maxHeight: "92%",
  },
  modalSheetContent: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 36,
    alignItems: "center",
  },
  modalHandle: {
    width: 44,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 2,
    marginBottom: 16,
  },
  modalTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    marginBottom: 24,
  },
  modalLabel: {
    color: "#A0A0A0",
    fontFamily: "JetBrainsMono_700Bold",
    fontSize: 10,
    letterSpacing: 3,
  },
  modalArt: {
    width: 240,
    height: 240,
    backgroundColor: "#1a1a1a",
    marginBottom: 24,
  },
  modalTitle: {
    color: "#fff",
    fontFamily: "Outfit_900Black",
    fontSize: 22,
    letterSpacing: -0.5,
    textAlign: "center",
    textTransform: "uppercase",
  },
  modalMeta: {
    color: "#A0A0A0",
    fontFamily: "JetBrainsMono_400Regular",
    fontSize: 11,
    marginTop: 8,
    letterSpacing: 1.5,
  },
  progressBg: {
    width: "100%",
    height: 3,
    backgroundColor: "rgba(255,255,255,0.1)",
    marginTop: 24,
  },
  progressFill: {
    height: 3,
    backgroundColor: "#FF3B30",
  },
  timeRow: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  timeText: {
    color: "#A0A0A0",
    fontFamily: "JetBrainsMono_400Regular",
    fontSize: 11,
  },
  transport: {
    flexDirection: "row",
    alignItems: "center",
    gap: 24,
    marginTop: 24,
    marginBottom: 24,
  },
  transportBtn: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  playBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtn: {
    width: "100%",
    height: 60,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  saveLabel: {
    color: "#050505",
    fontFamily: "Outfit_900Black",
    fontSize: 16,
    letterSpacing: 2,
  },
  confirmBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    zIndex: 1000,
  },
  confirmCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#121212",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    padding: 24,
  },
  confirmLabel: {
    color: "#FF3B30",
    fontFamily: "JetBrainsMono_700Bold",
    fontSize: 10,
    letterSpacing: 3,
  },
  confirmTitle: {
    color: "#fff",
    fontFamily: "Outfit_900Black",
    fontSize: 22,
    letterSpacing: -0.5,
    marginTop: 8,
    textTransform: "uppercase",
  },
  confirmBody: {
    color: "#A0A0A0",
    fontFamily: "JetBrainsMono_400Regular",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 12,
  },
  confirmActions: {
    flexDirection: "row",
    marginTop: 24,
    gap: 12,
  },
  confirmCancelBtn: {
    flex: 1,
    height: 52,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  confirmCancelLabel: {
    color: "#fff",
    fontFamily: "Outfit_700Bold",
    fontSize: 14,
    letterSpacing: 2,
  },
  confirmDeleteBtn: {
    flex: 1,
    height: 52,
    backgroundColor: "#FF3B30",
    alignItems: "center",
    justifyContent: "center",
  },
  confirmDeleteLabel: {
    color: "#fff",
    fontFamily: "Outfit_900Black",
    fontSize: 14,
    letterSpacing: 2,
  },
});
