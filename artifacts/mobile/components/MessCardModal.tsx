import React, { useState, useCallback, useEffect } from "react";
import {
  View, Text, Modal, Pressable, FlatList, StyleSheet,
  TextInput, ActivityIndicator, useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useApiRequest } from "@/context/AuthContext";

const PAGE_SIZE = 30;

function formatActionAt(ts?: string | null): string {
  if (!ts) return "";
  return new Date(ts).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour12: true,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MessCardModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const request = useApiRequest();

  const [search, setSearch] = useState("");
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);

  const fetchStudents = useCallback(async (reset = false) => {
    if (!hasMore && !reset) return;
    setLoading(true);
    const offset = reset ? 0 : page * PAGE_SIZE;
    if (reset) { setStudents([]); setHasMore(true); }
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
      if (search.trim()) params.set("search", search.trim());
      const data = await request(`/students?${params}`);
      const list: any[] = Array.isArray(data) ? data : (data.students || []);
      setStudents(prev => reset ? list : [...prev, ...list]);
      setHasMore(list.length === PAGE_SIZE);
      if (!reset) setPage(p => p + 1);
      else setPage(1);
    } catch { }
    setLoading(false);
  }, [request, search, page, hasMore]);

  useEffect(() => {
    if (visible) { fetchStudents(true); }
  }, [visible, search]);

  const toggleMessCard = async (student: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setToggling(student.id);
    try {
      const newVal = !(student.messCard ?? false);
      const updated = await request(`/inventory-simple/${student.id}/mess-card`, {
        method: "PATCH",
        body: JSON.stringify({ messCard: newVal }),
      });
      setStudents(prev => prev.map(s => s.id === student.id ? {
        ...s,
        messCard: updated?.messCard ?? newVal,
        messCardGivenAt: updated?.messCardGivenAt ?? (newVal ? new Date().toISOString() : null),
        messCardRevokedAt: updated?.messCardRevokedAt ?? (!newVal ? new Date().toISOString() : null),
      } : s));
    } catch { }
    setToggling(null);
  };

  const given = students.filter(s => s.messCard).length;
  const total = students.length;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={[styles.header, { borderBottomColor: theme.border, paddingTop: insets.top + 16 }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: theme.text }]}>Mess Cards</Text>
            {total > 0 && (
              <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                {given}/{total} cards distributed
              </Text>
            )}
          </View>
          <Pressable onPress={onClose} style={[styles.closeBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Feather name="x" size={18} color={theme.textSecondary} />
          </Pressable>
        </View>

        {total > 0 && (
          <View style={[styles.progressBar, { backgroundColor: theme.border }]}>
            <View style={[styles.progressFill, { width: `${(given / total) * 100}%`, backgroundColor: "#22c55e" }]} />
          </View>
        )}

        <View style={[styles.searchRow, { borderBottomColor: theme.border }]}>
          <Feather name="search" size={15} color={theme.textSecondary} />
          <TextInput
            placeholder="Search students..."
            placeholderTextColor={theme.textTertiary}
            value={search}
            onChangeText={setSearch}
            style={[styles.searchInput, { color: theme.text }]}
            clearButtonMode="while-editing"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")} hitSlop={8}>
              <Feather name="x-circle" size={15} color={theme.textSecondary} />
            </Pressable>
          )}
        </View>

        <FlatList
          data={students}
          keyExtractor={s => s.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
          onEndReached={() => hasMore && !loading && fetchStudents()}
          onEndReachedThreshold={0.4}
          ItemSeparatorComponent={() => <View style={[styles.sep, { backgroundColor: theme.border }]} />}
          ListEmptyComponent={() => loading ? (
            <ActivityIndicator color={theme.tint} style={{ marginTop: 40 }} />
          ) : (
            <View style={styles.empty}>
              <Feather name="users" size={36} color={theme.textTertiary} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No students found</Text>
            </View>
          )}
          ListFooterComponent={() => loading && students.length > 0 ? (
            <ActivityIndicator color={theme.tint} style={{ marginVertical: 12 }} />
          ) : null}
          renderItem={({ item }) => {
            const isGiven = item.messCard ?? false;
            const isLoading = toggling === item.id;
            return (
              <Pressable
                onPress={() => !isLoading && toggleMessCard(item)}
                style={({ pressed }) => [styles.row, { backgroundColor: pressed ? theme.surface : theme.background, opacity: isLoading ? 0.6 : 1 }]}
              >
                <View style={[styles.avatar, { backgroundColor: theme.tint + "20" }]}>
                  <Text style={[styles.avatarText, { color: theme.tint }]}>
                    {(item.name || "?")[0].toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>{item.name}</Text>
                  <Text style={[styles.meta, { color: theme.textSecondary }]} numberOfLines={1}>
                    {item.rollNumber || item.email}{item.roomNumber ? ` · Room ${item.roomNumber}` : ""}
                  </Text>
                  {isGiven && item.messCardGivenAt && (
                    <Text style={[styles.timeMeta, { color: theme.textTertiary }]} numberOfLines={1}>
                      Given at {formatActionAt(item.messCardGivenAt)}
                    </Text>
                  )}
                  {!isGiven && item.messCardRevokedAt && (
                    <Text style={[styles.timeMeta, { color: theme.textTertiary }]} numberOfLines={1}>
                      Revoked at {formatActionAt(item.messCardRevokedAt)}
                    </Text>
                  )}
                </View>
                {isLoading ? (
                  <ActivityIndicator size="small" color={theme.tint} />
                ) : (
                  <View style={[styles.toggleChip, {
                    backgroundColor: isGiven ? "#22c55e18" : theme.surface,
                    borderColor: isGiven ? "#22c55e50" : theme.border,
                  }]}>
                    <Feather name={isGiven ? "rotate-ccw" : "check-circle"} size={14} color={isGiven ? "#22c55e" : theme.textTertiary} />
                    <Text style={[styles.toggleLabel, { color: isGiven ? "#22c55e" : theme.textSecondary }]}>
                      {isGiven ? "Revoke" : "Give"}
                    </Text>
                  </View>
                )}
              </Pressable>
            );
          }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  title: { fontSize: 22, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  closeBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  progressBar: { height: 3 },
  progressFill: { height: 3 },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 68 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 16, fontFamily: "Inter_700Bold" },
  name: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  meta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  timeMeta: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  toggleChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  toggleLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  empty: { alignItems: "center", paddingVertical: 48, gap: 8 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
});
