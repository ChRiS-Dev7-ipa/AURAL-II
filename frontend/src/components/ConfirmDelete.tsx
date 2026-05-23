import React from "react";
import {
  Modal,
  Pressable,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";

import { Conversion } from "@/src/lib/converter";

type Props = {
  target: Conversion | null;
  onCancel: () => void;
  onConfirm: (item: Conversion) => void;
};

export function ConfirmDelete({ target, onCancel, onConfirm }: Props) {
  return (
    <Modal
      visible={!!target}
      animationType="fade"
      transparent
      onRequestClose={onCancel}
    >
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.card} testID="confirm-delete-modal">
          <Text style={styles.label}>DELETE TRACK</Text>
          <Text style={styles.title} numberOfLines={2}>
            {target?.title}
          </Text>
          <Text style={styles.body}>
            This will permanently remove the MP3 and its history entry.
          </Text>
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onCancel}
              testID="confirm-cancel"
            >
              <Text style={styles.cancelLabel}>CANCEL</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={() => target && onConfirm(target)}
              testID="confirm-delete"
            >
              <Text style={styles.deleteLabel}>DELETE</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#121212",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    padding: 24,
  },
  label: {
    color: "#FF3B30",
    fontFamily: "JetBrainsMono_700Bold",
    fontSize: 10,
    letterSpacing: 3,
  },
  title: {
    color: "#fff",
    fontFamily: "Outfit_900Black",
    fontSize: 22,
    letterSpacing: -0.5,
    marginTop: 8,
    textTransform: "uppercase",
  },
  body: {
    color: "#A0A0A0",
    fontFamily: "JetBrainsMono_400Regular",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 12,
  },
  actions: {
    flexDirection: "row",
    marginTop: 24,
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    height: 52,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelLabel: {
    color: "#fff",
    fontFamily: "Outfit_700Bold",
    fontSize: 14,
    letterSpacing: 2,
  },
  deleteBtn: {
    flex: 1,
    height: 52,
    backgroundColor: "#FF3B30",
    alignItems: "center",
    justifyContent: "center",
  },
  deleteLabel: {
    color: "#fff",
    fontFamily: "Outfit_900Black",
    fontSize: 14,
    letterSpacing: 2,
  },
});
