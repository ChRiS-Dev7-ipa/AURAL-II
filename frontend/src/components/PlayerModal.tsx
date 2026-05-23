import React, { useMemo } from "react";
import {
  Modal,
  View,
  ScrollView,
  Image,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";

import {
  API,
  Conversion,
  FALLBACK_ART,
  formatDuration,
} from "@/src/lib/converter";

type Props = {
  track: Conversion | null;
  downloading: boolean;
  onClose: () => void;
  onSave: () => void;
};

export function PlayerModal({ track, downloading, onClose, onSave }: Props) {
  const audioUri = useMemo(
    () => (track ? `${API}/api/file/${track.id}` : null),
    [track]
  );
  const player = useAudioPlayer(audioUri);
  const status = useAudioPlayerStatus(player);

  const togglePlay = () => {
    if (!player) return;
    if (status?.playing) player.pause();
    else player.play();
  };

  const handleClose = () => {
    try {
      player?.pause();
    } catch {}
    onClose();
  };

  const progressPct = status?.duration
    ? Math.min(100, ((status.currentTime || 0) / status.duration) * 100)
    : 0;

  return (
    <Modal
      visible={!!track}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <View style={styles.backdrop}>
        <ScrollView
          style={styles.sheet}
          contentContainerStyle={styles.sheetContent}
          showsVerticalScrollIndicator={false}
          testID="player-modal"
        >
          <View style={styles.handle} />
          <View style={styles.topRow}>
            <Text style={styles.label}>NOW PLAYING</Text>
            <TouchableOpacity onPress={handleClose} testID="close-player">
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          {track ? (
            <>
              <Image
                source={{ uri: track.thumbnail || FALLBACK_ART }}
                style={styles.art}
              />
              <Text style={styles.title} numberOfLines={2}>
                {track.title}
              </Text>
              <Text style={styles.meta}>
                {(track.artist || "UNKNOWN").toUpperCase()} ·{" "}
                {formatDuration(track.duration)}
              </Text>

              <View style={styles.progressBg}>
                <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
              </View>
              <View style={styles.timeRow}>
                <Text style={styles.timeText}>
                  {formatDuration(status?.currentTime)}
                </Text>
                <Text style={styles.timeText}>
                  {formatDuration(status?.duration || track.duration)}
                </Text>
              </View>

              <View style={styles.transport}>
                <TouchableOpacity
                  onPress={() => {
                    if (player)
                      player.seekTo(Math.max(0, (status?.currentTime || 0) - 10));
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
                        Math.min(
                          status.duration,
                          (status?.currentTime || 0) + 10
                        )
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
                onPress={onSave}
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
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#0A0A0A",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    maxHeight: "92%",
  },
  sheetContent: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 36,
    alignItems: "center",
  },
  handle: {
    width: 44,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 2,
    marginBottom: 16,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    marginBottom: 24,
  },
  label: {
    color: "#A0A0A0",
    fontFamily: "JetBrainsMono_700Bold",
    fontSize: 10,
    letterSpacing: 3,
  },
  art: {
    width: 240,
    height: 240,
    backgroundColor: "#1a1a1a",
    marginBottom: 24,
  },
  title: {
    color: "#fff",
    fontFamily: "Outfit_900Black",
    fontSize: 22,
    letterSpacing: -0.5,
    textAlign: "center",
    textTransform: "uppercase",
  },
  meta: {
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
});
