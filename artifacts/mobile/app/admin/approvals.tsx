import React, { useState } from "react";
import {
  View, Text, FlatList, StyleSheet, Pressable, Alert,
  ActivityIndicator, useColorScheme, Modal, ScrollView,
  Platform,
} from "react-native";
import { useSafeAreaInsets, SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useAuth, useApiRequest } from "@/context/AuthContext";

const ROLES = ["student", "volunteer", "coordinator", "admin"] as const;
type RoleOption = typeof ROLES[number];

interface PendingUser {
  id: string;
  name: string;
  email: string;
  rollNumber?: string;
  phone?: string;
  createdAt: string;
}

interface Hostel {
  id: string;
  name: string;
  location?: string;
}

function ApproveModal({
  user, visible, onClose, theme, request, qc,
}: {
  user: PendingUser | null;
  visible: boolean;
  onClose: () => void;
  theme: any;
  request: any;
  qc: any;
}) {
  const modalInsets = useSafeAreaInsets();
  const [selectedRole, setSelectedRole] = useState<RoleOption>("student");
  const [selectedHostelId, setSelectedHostelId] = useState("");
  const [approving, setApproving] = useState(false);

  const { data: hostels = [] } = useQuery<Hostel[]>({
    queryKey: ["hostels-list"],
    queryFn: () => request("/hostels"),
    enabled: visible,
    staleTime: 60000,
  });

  const handleApprove = async () => {
    if (!user) return;
    setApproving(true);
    try {
      await request(`/approvals/${user.id}/approve`, {
        method: "PATCH",
        body: JSON.stringify({ role: selectedRole, hostelId: selectedHostelId || undefined }),
      });
      qc.invalidateQueries({ queryKey: ["pending-users"] });
      qc.invalidateQueries({ queryKey: ["pending-count"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Approval failed");
    } finally {
      setApproving(false);
    }
  };

  if (!user) return null;

  const needsHostel = selectedRole === "student" || selectedRole === "volunteer";

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.modalContainer, { backgroundColor: theme.background }]}>
        <View style={styles.dragHandle} />
        <View style={[styles.modalHeader, { borderBottomColor: theme.border, paddingTop: Math.max(modalInsets.top + 16, 56) }]}>
          <Text style={[styles.modalTitle, { color: theme.text }]}>Approve User</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Feather name="x" size={22} color={theme.textSecondary} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: Math.max(modalInsets.bottom + 32, 64) }}>
          {/* User Info */}
          <View style={[styles.userCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={[styles.userAvatar, { backgroundColor: theme.tint + "20" }]}>
              <Text style={[styles.userAvatarText, { color: theme.tint }]}>{(user.name || "?")[0].toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.userName, { color: theme.text }]}>{user.name}</Text>
              <Text style={[styles.userEmail, { color: theme.textSecondary }]}>{user.email}</Text>
              {user.rollNumber && <Text style={[styles.userRoll, { color: theme.textTertiary }]}>{user.rollNumber}</Text>}
            </View>
          </View>

          {/* Role Selection */}
          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Assign Role</Text>
          <View style={styles.roleRow}>
            {ROLES.map(role => (
              <Pressable
                key={role}
                onPress={() => { setSelectedRole(role); Haptics.selectionAsync(); }}
                style={[styles.roleChip, {
                  backgroundColor: selectedRole === role ? theme.tint : theme.surface,
                  borderColor: selectedRole === role ? theme.tint : theme.border,
                }]}
              >
                <Text style={[styles.roleChipText, { color: selectedRole === role ? "#fff" : theme.textSecondary }]}>
                  {role.charAt(0).toUpperCase() + role.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Hostel Assignment */}
          {needsHostel && (
            <>
              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Assign Hostel {selectedRole === "student" ? "(required)" : "(optional)"}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Pressable
                    onPress={() => setSelectedHostelId("")}
                    style={[styles.hostelChip, {
                      backgroundColor: !selectedHostelId ? theme.tint : theme.surface,
                      borderColor: !selectedHostelId ? theme.tint : theme.border,
                    }]}
                  >
                    <Text style={[styles.hostelChipText, { color: !selectedHostelId ? "#fff" : theme.textSecondary }]}>None</Text>
                  </Pressable>
                  {(hostels as Hostel[]).map(h => (
                    <Pressable
                      key={h.id}
                      onPress={() => { setSelectedHostelId(h.id); Haptics.selectionAsync(); }}
                      style={[styles.hostelChip, {
                        backgroundColor: selectedHostelId === h.id ? theme.tint : theme.surface,
                        borderColor: selectedHostelId === h.id ? theme.tint : theme.border,
                      }]}
                    >
                      <Text style={[styles.hostelChipText, { color: selectedHostelId === h.id ? "#fff" : theme.textSecondary }]}>{h.name}</Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </>
          )}

          <Pressable
            style={[styles.approveBtn, { backgroundColor: "#22c55e" }, approving && { opacity: 0.7 }]}
            onPress={handleApprove}
            disabled={approving}
          >
            {approving ? <ActivityIndicator color="#fff" /> : (
              <>
                <Feather name="check" size={16} color="#fff" />
                <Text style={styles.approveBtnText}>Approve as {selectedRole.charAt(0).toUpperCase() + selectedRole.slice(1)}</Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function ApprovalsScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = Platform.OS === "web" ? 24 : Math.max(insets.top + 20, 100);
  const request = useApiRequest();
  const qc = useQueryClient();
  const { isSuperAdmin } = useAuth();

  const [selectedUser, setSelectedUser] = useState<PendingUser | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  const { data: pending = [], isLoading, refetch } = useQuery<PendingUser[]>({
    queryKey: ["pending-users"],
    queryFn: () => request("/approvals/pending"),
    enabled: isSuperAdmin,
    refetchInterval: 30000,
    staleTime: 10000,
  });

  const handleReject = (user: PendingUser) => {
    Alert.alert(
      "Reject User",
      `Reject and remove ${user.name}? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reject", style: "destructive", onPress: async () => {
            setRejectingId(user.id);
            try {
              await request(`/approvals/${user.id}/reject`, { method: "DELETE" });
              qc.invalidateQueries({ queryKey: ["pending-users"] });
              qc.invalidateQueries({ queryKey: ["pending-count"] });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (e: any) {
              Alert.alert("Error", e.message || "Failed to reject");
            } finally {
              setRejectingId(null);
            }
          },
        },
      ],
    );
  };

  if (!isSuperAdmin) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background, justifyContent: "center", alignItems: "center" }]}>
        <Feather name="lock" size={48} color={theme.textTertiary} />
        <Text style={[styles.emptyText, { color: theme.textSecondary, marginTop: 12 }]}>Super Admin access only</Text>
      </View>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { paddingTop: 16, borderBottomColor: theme.border }]}>
        <Text style={[styles.title, { color: theme.text }]}>Pending Approvals</Text>
        {(pending as PendingUser[]).length > 0 && (
          <View style={[styles.badge, { backgroundColor: "#ef4444" }]}>
            <Text style={styles.badgeText}>{(pending as PendingUser[]).length}</Text>
          </View>
        )}
      </View>

      <FlatList
        data={pending as PendingUser[]}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: Platform.OS === "web" ? 80 : 90 }}
        refreshing={isLoading}
        onRefresh={refetch}
        renderItem={({ item }) => (
          <View style={[styles.userRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={[styles.userAvatar, { backgroundColor: "#f59e0b20" }]}>
              <Text style={[styles.userAvatarText, { color: "#f59e0b" }]}>{(item.name || "?")[0].toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.userName, { color: theme.text }]}>{item.name}</Text>
              <Text style={[styles.userEmail, { color: theme.textSecondary }]}>{item.email}</Text>
              {item.rollNumber && <Text style={[styles.userRoll, { color: theme.textTertiary }]}>{item.rollNumber}</Text>}
              <Text style={[styles.userDate, { color: theme.textTertiary }]}>
                Registered: {new Date(item.createdAt).toLocaleDateString("en-IN")}
              </Text>
            </View>
            <View style={{ gap: 8 }}>
              <Pressable
                onPress={() => { Haptics.selectionAsync(); setSelectedUser(item); }}
                style={[styles.actionBtn, { backgroundColor: "#22c55e15", borderColor: "#22c55e50" }]}
              >
                <Feather name="check" size={14} color="#22c55e" />
                <Text style={[styles.actionBtnText, { color: "#22c55e" }]}>Approve</Text>
              </Pressable>
              <Pressable
                onPress={() => handleReject(item)}
                style={[styles.actionBtn, { backgroundColor: "#ef444415", borderColor: "#ef444450" }]}
                disabled={rejectingId === item.id}
              >
                {rejectingId === item.id ? <ActivityIndicator size="small" color="#ef4444" /> : (
                  <>
                    <Feather name="x" size={14} color="#ef4444" />
                    <Text style={[styles.actionBtnText, { color: "#ef4444" }]}>Reject</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        )}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={() => isLoading ? (
          <View style={{ paddingVertical: 60, alignItems: "center" }}>
            <ActivityIndicator color={theme.tint} size="large" />
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Feather name="check-circle" size={48} color="#22c55e" />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>All Caught Up!</Text>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No pending registrations</Text>
          </View>
        )}
      />

      <ApproveModal
        user={selectedUser}
        visible={!!selectedUser}
        onClose={() => setSelectedUser(null)}
        theme={theme}
        request={request}
        qc={qc}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, paddingBottom: 20, borderBottomWidth: 1 },
  title: { fontSize: 26, fontFamily: "Inter_700Bold", flex: 1 },
  badge: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  badgeText: { color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold" },
  userRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  userAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  userAvatarText: { fontSize: 18, fontFamily: "Inter_700Bold" },
  userName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  userEmail: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  userRoll: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  userDate: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 4 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  actionBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  emptyState: { alignItems: "center", justifyContent: "center", paddingVertical: 80, gap: 10 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  // Modal
  modalContainer: { flex: 1 },
  dragHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#94a3b830", alignSelf: "center", marginTop: 12, marginBottom: 4 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
  modalTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  userCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 20 },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginBottom: 10 },
  roleRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
  roleChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  roleChipText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  hostelChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  hostelChipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  approveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 15, borderRadius: 12, marginTop: 8 },
  approveBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
