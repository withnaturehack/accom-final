import React, { useEffect, useState, useMemo } from "react";
import {
  View, Text, ScrollView, StyleSheet, Pressable, Modal,
  TextInput, ActivityIndicator, Alert, RefreshControl,
  Platform, useColorScheme, SectionList,
} from "react-native";
import { useSafeAreaInsets, SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useApiRequest } from "@/context/AuthContext";
import { AnimatedCard } from "@/components/ui/AnimatedCard";
import { Badge } from "@/components/ui/Badge";
import { CardSkeleton } from "@/components/ui/LoadingSkeleton";

type StaffRole = "volunteer" | "coordinator" | "admin" | "superadmin";

const ROLE_COLORS: Record<StaffRole, string> = {
  volunteer: "#22C55E",
  coordinator: "#3B82F6",
  admin: "#8B5CF6",
  superadmin: "#EF4444",
};

const ROLE_LABELS: Record<StaffRole, string> = {
  volunteer: "Volunteer",
  coordinator: "Admin",
  admin: "Admin",
  superadmin: "Super Admin",
};

const ROLE_BADGE_VARIANTS: Record<StaffRole, "green" | "blue" | "purple" | "red"> = {
  volunteer: "green",
  coordinator: "blue",
  admin: "purple",
  superadmin: "red",
};

