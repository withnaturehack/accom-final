import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Alert,
  Platform,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets, SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useApiRequest } from "@/context/AuthContext";

const CATEGORIES = ["general", "urgent", "academic", "hostel", "event"] as const;
type Category = typeof CATEGORIES[number];

const catColors: Record<Category, string> = {
  general: "#3B8AF0",
  urgent: "#EF4444",
  academic: "#22C55E",
  hostel: "#F97316",
  event: "#8B5CF6",
};

export default function PostAnnouncementScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const request = useApiRequest();
  const queryClient = useQueryClient();
  const isWeb = Platform.OS === "web";

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<Category>("general");

  const mutation = useMutation({
    mutationFn: () => request("/announcements", {
      method: "POST",
      body: JSON.stringify({ title, content, category }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Posted!", "Announcement sent to all students.", [{ text: "OK", onPress: () => router.back() }]);
    },
    onError: (e: any) => Alert.alert("Error", e.message),
  });

  const handlePost = () => {
    if (!title.trim() || !content.trim()) {
      Alert.alert("Error", "Title and content are required");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    mutation.mutate();
  };

  return (
    <SafeAreaView edges={["top"]} style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { paddingTop: 16, borderColor: theme.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={24} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Post Announcement</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.label, { color: theme.textSecondary }]}>Category</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
          {CATEGORIES.map((c) => (
            <Pressable
              key={c}
              onPress={() => { Haptics.selectionAsync(); setCategory(c); }}
              style={[styles.catPill, {
                backgroundColor: category === c ? catColors[c] : theme.surface,
                borderColor: category === c ? catColors[c] : theme.border,
              }]}
            >
              <Text style={[styles.catText, { color: category === c ? "#fff" : theme.textSecondary }]}>
                {c.charAt(0).toUpperCase() + c.slice(1)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <Text style={[styles.label, { color: theme.textSecondary }]}>Title *</Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
          placeholder="Announcement title..."
          placeholderTextColor={theme.textTertiary}
          value={title}
          onChangeText={setTitle}
        />

        <Text style={[styles.label, { color: theme.textSecondary }]}>Content *</Text>
        <TextInput
          style={[styles.input, styles.textArea, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
          placeholder="Write your announcement here..."
          placeholderTextColor={theme.textTertiary}
          value={content}
          onChangeText={setContent}
          multiline
          numberOfLines={6}
        />

        <View style={[styles.previewCard, { backgroundColor: catColors[category] + "15", borderColor: catColors[category] + "40" }]}>
          <Text style={[styles.previewLabel, { color: theme.textSecondary }]}>Preview</Text>
          <Text style={[styles.previewTitle, { color: theme.text }]}>{title || "Your announcement title"}</Text>
          <Text style={[styles.previewContent, { color: theme.textSecondary }]} numberOfLines={3}>
            {content || "Your announcement content will appear here..."}
          </Text>
        </View>

        <Pressable
          onPress={handlePost}
          style={[styles.postBtn, { backgroundColor: catColors[category] }]}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Feather name="send" size={18} color="#fff" />
              <Text style={styles.postBtnText}>Post Announcement</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
  content: { padding: 20, gap: 8 },
  label: { fontSize: 13, fontFamily: "Inter_500Medium", marginTop: 12, marginBottom: 6 },
  catRow: { gap: 8, paddingBottom: 4 },
  catPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  catText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  input: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: "Inter_400Regular" },
  textArea: { height: 120, textAlignVertical: "top" },
  previewCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 6, marginTop: 8 },
  previewLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },
  previewTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  previewContent: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  postBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, paddingVertical: 16, marginTop: 16 },
  postBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
