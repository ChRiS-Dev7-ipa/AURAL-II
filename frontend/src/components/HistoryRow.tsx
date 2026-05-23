import React from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";

import {
  Conversion,
  FALLBACK_ART,
  formatBytes,
  formatDuration,
} from "@/src/lib/converter";

type Props = {
  item: Conversion;
  index: number;
  onOpen: (item: Conversion) => void;
  onRequestDelete: (item: Conversion) => void;
};

export function HistoryRow({ item, index, onOpen, onRequestDelete }: Props) {
  return (
    <Animated.View entering={FadeInDown.delay(index * 40).duration(280)}>
      <View style={styles.row}>
        <TouchableOpacity
          onPress={() => onOpen(item)}
          activeOpacity={0.7}
          style={styles.rowMain}
          testID={`history-item-${index}`}
        >
          <Image
            source={{ uri: item.thumbnail || FALLBACK_ART }}
            style={styles.thumb}
          />
          <View style={styles.meta}>
            <Text numberOfLines={1} style={styles.title}>
              {item.title}
            </Text>
            <Text numberOfLines={1} style={styles.subtitle}>
              {(item.artist || "UNKNOWN").toUpperCase()} ·{" "}
              {formatDuration(item.duration)} · {formatBytes(item.size_bytes)}
            </Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onRequestDelete(item)}
          hitSlop={12}
          style={styles.deleteBtn}
          testID={`delete-item-${index}`}
        >
          <Ionicons name="close" size={20} color="#A0A0A0" />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
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
  thumb: {
    width: 52,
    height: 52,
    backgroundColor: "#1a1a1a",
  },
  meta: {
    flex: 1,
    marginLeft: 14,
  },
  title: {
    color: "#fff",
    fontFamily: "Outfit_700Bold",
    fontSize: 15,
  },
  subtitle: {
    color: "#A0A0A0",
    fontFamily: "JetBrainsMono_400Regular",
    fontSize: 11,
    marginTop: 4,
    letterSpacing: 0.5,
  },
  deleteBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
});
