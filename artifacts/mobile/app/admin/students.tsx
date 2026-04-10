import React, { useState, useCallback } from "react";
import {
  View, Text, FlatList, StyleSheet, Pressable, RefreshControl,
  Platform, Modal, TextInput, ActivityIndicator, Alert, useColorScheme,
} from "react-native";
import { useSafeAreaInsets, SafeAreaView } from "react-native-safe-area-context";
import { useInfiniteQuery, useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useApiRequest } from "@/context/AuthContext";
import { AnimatedCard } from "@/components/ui/AnimatedCard";
import { CardSkeleton } from "@/components/ui/LoadingSkeleton";
import { Badge } from "@/components/ui/Badge";
import { useDebounce } from "@/hooks/useDebounce";

const PAGE_SIZE = 50;

function fmtDT(ts?: string | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-IN", {
    hour12: true,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StudentProfileModal({ visible, studentId, onClose, theme, request }: {
  visible: boolean;
  studentId: string | null;
  onClose: () => void;
  theme: any;
  request: any;
}) {
  const modalInsets = useSafeAreaInsets();
  const { data: student, isLoading: studentLoading, refetch: refetchStudent } = useQuery<any>({
    queryKey: ["student-profile", studentId],
    queryFn: () => request(`/students/${studentId}`),
    enabled: visible && !!studentId,
    staleTime: 10000,
  });

  const { data: inventory, isLoading: inventoryLoading, refetch: refetchInventory } = useQuery<any>({
    queryKey: ["student-profile-inventory", studentId],
    queryFn: () => request(`/attendance/inventory/${studentId}`),
    enabled: visible && !!studentId,
    staleTime: 10000,
  });

  const { data: checkins = [], isLoading: checkinsLoading, refetch: refetchCheckins } = useQuery<any[]>({
    queryKey: ["student-profile-checkins", studentId],
    queryFn: () => request(`/students/${studentId}/checkins-history?limit=20`),
    enabled: visible && !!studentId,
    staleTime: 10000,
  });

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.modal, { backgroundColor: theme.background }]}>
        <View style={styles.dragHandle} />
        <View style={[styles.modalHeader, { borderColor: theme.border, paddingTop: Math.max(modalInsets.top + 16, 56) }]}>
          <Text style={[styles.modalTitle, { color: theme.text }]}>Student Profile</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Feather name="x" size={24} color={theme.text} />
          </Pressable>
        </View>

        {studentLoading ? (
          <View style={{ padding: 20 }}><CardSkeleton /><CardSkeleton /></View>
        ) : (
          <FlatList
            data={[{ key: "content" }]}
            keyExtractor={(i) => i.key}
            contentContainerStyle={{ padding: 20, paddingBottom: Math.max(modalInsets.bottom + 32, 64) }}
            refreshControl={<RefreshControl refreshing={false} onRefresh={() => { refetchStudent(); refetchInventory(); refetchCheckins(); }} tintColor={theme.tint} />}
            renderItem={() => {
              const s = student || {};
              const inv = inventory || {};
              const inCampus = !!s.checkInTime && !s.checkOutTime;
              const stateColor = s.checkOutTime ? "#6366f1" : inCampus ? "#22c55e" : "#f59e0b";
              const stateLabel = s.checkOutTime ? "Checked Out" : inCampus ? "In Campus" : "Not Checked In";

              return (
                <View style={{ gap: 12 }}>
                  <AnimatedCard style={styles.card}>
                    <View style={styles.cardRow}>
                      <View style={[styles.avatar, { backgroundColor: theme.tint + "20" }]}>
                        <Text style={[styles.avatarText, { color: theme.tint }]}>{(s.name || "?").charAt(0).toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.studentName, { color: theme.text }]}>{s.name || "—"}</Text>
                        <Text style={[styles.studentEmail, { color: theme.textSecondary }]}>{s.email || "—"}</Text>
                        <Text style={[styles.room, { color: theme.textTertiary }]}>{s.rollNumber || "—"}</Text>
                      </View>
                      <View style={[styles.presentBadge, { backgroundColor: stateColor + "20" }]}>
                        <Feather name="activity" size={12} color={stateColor} />
                        <Text style={{ color: stateColor, fontSize: 11, fontFamily: "Inter_500Medium" }}>{stateLabel}</Text>
                      </View>
                    </View>
                  </AnimatedCard>

                  <AnimatedCard style={styles.card}>
                    <Text style={[styles.fieldLabel, { color: theme.textSecondary, marginTop: 0 }]}>ACADEMIC & HOSTEL</Text>
                    <View style={styles.meta}>
                      <Badge label={`Hostel: ${s.allottedHostel || s.hostelName || "—"}`} variant="blue" />
                      <Badge label={`Room: ${s.roomNumber || "—"}`} variant="gray" />
                      <Badge label={`Mess: ${s.allottedMess || s.assignedMess || "—"}`} variant="gray" />
                      <Badge label={`Area: ${s.area || "—"}`} variant="gray" />
                    </View>
                    <Text style={[styles.room, { color: theme.textSecondary, marginTop: 8 }]}>Phone: {s.mobileNumber || s.contactNumber || s.phone || "—"}</Text>
                    <Text style={[styles.room, { color: theme.textSecondary }]}>Emergency: {s.emergencyContact || "—"}</Text>
                  </AnimatedCard>

                  <AnimatedCard style={styles.card}>
                    <Text style={[styles.fieldLabel, { color: theme.textSecondary, marginTop: 0 }]}>TODAY STATUS</Text>
                    <Text style={[styles.room, { color: theme.text }]}>Check-in: {fmtDT(s.checkInTime)}</Text>
                    <Text style={[styles.room, { color: theme.text }]}>Check-out: {fmtDT(s.checkOutTime)}</Text>
                    <Text style={[styles.room, { color: theme.textSecondary }]}>Attendance: {s.attendanceStatus || "—"}</Text>
                  </AnimatedCard>

                  <AnimatedCard style={styles.card}>
                    <Text style={[styles.fieldLabel, { color: theme.textSecondary, marginTop: 0 }]}>INVENTORY</Text>
                    {inventoryLoading ? <ActivityIndicator color={theme.tint} /> : (
                      <View style={styles.meta}>
                        <Badge label={`Mattress: ${inv.mattress ? "Yes" : "No"}`} variant={inv.mattress ? "green" : "gray"} />
                        <Badge label={`Bedsheet: ${inv.bedsheet ? "Yes" : "No"}`} variant={inv.bedsheet ? "green" : "gray"} />
                        <Badge label={`Pillow: ${inv.pillow ? "Yes" : "No"}`} variant={inv.pillow ? "green" : "gray"} />
                        <Badge label={`Locked: ${inv.inventoryLocked ? "Yes" : "No"}`} variant={inv.inventoryLocked ? "green" : "gray"} />
                      </View>
                    )}
                  </AnimatedCard>

                  <AnimatedCard style={styles.card}>
                    <Text style={[styles.fieldLabel, { color: theme.textSecondary, marginTop: 0 }]}>RECENT CHECK-IN HISTORY</Text>
                    {checkinsLoading ? <ActivityIndicator color={theme.tint} /> : (
                      <View style={{ gap: 8 }}>
                        {(checkins || []).slice(0, 8).map((c: any) => (
                          <View key={c.id} style={[styles.checkRow, { borderColor: theme.border, backgroundColor: theme.surface }]}>
                            <Feather name="clock" size={16} color={theme.tint} />
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.checkLabel, { color: theme.text }]}>{c.date || "—"}</Text>
                              <Text style={[styles.room, { color: theme.textSecondary }]}>In {fmtDT(c.checkInTime)} · Out {fmtDT(c.checkOutTime)}</Text>
                            </View>
                          </View>
                        ))}
                        {(!checkins || checkins.length === 0) && (
                          <Text style={[styles.emptyText, { color: theme.textSecondary, paddingVertical: 6 }]}>No history found</Text>
                        )}
                      </View>
                    )}
                  </AnimatedCard>
                </View>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}

export default function StudentsAdminScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const request = useApiRequest();
  const queryClient = useQueryClient();
  const isWeb = Platform.OS === "web";

  const [search, setSearch] = useState("");
  const [hostelFilter, setHostelFilter] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rollNumber, setRollNumber] = useState("");
  const [newHostelId, setNewHostelId] = useState("");
  const [roomNumber, setRoomNumber] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  const debouncedSearch = useDebounce(search, 400);
  const debouncedHostel = useDebounce(hostelFilter, 300);

  const { data: hostels } = useQuery({
    queryKey: ["hostels"],
    queryFn: () => request("/hostels"),
    staleTime: 30000,
  });

  const {
    data,
    isLoading,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ["students-paged", debouncedSearch, debouncedHostel],
    queryFn: async ({ pageParam = 1 }) => {
      const params = new URLSearchParams({
        page: String(pageParam),
        limit: String(PAGE_SIZE),
      });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (debouncedHostel) params.set("hostelId", debouncedHostel);
      return request(`/students?${params}`);
    },
    getNextPageParam: (lastPage: any) => {
      if (!lastPage?.students) return undefined;
      const loaded = (lastPage.page - 1) * lastPage.limit + lastPage.students.length;
      return loaded < lastPage.total ? lastPage.page + 1 : undefined;
    },
    initialPageParam: 1,
    refetchInterval: 30000,
    staleTime: 10000,
  });

  const allStudents: any[] = data?.pages.flatMap((p: any) => p.students || []) || [];
  const total: number = data?.pages[0]?.total ?? 0;

  const createMutation = useMutation({
    mutationFn: (d: any) => request("/students", { method: "POST", body: JSON.stringify(d) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["students-paged"] });
      setShowModal(false);
      setName(""); setEmail(""); setPassword(""); setRollNumber(""); setNewHostelId(""); setRoomNumber("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: any) => Alert.alert("Error", e.message),
  });

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false); };

  const hostelName = (id: string) => (hostels as any[])?.find((h: any) => h.id === id)?.name || id;

  const renderItem = useCallback(({ item: s }: { item: any }) => (
      <AnimatedCard
        key={s.id}
        style={styles.card}
        onPress={() => { Haptics.selectionAsync(); setSelectedStudentId(s.id); }}
      >
        <View style={styles.cardRow}>
          <View style={[styles.avatar, { backgroundColor: theme.tint + "20" }]}>
            <Text style={[styles.avatarText, { color: theme.tint }]}>{s.name.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.studentName, { color: theme.text }]} numberOfLines={1}>{s.name}</Text>
            <Text style={[styles.studentEmail, { color: theme.textSecondary }]} numberOfLines={1}>{s.email}</Text>
            <View style={styles.meta}>
              {s.rollNumber && <Badge label={s.rollNumber} variant="gray" />}
              {s.hostelId && <Badge label={s.hostelName || hostelName(s.hostelId)} variant="blue" />}
              {s.roomNumber && <Text style={[styles.room, { color: theme.textTertiary }]}>Rm. {s.roomNumber}</Text>}
              {s.assignedMess && <Text style={[styles.room, { color: theme.textTertiary }]}>{s.assignedMess}</Text>}
            </View>
            {(s.checkInTime || s.attendanceStatus === "entered") && (
              <View style={[styles.presentBadge, { backgroundColor: "#22C55E20" }]}>
                <Feather name="check-circle" size={12} color="#22C55E" />
                <Text style={{ color: "#22C55E", fontSize: 11, fontFamily: "Inter_500Medium" }}>Present today</Text>
              </View>
            )}
          </View>
          <Feather name="chevron-right" size={16} color={theme.textTertiary} style={{ marginTop: 2 }} />
        </View>
      </AnimatedCard>
  ), [theme, hostels]);

  return (
    <SafeAreaView edges={["top"]} style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { paddingTop: 16, borderColor: theme.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={24} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          Students ({total > 0 ? total.toLocaleString() : allStudents.length})
        </Text>
        <Pressable onPress={() => setShowModal(true)} style={[styles.addBtn, { backgroundColor: theme.tint }]}>
          <Feather name="plus" size={20} color="#fff" />
        </Pressable>
      </View>

      {/* Search + Hostel Filter */}
      <View style={styles.searchContainer}>
        <View style={[styles.searchRow, { borderColor: theme.border, backgroundColor: theme.surface }]}>
          <Feather name="search" size={16} color={theme.textTertiary} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search name, roll no, room, mess..."
            placeholderTextColor={theme.textTertiary}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")} hitSlop={8}>
              <Feather name="x" size={16} color={theme.textTertiary} />
            </Pressable>
          )}
        </View>
        {(hostels as any[])?.length > 1 && (
          <View style={styles.hostelChips}>
            <Pressable
              onPress={() => setHostelFilter("")}
              style={[styles.chip, { borderColor: !hostelFilter ? theme.tint : theme.border, backgroundColor: !hostelFilter ? theme.tint + "15" : theme.surface }]}
            >
              <Text style={[styles.chipText, { color: !hostelFilter ? theme.tint : theme.textSecondary }]}>All</Text>
            </Pressable>
            {(hostels as any[]).map((h: any) => (
              <Pressable
                key={h.id}
                onPress={() => setHostelFilter(hostelFilter === h.id ? "" : h.id)}
                style={[styles.chip, { borderColor: hostelFilter === h.id ? theme.tint : theme.border, backgroundColor: hostelFilter === h.id ? theme.tint + "15" : theme.surface }]}
              >
                <Text style={[styles.chipText, { color: hostelFilter === h.id ? theme.tint : theme.textSecondary }]} numberOfLines={1}>{h.name}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <FlatList
        data={allStudents}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: isWeb ? 34 : 100, paddingTop: 8 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.tint} />}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          isLoading ? (
            <View style={{ paddingTop: 8 }}>
              <CardSkeleton /><CardSkeleton /><CardSkeleton />
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Feather name="users" size={40} color={theme.textTertiary} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                {search ? "No students found" : "No students yet"}
              </Text>
            </View>
          )
        }
        onEndReached={() => { if (hasNextPage && !isFetchingNextPage) fetchNextPage(); }}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          isFetchingNextPage ? (
            <View style={{ paddingVertical: 16, alignItems: "center" }}>
              <ActivityIndicator color={theme.tint} />
              <Text style={[styles.loadingMore, { color: theme.textTertiary }]}>Loading more...</Text>
            </View>
          ) : allStudents.length > 0 && !hasNextPage ? (
            <Text style={[styles.loadingMore, { color: theme.textTertiary, textAlign: "center", paddingVertical: 12 }]}>
              Showing all {allStudents.length.toLocaleString()} students
            </Text>
          ) : null
        }
      />

      {/* Add Student Modal */}
      <Modal visible={showModal} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setShowModal(false)}>
        <View style={[styles.modal, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHeader, { borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Add Student</Text>
            <Pressable onPress={() => setShowModal(false)} hitSlop={8}>
              <Feather name="x" size={24} color={theme.text} />
            </Pressable>
          </View>
          <FlatList
            keyboardShouldPersistTaps="handled"
            data={[{ key: "form" }]}
            renderItem={() => (
              <View style={styles.modalBody}>
                {[
                  { label: "Full Name *", value: name, onChange: setName, placeholder: "Arjun Kumar" },
                  { label: "Email *", value: email, onChange: setEmail, placeholder: "arjun@iitm.ac.in" },
                  { label: "Password *", value: password, onChange: setPassword, placeholder: "••••••••", secure: true },
                  { label: "Roll Number *", value: rollNumber, onChange: setRollNumber, placeholder: "25f3000001" },
                  { label: "Room Number", value: roomNumber, onChange: setRoomNumber, placeholder: "A-201" },
                ].map((f) => (
                  <View key={f.label}>
                    <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{f.label}</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
                      placeholder={f.placeholder}
                      placeholderTextColor={theme.textTertiary}
                      value={f.value}
                      onChangeText={f.onChange}
                      secureTextEntry={(f as any).secure}
                      autoCapitalize="none"
                    />
                  </View>
                ))}
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Hostel</Text>
                <View style={{ gap: 8 }}>
                  {(hostels as any[])?.map((h: any) => (
                    <Pressable
                      key={h.id}
                      onPress={() => setNewHostelId(newHostelId === h.id ? "" : h.id)}
                      style={[styles.checkRow, {
                        borderColor: newHostelId === h.id ? theme.tint : theme.border,
                        backgroundColor: newHostelId === h.id ? theme.tint + "10" : theme.surface,
                      }]}
                    >
                      <Feather name={newHostelId === h.id ? "check-circle" : "circle"} size={18} color={newHostelId === h.id ? theme.tint : theme.textTertiary} />
                      <Text style={[styles.checkLabel, { color: theme.text }]}>{h.name}</Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable
                  onPress={() => {
                    if (!name || !email || !password || !rollNumber) {
                      Alert.alert("Error", "Name, email, password, and roll number are required");
                      return;
                    }
                    createMutation.mutate({ name, email, password, rollNumber, hostelId: newHostelId || undefined, roomNumber: roomNumber || undefined });
                  }}
                  style={[styles.submitBtn, { backgroundColor: theme.tint }]}
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Add Student</Text>}
                </Pressable>
              </View>
            )}
          />
        </View>
      </Modal>

      <StudentProfileModal
        visible={!!selectedStudentId}
        studentId={selectedStudentId}
        onClose={() => setSelectedStudentId(null)}
        theme={theme}
        request={request}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
  addBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  searchContainer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4, gap: 8 },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", height: 22 },
  hostelChips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  chipText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  card: { marginBottom: 10 },
  cardRow: { flexDirection: "row", gap: 14, alignItems: "flex-start" },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 18, fontFamily: "Inter_700Bold" },
  studentName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  studentEmail: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  meta: { flexDirection: "row", gap: 6, marginTop: 6, flexWrap: "wrap", alignItems: "center" },
  room: { fontSize: 12, fontFamily: "Inter_400Regular" },
  presentBadge: { flexDirection: "row", gap: 4, alignItems: "center", marginTop: 6, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, alignSelf: "flex-start" },
  loadingMore: { fontSize: 12, fontFamily: "Inter_400Regular" },
  emptyState: { alignItems: "center", paddingVertical: 60, gap: 10 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  modal: { flex: 1 },
  dragHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#94a3b830", alignSelf: "center", marginTop: 12, marginBottom: 4 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
  modalTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  modalBody: { padding: 20, gap: 4, paddingBottom: 60 },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_500Medium", marginTop: 12, marginBottom: 6 },
  input: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: "Inter_400Regular" },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 12, borderWidth: 1 },
  checkLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
  submitBtn: { borderRadius: 12, paddingVertical: 15, alignItems: "center", marginTop: 20 },
  submitText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