export default function ManageAdminsScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const request = useApiRequest();
  const queryClient = useQueryClient();
  const isWeb = Platform.OS === "web";

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showResetPwModal, setShowResetPwModal] = useState(false);
  const [bulkResetting, setBulkResetting] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<any>(null);
  const [resetPwTarget, setResetPwTarget] = useState<any>(null);
  const [newPassword, setNewPassword] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [csvText, setCsvText] = useState("");
  const [purgeFirst, setPurgeFirst] = useState(false);
  const [importResult, setImportResult] = useState<{purged?:number;updated:number;created:number;skipped:number;errors?:string[]}|null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<StaffRole>("volunteer");
  const [createHostelId, setCreateHostelId] = useState("");
  const [createAssignedIds, setCreateAssignedIds] = useState<string[]>([]);

  const { data: staff, isLoading, refetch } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => request("/admin/admin-users"),
    refetchInterval: 30000,
    staleTime: 15000,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });

  const { data: hostels } = useQuery({
    queryKey: ["hostels"],
    queryFn: () => request("/hostels"),
    staleTime: 30000,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => request("/admin/admin-users", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setShowCreateModal(false);
      resetCreateForm();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: any) => Alert.alert("Error", e.message),
  });

  const assignMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      request(`/admin/admin-users/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ["admin-users"] });
      const prev = queryClient.getQueryData(["admin-users"]);
      queryClient.setQueryData(["admin-users"], (old: any[]) =>
        (old || []).map(s => s.id === id ? { ...s, ...data, hostelName: data.hostelName ?? s.hostelName } : s)
      );
      return { prev };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.refetchQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["students"] });
      queryClient.invalidateQueries({ queryKey: ["hostels"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-simple"] });
      queryClient.invalidateQueries({ queryKey: ["master-students"] });
      queryClient.invalidateQueries({ queryKey: ["staff"] });
      queryClient.invalidateQueries({ queryKey: ["staff-all"] });
      queryClient.invalidateQueries({ queryKey: ["profile-me-live"] });
      setShowAssignModal(false);
      setSelectedStaff(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: any, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["admin-users"], ctx.prev);
      Alert.alert("Error", e.message);
    },
  });

  const importStaffMutation = useMutation({
    mutationFn: async ({ csv, purge }: { csv: string; purge: boolean }) =>
      request(`/import/staff?purge=${purge ? "true" : "false"}`, {
        method: "POST",
        body: JSON.stringify({ csv }),
      }),
    onSuccess: (res: any) => {
      setImportResult(res);
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.refetchQueries({ queryKey: ["admin-users"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: any) => Alert.alert("Import Error", e.message || "Failed to import staff CSV"),
  });

  const resetPwMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      request(`/admin/reset-password/${id}`, { method: "POST", body: JSON.stringify({ password }) }),
    onSuccess: (res: any) => {
      setShowResetPwModal(false);
      setNewPassword("");
      setResetPwTarget(null);
      Alert.alert("Password Reset", `Password updated for ${res.name}. They can now login with the new password.`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: any) => Alert.alert("Reset Failed", e.message),
  });

  const resetAllPasswordsMutation = async () => {
    const confirmed = Platform.OS === "web"
      ? window.confirm("Reset ALL user passwords to their email prefix?\n\nExample: 24f2004962@iitm.ds.ac.in → password: 24f2004962\n\nThis affects every student AND staff account.")
      : await new Promise<boolean>((resolve) => {
          Alert.alert(
            "Reset All Passwords?",
            "This resets EVERY account's password to their email prefix.\n\nExample: 24f2004962@iitm.ds.ac.in → 24f2004962\n\nThis affects all students and staff.",
            [{ text: "Cancel", style: "cancel", onPress: () => resolve(false) },
             { text: "Reset All", style: "destructive", onPress: () => resolve(true) }],
          );
        });
    if (!confirmed) return;
    setBulkResetting(true);
    try {
      const result = await request("/auth/reset-all-passwords-to-prefix", { method: "POST" });
      Alert.alert("Done", `${result?.message || "Passwords reset to email prefix"}`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to reset passwords");
    }
    setBulkResetting(false);
  };

  const deleteMutation = useMutation({
    mutationFn: (id: string) => request(`/admin/admin-users/${id}`, { method: "DELETE" }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["admin-users"] });
      const prev = queryClient.getQueryData(["admin-users"]);
      queryClient.setQueryData(["admin-users"], (old: any[]) => (old || []).filter((s: any) => s.id !== id));
      return { prev };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: any, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["admin-users"], ctx.prev);
      Alert.alert("Delete Failed", e.message || "Could not remove this staff member.");
    },
  });

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false); };

  function resetCreateForm() {
    setName(""); setEmail(""); setPassword(""); setRole("volunteer");
    setCreateHostelId(""); setCreateAssignedIds([]);
  }

  function openAssign(member: any) {
    setSelectedStaff(member);
    setShowAssignModal(true);
  }

  function handleDelete(member: any) {
    Alert.alert("Remove Staff", `Remove ${member.name} from the system?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove", style: "destructive",
        onPress: () => { Haptics.impactAsync(); deleteMutation.mutate(member.id); },
      },
    ]);
  }

  const filtered = useMemo(() => {
    if (!staff) return [];
    const q = searchQ.toLowerCase().trim();
    if (!q) return staff as any[];
    return (staff as any[]).filter((s: any) =>
      s.name.toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q) ||
      (s.hostelName || "").toLowerCase().includes(q) ||
      (s.role || "").toLowerCase().includes(q)
    );
  }, [staff, searchQ]);

  const sections = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const s of filtered) {
      if (!groups[s.role]) groups[s.role] = [];
      groups[s.role].push(s);
    }
    const order: StaffRole[] = ["superadmin", "admin", "coordinator", "volunteer"];
    return order.filter(r => groups[r]?.length).map(r => ({ title: ROLE_LABELS[r] + "s", data: groups[r] }));
  }, [filtered]);

  return (
    <SafeAreaView edges={["top"]} style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { paddingTop: 16, borderColor: theme.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          Manage Admins {staff ? `(${(staff as any[]).length})` : ""}
        </Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable
            onPress={resetAllPasswordsMutation}
            disabled={bulkResetting}
            style={[styles.addBtn, { backgroundColor: "#f59e0b", opacity: bulkResetting ? 0.6 : 1 }]}
            hitSlop={4}
          >
            {bulkResetting
              ? <ActivityIndicator size="small" color="#fff" />
              : <Feather name="key" size={16} color="#fff" />}
          </Pressable>
          <Pressable onPress={() => { setCsvText(""); setImportResult(null); setShowImportModal(true); }} style={[styles.addBtn, { backgroundColor: "#0EA5E9" }]}>
            <Feather name="upload" size={18} color="#fff" />
          </Pressable>
          <Pressable onPress={() => { resetCreateForm(); setShowCreateModal(true); }} style={[styles.addBtn, { backgroundColor: "#8B5CF6" }]}>
            <Feather name="user-plus" size={18} color="#fff" />
          </Pressable>
        </View>
      </View>

      <View style={[styles.searchRow, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <Feather name="search" size={16} color={theme.textTertiary} />
        <TextInput
          style={[styles.searchInput, { color: theme.text }]}
          placeholder="Search by name, email, hostel, role..."
          placeholderTextColor={theme.textTertiary}
          value={searchQ}
          onChangeText={setSearchQ}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {searchQ.length > 0 && (
          <Pressable onPress={() => setSearchQ("")} hitSlop={8}>
            <Feather name="x" size={16} color={theme.textTertiary} />
          </Pressable>
        )}
      </View>

      {isLoading ? (
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <CardSkeleton /><CardSkeleton /><CardSkeleton />
        </ScrollView>
      ) : !filtered.length ? (
        <View style={styles.emptyState}>
          <Feather name="users" size={40} color={theme.textTertiary} />
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            {searchQ ? "No results found" : "No staff members yet"}
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: isWeb ? 34 : 100, paddingTop: 8 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.tint} />}
          renderSectionHeader={({ section }) => (
            <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>{section.title}</Text>
          )}
          renderItem={({ item: member }) => {
            const roleColor = ROLE_COLORS[member.role as StaffRole] || "#8B5CF6";
            const assignedIds: string[] = member.assignedHostelIds || [];
            const assignedNames = assignedIds.map((id: string) =>
              (hostels as any[])?.find((h: any) => h.id === id)?.name || id
            ).join(", ");
            const currentHostelName = member.hostelId
              ? ((hostels as any[])?.find((h: any) => h.id === member.hostelId)?.name || member.hostelId)
              : "";
            const displayHostel = member.role === "volunteer" ? currentHostelName : assignedNames;
            const isOnline = member.lastActiveAt &&
              Date.now() - new Date(member.lastActiveAt).getTime() < 10 * 60 * 1000;

            return (
              <AnimatedCard style={[styles.card, { borderLeftColor: roleColor, borderLeftWidth: 3 }]}>
                <View style={styles.cardTop}>
                  <View style={[styles.avatar, { backgroundColor: roleColor + "20" }]}>
                    <Text style={[styles.avatarText, { color: roleColor }]}>
                      {member.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.nameRow}>
                      <Text style={[styles.memberName, { color: theme.text }]} numberOfLines={1}>{member.name}</Text>
                      {isOnline && <View style={styles.onlineDot} />}
                    </View>
                    <Text style={[styles.memberEmail, { color: theme.textSecondary }]} numberOfLines={1}>{member.email}</Text>
                    <Badge
                      label={ROLE_LABELS[member.role as StaffRole] || member.role}
                      variant={ROLE_BADGE_VARIANTS[member.role as StaffRole] || "purple"}
                    />
                  </View>
                  <View style={styles.actions}>
                    <Pressable onPress={() => openAssign(member)} style={[styles.actionBtn, { backgroundColor: theme.tint + "15" }]} hitSlop={4}>
                      <Feather name="home" size={15} color={theme.tint} />
                    </Pressable>
                    <Pressable onPress={() => { setResetPwTarget(member); setNewPassword(""); setShowResetPwModal(true); }} style={[styles.actionBtn, { backgroundColor: "#F5A62315" }]} hitSlop={4}>
                      <Feather name="key" size={15} color="#F5A623" />
                    </Pressable>
                    <Pressable onPress={() => handleDelete(member)} style={[styles.actionBtn, { backgroundColor: "#EF444415" }]} hitSlop={4}>
                      <Feather name="trash-2" size={15} color="#EF4444" />
                    </Pressable>
                  </View>
                </View>
                {displayHostel ? (
                  <View style={[styles.hostelRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <Feather name="home" size={13} color={theme.textTertiary} />
                    <Text style={[styles.hostelText, { color: theme.textSecondary }]} numberOfLines={2}>
                      {displayHostel}
                      {member.role !== "volunteer" && assignedNames && assignedIds.length > 1 ? ` (${assignedIds.length} hostels)` : ""}
                    </Text>
                  </View>
                ) : (
                  <View style={[styles.hostelRow, { backgroundColor: "#F5A62315", borderColor: "#F5A62340" }]}>
                    <Feather name="alert-circle" size={13} color="#F5A623" />
                    <Text style={[styles.hostelText, { color: "#F5A623" }]}>Hostel Not Assigned</Text>
                  </View>
                )}
                {!!member.area && (
                  <View style={[styles.hostelRow, { backgroundColor: theme.surface, borderColor: theme.border, marginTop: 6 }]}>
                    <Feather name="map-pin" size={13} color={theme.textTertiary} />
                    <Text style={[styles.hostelText, { color: theme.textSecondary }]} numberOfLines={1}>{member.area}</Text>
                  </View>
                )}
              </AnimatedCard>
            );
          }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Create Staff Modal */}
      <Modal visible={showCreateModal} animationType="slide" onRequestClose={() => setShowCreateModal(false)}>
        <View style={[styles.modal, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHeader, { borderColor: theme.border, paddingTop: (isWeb ? 20 : insets.top) + 12 }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Add Staff Member</Text>
            <Pressable onPress={() => setShowCreateModal(false)} hitSlop={8}>
              <Feather name="x" size={24} color={theme.text} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Role *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
              <View style={styles.roleRow}>
                {(["volunteer", "coordinator", "admin", "superadmin"] as StaffRole[]).map(r => (
                  <Pressable
                    key={r}
                    onPress={() => setRole(r)}
                    style={[styles.rolePill, {
                      backgroundColor: role === r ? ROLE_COLORS[r] + "20" : theme.surface,
                      borderColor: role === r ? ROLE_COLORS[r] : theme.border,
                    }]}
                  >
                    <Text style={[styles.rolePillText, { color: role === r ? ROLE_COLORS[r] : theme.textSecondary }]}>
                      {ROLE_LABELS[r]}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            {[
              { label: "Full Name *", value: name, onChange: setName, placeholder: "e.g. Ravi Kumar" },
              {
                label: "Email *",
                value: email,
                onChange: (v: string) => {
                  setEmail(v);
                  const prefix = v.split("@")[0]?.trim() || "";
                  if (prefix) setPassword(prefix);
                },
                placeholder: "23f3000358@es.study.iitm.ac.in",
              },
              {
                label: "Password * (auto-filled from email prefix)",
                value: password,
                onChange: setPassword,
                placeholder: "e.g. 23f3000358",
                secure: false,
              },
            ].map((f) => (
              <View key={f.label}>
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{f.label}</Text>
                <TextInput
                  style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
                  placeholder={f.placeholder}
                  placeholderTextColor={theme.textTertiary}
                  value={f.value}
                  onChangeText={f.onChange}
                  secureTextEntry={(f as any).secure}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            ))}
            <Text style={{ color: theme.textTertiary, fontSize: 11, fontFamily: "Inter_400Regular", marginTop: -8, marginBottom: 8 }}>
              Tip: Password defaults to the email prefix (everything before <Text style={{ fontFamily: "Inter_700Bold" }}>@</Text>). Edit it manually if you need a custom one.
            </Text>

            {hostels && (hostels as any[]).length > 0 && (
              <>
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
                  {role === "volunteer" ? "Assign Hostel (single)" : "Assign Hostels (can select multiple)"}
                </Text>
                {role === "volunteer" ? (
                  <View style={{ gap: 8 }}>
                    <Pressable
                      onPress={() => setCreateHostelId("")}
                      style={[styles.checkRow, { borderColor: createHostelId === "" ? "#94A3B8" : theme.border, backgroundColor: theme.surface }]}
                    >
                      <Feather name={createHostelId === "" ? "check-circle" : "circle"} size={18} color={createHostelId === "" ? theme.textSecondary : theme.textTertiary} />
                      <Text style={[styles.checkLabel, { color: theme.textSecondary }]}>No hostel (assign later)</Text>
                    </Pressable>
                    {(hostels as any[]).map((h: any) => (
                      <Pressable
                        key={h.id}
                        onPress={() => setCreateHostelId(h.id)}
                        style={[styles.checkRow, {
                          borderColor: createHostelId === h.id ? theme.tint : theme.border,
                          backgroundColor: createHostelId === h.id ? theme.tint + "10" : theme.surface,
                        }]}
                      >
                        <Feather name={createHostelId === h.id ? "check-circle" : "circle"} size={18} color={createHostelId === h.id ? theme.tint : theme.textTertiary} />
                        <Text style={[styles.checkLabel, { color: theme.text }]}>{h.name}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  <View style={{ gap: 8 }}>
                    {(hostels as any[]).map((h: any) => {
                      const selected = createAssignedIds.includes(h.id);
                      return (
                        <Pressable
                          key={h.id}
                          onPress={() => setCreateAssignedIds(prev =>
                            selected ? prev.filter(id => id !== h.id) : [...prev, h.id]
                          )}
                          style={[styles.checkRow, { borderColor: selected ? theme.tint : theme.border, backgroundColor: selected ? theme.tint + "10" : theme.surface }]}
                        >
                          <Feather name={selected ? "check-square" : "square"} size={18} color={selected ? theme.tint : theme.textTertiary} />
                          <Text style={[styles.checkLabel, { color: theme.text }]}>{h.name}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </>
            )}

            <Pressable
              onPress={() => {
                if (!name.trim() || !email.trim() || !password.trim()) {
                  Alert.alert("Missing Fields", "Name, email, and password are required");
                  return;
                }
                createMutation.mutate({
                  name: name.trim(), email: email.trim(), password, role,
                  hostelId: role === "volunteer" ? (createHostelId || null) : null,
                  assignedHostelIds: role !== "volunteer" ? createAssignedIds : [],
                });
              }}
              style={[styles.submitBtn, { backgroundColor: ROLE_COLORS[role] }]}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.submitText}>Create {ROLE_LABELS[role]}</Text>}
            </Pressable>
          </ScrollView>
        </View>
      </Modal>

      {/* Assign Hostel Modal */}
      <Modal visible={showAssignModal} animationType="slide" onRequestClose={() => setShowAssignModal(false)}>
        <View style={[styles.modal, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHeader, { borderColor: theme.border, paddingTop: (isWeb ? 20 : insets.top) + 12 }]}>
            <View>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Assign Hostel & Area</Text>
              {selectedStaff && (
                <Text style={[styles.modalSub, { color: theme.textSecondary }]}>
                  {selectedStaff.name} · {ROLE_LABELS[selectedStaff.role as StaffRole] || selectedStaff.role}
                </Text>
              )}
            </View>
            <Pressable onPress={() => setShowAssignModal(false)} hitSlop={8}>
              <Feather name="x" size={24} color={theme.text} />
            </Pressable>
          </View>
          {selectedStaff && (
            <AssignHostelForm
              key={selectedStaff.id}
              staff={selectedStaff}
              hostels={(hostels as any[]) || []}
              theme={theme}
              isPending={assignMutation.isPending}
              onAssign={(data) => assignMutation.mutate({ id: selectedStaff.id, data })}
            />
          )}
        </View>
      </Modal>

      {/* Reset Password Modal */}
      <Modal visible={showResetPwModal} animationType="slide" onRequestClose={() => setShowResetPwModal(false)}>
        <View style={[styles.modal, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHeader, { borderColor: theme.border, paddingTop: (isWeb ? 20 : insets.top) + 12 }]}>
            <View>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Reset Password</Text>
              {resetPwTarget && (
                <Text style={[styles.modalSub, { color: theme.textSecondary }]}>
                  {resetPwTarget.name} · {resetPwTarget.email}
                </Text>
              )}
            </View>
            <Pressable onPress={() => setShowResetPwModal(false)} hitSlop={8}>
              <Feather name="x" size={24} color={theme.text} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={[styles.modalBody, { gap: 8 }]}>
            <Text style={[styles.fieldLabel, { color: theme.text }]}>New Password</Text>
            <TextInput
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="Enter new password (min 4 chars)"
              placeholderTextColor={theme.textTertiary}
              secureTextEntry={false}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={{ color: theme.textTertiary, fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 4 }}>
              After resetting, share the new password with the staff member so they can login.
            </Text>
            <Pressable
              onPress={() => {
                if (!newPassword || newPassword.length < 4) {
                  Alert.alert("Too Short", "Password must be at least 4 characters");
                  return;
                }
                if (resetPwTarget) resetPwMutation.mutate({ id: resetPwTarget.id, password: newPassword });
              }}
              style={[styles.submitBtn, { backgroundColor: "#F5A623" }]}
              disabled={resetPwMutation.isPending}
            >
              {resetPwMutation.isPending
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.submitText}>Reset Password</Text>
              }
            </Pressable>
          </ScrollView>
        </View>
      </Modal>

      {/* Bulk Import Staff Modal */}
      <Modal visible={showImportModal} animationType="slide" onRequestClose={() => setShowImportModal(false)}>
        <View style={[styles.modal, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHeader, { borderColor: theme.border, paddingTop: (isWeb ? 20 : insets.top) + 12 }]}>
            <View>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Bulk Import Staff</Text>
              <Text style={[styles.modalSub, { color: theme.textSecondary }]}>CSV columns: Email, Name, Contact Number, Gender, Role</Text>
            </View>
            <Pressable onPress={() => setShowImportModal(false)} hitSlop={8}>
              <Feather name="x" size={24} color={theme.text} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={[styles.modalBody, { gap: 12 }]} keyboardShouldPersistTaps="handled">

            <View style={{ backgroundColor: "#0EA5E915", borderColor: "#0EA5E940", borderWidth: 1, borderRadius: 10, padding: 12, flexDirection: "row", gap: 10 }}>
              <Feather name="info" size={16} color="#0EA5E9" style={{ marginTop: 2 }} />
              <Text style={{ flex: 1, color: theme.text, fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 18 }}>
                Roles accepted: Super Admin, Admin, Coordinator, Volunteer. Default password is the <Text style={{ fontFamily: "Inter_700Bold" }}>email prefix</Text> (e.g. <Text style={{ fontFamily: "Inter_700Bold" }}>23f3000358</Text> for <Text style={{ fontFamily: "Inter_700Bold" }}>23f3000358@es.study.iitm.ac.in</Text>) if not provided.
                Existing accounts (matched by email) are updated; new ones are created.
              </Text>
            </View>

            {isWeb && (
              <Pressable
                onPress={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = ".csv,text/csv";
                  input.onchange = async (e: any) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const text = await file.text();
                    setCsvText(text);
                  };
                  input.click();
                }}
                style={[styles.checkRow, { borderColor: theme.tint, backgroundColor: theme.tint + "10", justifyContent: "center" }]}
              >
                <Feather name="upload" size={16} color={theme.tint} />
                <Text style={[styles.checkLabel, { color: theme.tint }]}>Choose CSV File</Text>
              </Pressable>
            )}

            <Text style={[styles.fieldLabel, { color: theme.text }]}>Or paste CSV content:</Text>
            <TextInput
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface, height: 220, textAlignVertical: "top", fontFamily: "Inter_400Regular", fontSize: 12 }]}
              value={csvText}
              onChangeText={setCsvText}
              multiline
              placeholder={"Email,Name,Contact Number,Gender,Role\n21f3003255@ds.study.iitm.ac.in,Astitva Vats,8840585790,Male,Super Admin\n..."}
              placeholderTextColor={theme.textTertiary}
              autoCorrect={false}
              autoCapitalize="none"
            />

            <Pressable
              onPress={() => setPurgeFirst(p => !p)}
              style={[styles.checkRow, {
                borderColor: purgeFirst ? "#EF4444" : theme.border,
                backgroundColor: purgeFirst ? "#EF444412" : theme.surface,
              }]}
            >
              <Feather name={purgeFirst ? "check-square" : "square"} size={18} color={purgeFirst ? "#EF4444" : theme.textTertiary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.checkLabel, { color: purgeFirst ? "#EF4444" : theme.text, fontFamily: "Inter_600SemiBold" }]}>
                  Replace all existing staff
                </Text>
                <Text style={{ color: theme.textTertiary, fontSize: 11, fontFamily: "Inter_400Regular" }}>
                  Deletes every volunteer/admin/super-admin (except you) before importing.
                </Text>
              </View>
            </Pressable>

            {importResult && (
              <View style={{ backgroundColor: "#14532D22", borderRadius: 10, padding: 14, gap: 4 }}>
                <Text style={{ color: "#22C55E", fontFamily: "Inter_700Bold", fontSize: 14 }}>Import Complete</Text>
                <Text style={{ color: theme.textSecondary, fontFamily: "Inter_400Regular", fontSize: 12 }}>
                  {importResult.purged ? `Purged: ${importResult.purged} · ` : ""}
                  Created: {importResult.created} · Updated: {importResult.updated} · Skipped: {importResult.skipped}
                </Text>
                {importResult.errors && importResult.errors.length > 0 && (
                  <Text style={{ color: "#EF4444", fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 4 }}>
                    {importResult.errors.slice(0, 3).join("\n")}
                  </Text>
                )}
              </View>
            )}

            <Pressable
              onPress={() => {
                setImportResult(null);
                if (!csvText.trim()) { Alert.alert("Error", "Paste or upload some CSV first"); return; }
                const lineCount = csvText.trim().split("\n").length - 1;
                const doImport = () => importStaffMutation.mutate({ csv: csvText, purge: purgeFirst });
                if (purgeFirst) {
                  Alert.alert(
                    "Replace All Staff?",
                    `This will permanently delete every existing volunteer/admin/super-admin (except you) and import ${lineCount} new rows. Continue?`,
                    [
                      { text: "Cancel", style: "cancel" },
                      { text: "Replace", style: "destructive", onPress: doImport },
                    ],
                  );
                } else {
                  doImport();
                }
              }}
              style={[styles.submitBtn, { backgroundColor: purgeFirst ? "#EF4444" : "#0EA5E9" }]}
              disabled={importStaffMutation.isPending || !csvText.trim()}
            >
              {importStaffMutation.isPending
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.submitText}>
                    {purgeFirst ? "Replace & Import" : "Import"} {csvText.trim() ? `(${Math.max(0, csvText.trim().split("\n").length - 1)} rows)` : ""}
                  </Text>
              }
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function AssignHostelForm({
  staff, hostels, theme, isPending, onAssign,
}: {
  staff: any; hostels: any[]; theme: any; isPending: boolean; onAssign: (data: any) => void;
}) {
  const isVolunteer = staff?.role === "volunteer";
  const [selectedId, setSelectedId] = useState<string>(staff?.hostelId || "");
  const [selectedIds, setSelectedIds] = useState<string[]>(staff?.assignedHostelIds || []);
  const [area, setArea] = useState<string>(staff?.area || "");

  useEffect(() => {
    setSelectedId(staff?.hostelId || "");
    setSelectedIds(staff?.assignedHostelIds || []);
    setArea(staff?.area || "");
  }, [staff?.id, staff?.hostelId, staff?.assignedHostelIds, staff?.area]);

  return (
    <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
        {isVolunteer ? "Select hostel for this volunteer" : "Select hostels this coordinator can manage"}
      </Text>

      {isVolunteer ? (
        <View style={{ gap: 8 }}>
          <Pressable
            onPress={() => setSelectedId("")}
            style={[styles.checkRow, { borderColor: selectedId === "" ? "#94A3B8" : theme.border, backgroundColor: theme.surface }]}
          >
            <Feather name={selectedId === "" ? "check-circle" : "circle"} size={18} color={selectedId === "" ? theme.textSecondary : theme.textTertiary} />
            <Text style={[styles.checkLabel, { color: theme.textSecondary }]}>Unassign (remove hostel)</Text>
          </Pressable>
          {hostels.map(h => (
            <Pressable
              key={h.id}
              onPress={() => setSelectedId(h.id)}
              style={[styles.checkRow, {
                borderColor: selectedId === h.id ? theme.tint : theme.border,
                backgroundColor: selectedId === h.id ? theme.tint + "10" : theme.surface,
              }]}
            >
              <Feather name={selectedId === h.id ? "check-circle" : "circle"} size={18} color={selectedId === h.id ? theme.tint : theme.textTertiary} />
              <View>
                <Text style={[styles.checkLabel, { color: theme.text }]}>{h.name}</Text>
                {h.location && <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textTertiary }}>{h.location}</Text>}
              </View>
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          {hostels.map(h => {
            const sel = selectedIds.includes(h.id);
            return (
              <Pressable
                key={h.id}
                onPress={() => setSelectedIds(prev => sel ? prev.filter(id => id !== h.id) : [...prev, h.id])}
                style={[styles.checkRow, {
                  borderColor: sel ? theme.tint : theme.border,
                  backgroundColor: sel ? theme.tint + "10" : theme.surface,
                }]}
              >
                <Feather name={sel ? "check-square" : "square"} size={18} color={sel ? theme.tint : theme.textTertiary} />
                <View>
                  <Text style={[styles.checkLabel, { color: theme.text }]}>{h.name}</Text>
                  {h.location && <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textTertiary }}>{h.location}</Text>}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Area</Text>
      <TextInput
        style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
        value={area}
        onChangeText={setArea}
        placeholder="Set area for this staff"
        placeholderTextColor={theme.textTertiary}
      />

      <Pressable
        onPress={() => {
          if (isVolunteer) {
            onAssign({ hostelId: selectedId || null, area: area.trim() || null });
          } else {
            onAssign({
              hostelId: staff?.hostelId || null,
              assignedHostelIds: selectedIds,
              area: area.trim() || null,
            });
          }
        }}
        style={[styles.submitBtn, { backgroundColor: theme.tint }]}
        disabled={isPending}
      >
        {isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Save Assignment</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingBottom: 20, borderBottomWidth: 1 },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, fontSize: 17, fontFamily: "Inter_700Bold", textAlign: "center" },
  addBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 20, marginTop: 12, marginBottom: 4, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", height: 22 },
  sectionHeader: { fontSize: 11, fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 1, marginTop: 14, marginBottom: 6 },
  card: { marginBottom: 10 },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 20, fontFamily: "Inter_700Bold" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  memberName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#22C55E" },
  memberEmail: { fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 6 },
  actions: { flexDirection: "row", gap: 8, marginLeft: 4 },
  actionBtn: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  hostelRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  hostelText: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 10 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  modal: { flex: 1 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
  modalTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  modalSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  modalBody: { padding: 20, gap: 4, paddingBottom: 48 },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginTop: 14, marginBottom: 6 },
  input: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: "Inter_400Regular" },
  roleRow: { flexDirection: "row", gap: 8, paddingBottom: 4 },
  rolePill: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1 },
  rolePillText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 12, borderWidth: 1 },
  checkLabel: { fontSize: 14, fontFamily: "Inter_500Medium", flex: 1 },
  submitBtn: { borderRadius: 14, paddingVertical: 15, alignItems: "center", marginTop: 24 },
  submitText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
