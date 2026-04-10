import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View, Text, FlatList, TextInput, StyleSheet, Pressable,
  Platform, useColorScheme, ActivityIndicator, Modal, ScrollView,
} from "react-native";
import { useSafeAreaInsets, SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useApiRequest } from "@/context/AuthContext";
import { Badge } from "@/components/ui/Badge";
import { AnimatedCard } from "@/components/ui/AnimatedCard";

interface SearchResult {
  id: string;
  name: string;
  email: string;
  role: string;
  rollNumber?: string;
  roomNumber?: string;
  assignedMess?: string;
  attendanceStatus?: string;
  hostelName?: string;
  phone?: string;
  contactNumber?: string;
  area?: string;
}

// ─── Student Profile Modal ─────────────────────────────────────────────────────

function StudentProfileModal({ student, visible, onClose, theme }: {
  student: SearchResult | null; visible: boolean; onClose: () => void; theme: any;
}) {
  if (!student) return null;

  const attColor = student.attendanceStatus === "entered" ? "#22c55e" : "#f59e0b";
  const attLabel = student.attendanceStatus === "entered" ? "In Campus" : "Not Entered";

  const fields = [
    { icon: "mail", label: "Email", val: student.email },
    { icon: "hash", label: "Roll Number", val: student.rollNumber },
    { icon: "phone", label: "Contact", val: student.contactNumber || student.phone },
    { icon: "home", label: "Room", val: student.roomNumber },
    { icon: "coffee", label: "Mess", val: student.assignedMess },
    { icon: "map-pin", label: "Hostel", val: student.hostelName },
    { icon: "grid", label: "Area", val: student.area },
  ].filter(f => f.val);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.surface }]} onPress={e => e.stopPropagation()}>
          <View style={styles.handle} />

          {/* Avatar + Name */}
          <View style={styles.profileTop}>
            <View style={[styles.bigAvatar, { backgroundColor: theme.tint + "25" }]}>
              <Text style={[styles.bigAvatarText, { color: theme.tint }]}>
                {(student.name || "?").charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={[styles.profileName, { color: theme.text }]}>{student.name}</Text>
            <Text style={[styles.profileEmail, { color: theme.textSecondary }]}>{student.email}</Text>
            <View style={styles.profileBadges}>
              <Badge label={student.role} variant={student.role === "student" ? "green" : "blue"} />
              <View style={[styles.attBadge, { backgroundColor: attColor + "20" }]}>
                <View style={[styles.attDot, { backgroundColor: attColor }]} />
                <Text style={[styles.attBadgeText, { color: attColor }]}>{attLabel}</Text>
              </View>
            </View>
          </View>

          {/* Info rows */}
          <ScrollView style={styles.profileBody} showsVerticalScrollIndicator={false}>
            {fields.map(f => (
              <View key={f.label} style={[styles.infoRow, { borderBottomColor: theme.border }]}>
                <View style={[styles.infoIcon, { backgroundColor: theme.tint + "18" }]}>
                  <Feather name={f.icon as any} size={14} color={theme.tint} />
                </View>
                <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>{f.label}</Text>
                <Text style={[styles.infoVal, { color: theme.text }]}>{f.val}</Text>
              </View>
            ))}
          </ScrollView>

          <Pressable onPress={onClose} style={[styles.closeBtn, { backgroundColor: theme.tint }]}>
            <Text style={styles.closeBtnText}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Main Search Screen ────────────────────────────────────────────────────────

export default function SearchScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = Platform.OS === "web" ? 24 : Math.max(insets.top + 20, 100);
  const request = useApiRequest();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (q: string, off = 0, append = false) => {
    if (q.length < 2) { setResults([]); setTotal(0); return; }
    if (off === 0) setLoading(true); else setLoadingMore(true);
    try {
      const data = await request(`/search?q=${encodeURIComponent(q)}&limit=20&offset=${off}`);
      if (append) setResults(prev => [...prev, ...data.results]);
      else setResults(data.results || []);
      setTotal(data.total || 0);
      setHasMore((data.results || []).length === 20);
      setOffset(off + 20);
    } catch { }
    setLoading(false);
    setLoadingMore(false);
  }, [request]);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    setOffset(0); setHasMore(false);
    debounce.current = setTimeout(() => doSearch(query, 0, false), 350);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [query]);

  const loadMore = useCallback(() => {
    if (!hasMore || loadingMore) return;
    doSearch(query, offset, true);
  }, [hasMore, loadingMore, query, offset, doSearch]);

  const openProfile = (item: SearchResult) => {
    Haptics.selectionAsync();
    setSelected(item);
    setModalVisible(true);
  };

  const attColor = (s?: string) => s === "entered" ? "#22c55e" : "#f59e0b";

  return (
    <SafeAreaView edges={["top"]} style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: 16, borderBottomColor: theme.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={theme.text} />
        </Pressable>
        <View style={[styles.searchBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Feather name="search" size={16} color={theme.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search name, roll, room, mess, area…"
            placeholderTextColor={theme.textTertiary}
            value={query}
            onChangeText={setQuery}
            autoFocus
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable onPress={() => { setQuery(""); setResults([]); }}>
              <Feather name="x" size={16} color={theme.textSecondary} />
            </Pressable>
          )}
        </View>
      </View>

      {query.length > 0 && (
        <Text style={[styles.resultCount, { color: theme.textSecondary }]}>
          {loading ? "Searching…" : `${total} result${total !== 1 ? "s" : ""} — tap a card to view profile`}
        </Text>
      )}

      <FlatList
        data={results}
        keyExtractor={item => item.id}
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: Platform.OS === "web" ? 80 : 90 }}
        keyboardShouldPersistTaps="handled"
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListEmptyComponent={() => (
          loading ? (
            <ActivityIndicator color={theme.tint} style={{ marginTop: 40 }} />
          ) : query.length >= 2 ? (
            <View style={styles.empty}>
              <Feather name="search" size={40} color={theme.textTertiary} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No results for "{query}"</Text>
            </View>
          ) : (
            <View style={styles.empty}>
              <Feather name="search" size={40} color={theme.textTertiary} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>Type 2+ characters to search students</Text>
            </View>
          )
        )}
        ListFooterComponent={() => loadingMore ? <ActivityIndicator color={theme.tint} style={{ marginVertical: 12 }} /> : null}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => openProfile(item)}
            style={({ pressed }) => [
              styles.resultCard,
              { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <View style={[styles.avatar, { backgroundColor: theme.tint + "20" }]}>
              <Text style={[styles.avatarText, { color: theme.tint }]}>
                {(item.name || "?").charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: theme.text }]}>{item.name}</Text>
              <Text style={[styles.meta, { color: theme.textSecondary }]}>
                {item.rollNumber || item.email}
                {item.roomNumber ? ` · Room ${item.roomNumber}` : ""}
                {item.hostelName ? ` · ${item.hostelName}` : ""}
              </Text>
              {(item.assignedMess || item.area) && (
                <Text style={[styles.meta, { color: theme.textTertiary }]}>
                  {[item.assignedMess && `Mess: ${item.assignedMess}`, item.area].filter(Boolean).join(" · ")}
                </Text>
              )}
            </View>
            <View style={styles.cardRight}>
              <View style={[styles.attBadge, { backgroundColor: attColor(item.attendanceStatus) + "20" }]}>
                <View style={[styles.attDot, { backgroundColor: attColor(item.attendanceStatus) }]} />
                <Text style={[styles.attLabel, { color: attColor(item.attendanceStatus) }]}>
                  {item.attendanceStatus === "entered" ? "In" : "Out"}
                </Text>
              </View>
              <Feather name="chevron-right" size={16} color={theme.textTertiary} style={{ marginTop: 4 }} />
            </View>
          </Pressable>
        )}
      />

      <StudentProfileModal
        student={selected}
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        theme={theme}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 20, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", gap: 14 },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  searchBox: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  resultCount: { fontSize: 13, fontFamily: "Inter_400Regular", paddingHorizontal: 20, paddingVertical: 8 },
  resultCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 12, borderWidth: 1 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 16, fontFamily: "Inter_700Bold" },
  name: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  meta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  cardRight: { alignItems: "flex-end", gap: 2 },
  attBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 20 },
  attDot: { width: 6, height: 6, borderRadius: 3 },
  attLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  attBadgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  empty: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  // Profile modal
  overlay: { flex: 1, backgroundColor: "#00000080", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingBottom: 36, maxHeight: "90%" },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#CBD5E1", alignSelf: "center", marginVertical: 12 },
  profileTop: { alignItems: "center", gap: 6, paddingBottom: 16 },
  bigAvatar: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  bigAvatarText: { fontSize: 28, fontFamily: "Inter_700Bold" },
  profileName: { fontSize: 20, fontFamily: "Inter_700Bold" },
  profileEmail: { fontSize: 13, fontFamily: "Inter_400Regular" },
  profileBadges: { flexDirection: "row", gap: 8, marginTop: 4 },
  profileBody: { maxHeight: 280 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, borderBottomWidth: 1 },
  infoIcon: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  infoLabel: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  infoVal: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  closeBtn: { marginTop: 16, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  closeBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
