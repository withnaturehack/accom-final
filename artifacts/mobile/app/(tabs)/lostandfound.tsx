import React, { useState, useCallback, useEffect } from "react";
import {
  View, Text, FlatList, StyleSheet, Pressable, RefreshControl,
  Platform, useColorScheme, ActivityIndicator, TextInput,
  Modal, ScrollView, Alert,
} from "react-native";
import { useSafeAreaInsets, SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useAuth, useApiRequest } from "@/context/AuthContext";
import { CardSkeleton } from "@/components/ui/LoadingSkeleton";

const PAGE_SIZE = 50;

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Student {
  id: string;
  name: string;
  email: string;
  rollNumber?: string;
  roomNumber?: string;
  assignedMess?: string;
  allottedMess?: string;
  hostelId?: string;
  hostelName?: string;
  attendanceStatus?: string;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  inventory?: {
    mattress: boolean;
    bedsheet: boolean;
    pillow: boolean;
    mattressSubmitted: boolean;
    bedsheetSubmitted: boolean;
    pillowSubmitted: boolean;
    inventoryLocked: boolean;
  };
}

function formatListTime(ts?: string | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour12: true,
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface CheckinState {
  checkin: {
    id: string;
    checkInTime: string;
    checkOutTime: string | null;
  } | null;
  inventory: {
    mattress: boolean;
    bedsheet: boolean;
    pillow: boolean;
    mattressSubmitted: boolean;
    bedsheetSubmitted: boolean;
    pillowSubmitted: boolean;
    inventoryLocked: boolean;
  };
}

// ─── Step Button ────────────────────────────────────────────────────────────────

function StepButton({
  label, icon, done, disabled, danger, onPress, loading, theme,
}: {
  label: string; icon: string; done?: boolean; disabled?: boolean; danger?: boolean;
  onPress: () => void; loading?: boolean; theme: any;
}) {
  const bg = done ? "#22c55e" : danger ? "#ef4444" : disabled ? theme.surface : theme.tint;
  const textColor = disabled ? theme.textTertiary : "#fff";
  return (
    <Pressable
      onPress={() => { if (!disabled && !loading) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); } }}
      style={[
        styles.stepBtn,
        { backgroundColor: bg, borderColor: done ? "#16a34a" : disabled ? theme.border : "transparent", opacity: disabled ? 0.55 : 1 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color="#fff" size="small" />
      ) : (
        <>
          <Feather name={(done ? "check-circle" : icon) as any} size={14} color={done ? "#fff" : textColor} />
          <Text style={[styles.stepBtnText, { color: done ? "#fff" : textColor }]}>{done ? "✓ " + label : label}</Text>
        </>
      )}
    </Pressable>
  );
}

// ─── Attendance Detail Modal ────────────────────────────────────────────────────

function AttendanceModal({
  student, visible, onClose, theme, request, onDataChanged,
}: {
  student: Student | null;
  visible: boolean;
  onClose: () => void;
  theme: any;
  request: any;
  onDataChanged: (studentId: string, patch: Partial<Student>) => void;
}) {
  const modalInsets = useSafeAreaInsets();
  const [state, setState] = useState<CheckinState | null>(null);
  const [loadingState, setLoadingState] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadState = useCallback(async (opts?: { silent?: boolean }) => {
    if (!student) return;
    if (!opts?.silent) setLoadingState(true);
    try {
      const data = await request(`/checkins/${student.id}/today`);
      setState(data);
      return data;
    } catch {
      setState(null);
      return null;
    } finally {
      if (!opts?.silent) setLoadingState(false);
    }
  }, [student, request]);

  useEffect(() => {
    if (visible && student) loadState();
  }, [visible, student]);

  useEffect(() => {
    if (!visible || !student) return;
    const timer = setInterval(() => {
      loadState({ silent: true });
    }, 3000);
    return () => clearInterval(timer);
  }, [visible, student, loadState]);

  if (!student) return null;

  const checkin = state?.checkin ?? null;
  const inv = state?.inventory ?? { mattress: false, bedsheet: false, pillow: false, mattressSubmitted: false, bedsheetSubmitted: false, pillowSubmitted: false, inventoryLocked: false };
  const isCheckedIn = !!checkin && !checkin.checkOutTime;
  const isCheckedOut = !!checkin?.checkOutTime;
  const hasAttendanceSession = isCheckedIn || isCheckedOut;

  async function doAction(action: string, fn: () => Promise<any>) {
    if (!student) return;
    setActionLoading(action);
    try {
      await fn();
      const next = await loadState({ silent: true });
      const nextCheckin = next?.checkin ?? null;
      onDataChanged(student.id, {
        attendanceStatus: nextCheckin && !nextCheckin.checkOutTime ? "entered" : nextCheckin?.checkOutTime ? "exited" : "not_entered",
        checkInTime: nextCheckin?.checkInTime ?? null,
        checkOutTime: nextCheckin?.checkOutTime ?? null,
        inventory: next?.inventory ?? undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Action failed");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setActionLoading(null);
    }
  }

  const checkIn = () => doAction("checkin", () => request(`/checkins/${student.id}`, { method: "POST", body: JSON.stringify({}) }));

  const giveItem = (item: "mattress" | "bedsheet" | "pillow", val: boolean) =>
    doAction(`give-${item}`, () => request(`/inventory-simple/${student.id}`, {
      method: "PATCH",
      body: JSON.stringify({ [item]: val }),
    }));

  const submitItem = (item: "mattress" | "bedsheet" | "pillow", val: boolean) =>
    doAction(`submit-${item}`, () => request(`/inventory-simple/${student.id}/submit`, {
      method: "POST",
      body: JSON.stringify({ [item]: val }),
    }));

  const checkOut = () => {
    if (!checkin) return;
    doAction("checkout", () => request(`/checkins/${checkin.id}/checkout`, { method: "PATCH", body: JSON.stringify({}) }));
  };

  const confirmAsync = (title: string, msg: string): Promise<boolean> => {
    if (Platform.OS === "web") {
      // eslint-disable-next-line no-alert
      return Promise.resolve(typeof window !== "undefined" && window.confirm(`${title}\n\n${msg}`));
    }
    return new Promise((resolve) => {
      Alert.alert(title, msg, [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: "Revoke", style: "destructive", onPress: () => resolve(true) },
      ]);
    });
  };

  const revokeCheckin = async () => {
    if (!student) return;
    const ok = await confirmAsync(
      "Revoke Attendance?",
      "This will clear today's check-in/check-out and reset inventory for this student. Are you sure?",
    );
    if (!ok) return;
    doAction("revoke-checkin", () => request(`/checkins/${student.id}/today`, { method: "DELETE" }));
  };

  const revokeCheckout = async () => {
    if (!checkin) return;
    const ok = await confirmAsync(
      "Revoke Checkout?",
      "This will undo the checkout and mark the student as still checked in.",
    );
    if (!ok) return;
    doAction("revoke-checkout", () => request(`/checkins/${checkin.id}/revoke-checkout`, { method: "PATCH", body: JSON.stringify({}) }));
  };

  const revokeItem = async (item: "mattress" | "bedsheet" | "pillow") => {
    if (!student) return;
    const ok = await confirmAsync(
      `Revoke ${item.charAt(0).toUpperCase() + item.slice(1)}?`,
      `Mark ${item} as not given/submitted for this student.`,
    );
    if (!ok) return;
    doAction(`revoke-${item}`, () => request(`/attendance/inventory/${student.id}/revoke-item`, {
      method: "POST",
      body: JSON.stringify({ item }),
    }));
  };

  const revokeAllInventory = async () => {
    if (!student) return;
    const ok = await confirmAsync(
      "Reset All Inventory?",
      "This will unlock and clear every inventory item for this student today.",
    );
    if (!ok) return;
    doAction("revoke-all", () => request(`/attendance/inventory/${student.id}/revoke`, {
      method: "POST",
      body: JSON.stringify({}),
    }));
  };

  const showRevokeCard = hasAttendanceSession;

  function formatTime(ts: string | null): string {
    if (!ts) return "—";
    return new Date(ts).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: true, hour: "2-digit", minute: "2-digit" });
  }

  // Step states
  const canGiveInventory = isCheckedIn && !isCheckedOut;
  const canSubmitMattress = canGiveInventory && inv.mattress && !inv.mattressSubmitted;
  const canSubmitBedsheet = canGiveInventory && inv.bedsheet && !inv.bedsheetSubmitted;
  const canSubmitPillow = canGiveInventory && inv.pillow && !inv.pillowSubmitted;
  const noItemsGiven = !inv.mattress && !inv.bedsheet && !inv.pillow;
  const hasPendingGivenItems =
    (inv.mattress && !inv.mattressSubmitted) ||
    (inv.bedsheet && !inv.bedsheetSubmitted) ||
    (inv.pillow && !inv.pillowSubmitted);
  const canCheckOut = isCheckedIn;

  const itemStatus = (item: "mattress" | "bedsheet" | "pillow") => {
    const submitKey = `${item}Submitted` as "mattressSubmitted" | "bedsheetSubmitted" | "pillowSubmitted";
    const given = !!inv[item];
    const submitted = !!inv[submitKey];

    if (!hasAttendanceSession) {
      return { label: "Not Available", color: "#64748b", bg: "#64748b15", border: "#64748b30" };
    }

    if (!given) {
      return { label: "Not Taken", color: "#64748b", bg: "#64748b15", border: "#64748b30" };
    }
    if (submitted) {
      return { label: "Submitted", color: "#22c55e", bg: "#22c55e20", border: "#22c55e40" };
    }
    if (isCheckedOut) {
      return { label: "Missing", color: "#ef4444", bg: "#ef444420", border: "#ef444440" };
    }
    return { label: "Pending", color: "#eab308", bg: "#eab30820", border: "#eab30840" };
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.modalContainer, { backgroundColor: theme.background }]}>
        {/* Drag handle */}
        <View style={styles.dragHandle} />
        {/* Header */}
        <View style={[styles.modalHeader, { borderBottomColor: theme.border, paddingTop: Math.max(modalInsets.top + 16, 56) }]}>
          <View style={[styles.modalAvatar, { backgroundColor: theme.tint + "20" }]}>
            <Text style={[styles.modalAvatarText, { color: theme.tint }]}>{(student.name || "?")[0].toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.modalName, { color: theme.text }]}>{student.name}</Text>
            <Text style={[styles.modalSub, { color: theme.textSecondary }]}>
              {student.rollNumber || student.email}
              {student.roomNumber ? ` · Room ${student.roomNumber}` : ""}
            </Text>
            <Text style={[styles.modalSub, { color: theme.textTertiary }]}>Mess: {student.assignedMess || student.allottedMess || "—"}</Text>
          </View>
          <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={12}>
            <Feather name="x" size={22} color={theme.textSecondary} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: Math.max(modalInsets.bottom + 32, 64) }} showsVerticalScrollIndicator={false}>
          {loadingState ? (
            <View style={{ paddingVertical: 40, alignItems: "center" }}>
              <ActivityIndicator color={theme.tint} size="large" />
              <Text style={[{ color: theme.textSecondary, marginTop: 12, fontFamily: "Inter_400Regular", fontSize: 14 }]}>Loading status...</Text>
            </View>
          ) : (
            <>
              {/* Status Overview */}
              <View style={[styles.statusCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={styles.statusRow}>
                  <View style={[styles.statusDot, { backgroundColor: isCheckedOut ? "#6366f1" : isCheckedIn ? "#22c55e" : "#f59e0b" }]} />
                  <Text style={[styles.statusText, { color: theme.text }]}>
                    {isCheckedOut ? "Checked Out" : isCheckedIn ? "Checked In" : "Not Checked In Yet"}
                  </Text>
                  {checkin?.checkInTime && (
                    <Text style={[styles.statusTime, { color: theme.textSecondary }]}>In: {formatTime(checkin.checkInTime)}</Text>
                  )}
                  {checkin?.checkOutTime && (
                    <Text style={[styles.statusTime, { color: theme.textSecondary }]}>Out: {formatTime(checkin.checkOutTime)}</Text>
                  )}
                </View>
              </View>

              {/* STEP 1: Check In / Revoke */}
              <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>STEP 1 — CHECK IN</Text>
              <View style={styles.stepRow}>
                {!!checkin ? (
                  <Pressable
                    onPress={revokeCheckin}
                    disabled={!!actionLoading}
                    style={[styles.stepBtn, { backgroundColor: "#22c55e", borderColor: "#16a34a", opacity: actionLoading ? 0.6 : 1, flex: 1 }]}
                  >
                    {actionLoading === "revoke-checkin" ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <Feather name="check-circle" size={14} color="#fff" />
                        <Text style={[styles.stepBtnText, { color: "#fff" }]}>✓ Checked In · Tap to Revoke</Text>
                      </>
                    )}
                  </Pressable>
                ) : (
                  <StepButton
                    label="Check In"
                    icon="log-in"
                    done={false}
                    disabled={false}
                    onPress={checkIn}
                    loading={actionLoading === "checkin"}
                    theme={theme}
                  />
                )}
              </View>

              {/* STEP 2–4: Give Inventory */}
              <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>STEPS 2-4 — GIVE INVENTORY</Text>
              <Text style={[styles.sectionHint, { color: theme.textTertiary }]}>
                {!checkin ? "Check in the student first" : isCheckedOut ? "Student has checked out" : "Tap to give each item"}
              </Text>
              <View style={styles.stepRow}>
                {(["mattress", "bedsheet", "pillow"] as const).map(item => (
                  <StepButton
                    key={`give-${item}`}
                    label={item.charAt(0).toUpperCase() + item.slice(1)}
                    icon={inv[item] ? "check-square" : "square"}
                    done={canGiveInventory && inv[item]}
                    disabled={!canGiveInventory}
                    onPress={() => giveItem(item, !inv[item])}
                    loading={actionLoading === `give-${item}`}
                    theme={theme}
                  />
                ))}
              </View>

              <View style={styles.statusLegendRow}>
                {(["mattress", "bedsheet", "pillow"] as const).map(item => {
                  const status = itemStatus(item);
                  return (
                    <View key={`legend-${item}`} style={[styles.statusLegendChip, { backgroundColor: status.bg, borderColor: status.border }]}>
                      <Text style={[styles.statusLegendTitle, { color: theme.text }]}>{item.charAt(0).toUpperCase() + item.slice(1)}</Text>
                      <Text style={[styles.statusLegendValue, { color: status.color }]}>{status.label}</Text>
                    </View>
                  );
                })}
              </View>

              {/* STEP 5–7: Submit Inventory */}
              <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>STEPS 5-7 — SUBMIT INVENTORY</Text>
              <Text style={[styles.sectionHint, { color: theme.textTertiary }]}>
                {!checkin ? "Check in first" : isCheckedOut ? "Student has checked out" : "Submit items that were given and returned"}
              </Text>
              <View style={styles.stepRow}>
                {(["mattress", "bedsheet", "pillow"] as const).map(item => {
                  const submitKey = `${item}Submitted` as "mattressSubmitted" | "bedsheetSubmitted" | "pillowSubmitted";
                  const isGiven = inv[item];
                  const isSubmitted = inv[submitKey];
                  return (
                    <StepButton
                      key={`submit-${item}`}
                      label={item.charAt(0).toUpperCase() + item.slice(1)}
                      icon={isSubmitted ? "check-circle" : "upload"}
                      done={canGiveInventory && isSubmitted}
                      disabled={!isGiven || isSubmitted || !canGiveInventory}
                      onPress={() => submitItem(item, true)}
                      loading={actionLoading === `submit-${item}`}
                      theme={theme}
                    />
                  );
                })}
              </View>
              {!inv.mattress && !inv.bedsheet && !inv.pillow && isCheckedIn && (
                <View style={[styles.hintBox, { backgroundColor: "#f59e0b10", borderColor: "#f59e0b30" }]}>
                  <Feather name="info" size={13} color="#f59e0b" />
                  <Text style={[styles.hintText, { color: theme.textSecondary }]}>No items given yet. Give items above to enable submission.</Text>
                </View>
              )}
              {inv.mattress && inv.bedsheet && inv.pillow && !inv.inventoryLocked && isCheckedIn && (
                <View style={[styles.hintBox, { backgroundColor: "#3b82f610", borderColor: "#3b82f630" }]}>
                  <Feather name="info" size={13} color="#3b82f6" />
                  <Text style={[styles.hintText, { color: theme.textSecondary }]}>Submit all given items to enable checkout.</Text>
                </View>
              )}
              {hasAttendanceSession && inv.inventoryLocked && (
                <View style={[styles.hintBox, { backgroundColor: "#22c55e10", borderColor: "#22c55e30" }]}>
                  <Feather name="check-circle" size={13} color="#22c55e" />
                  <Text style={[styles.hintText, { color: "#22c55e" }]}>All inventory submitted. Ready for checkout.</Text>
                </View>
              )}

              {/* STEP 8: Check Out */}
              <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>STEP 8 — CHECK OUT</Text>
              <View style={styles.stepRow}>
                {isCheckedOut ? (
                  <Pressable
                    onPress={revokeCheckout}
                    disabled={!!actionLoading}
                    style={({ pressed }) => [
                      styles.stepBtn,
                      { backgroundColor: pressed ? "#16a34a" : "#22c55e", borderColor: "#16a34a", flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, opacity: actionLoading ? 0.6 : 1 },
                    ]}
                  >
                    {actionLoading === "revoke-checkout" ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <View style={{ alignItems: "center" }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Feather name="check-circle" size={14} color="#fff" />
                          <Text style={[styles.stepBtnText, { color: "#fff" }]}>✓ Checked Out · Tap to Revoke</Text>
                        </View>
                        {checkin?.checkOutTime && (
                          <Text style={{ color: "#d1fae5", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 }}>
                            at {formatTime(checkin.checkOutTime)}
                          </Text>
                        )}
                      </View>
                    )}
                  </Pressable>
                ) : (
                  <StepButton
                    label="Check Out"
                    icon="log-out"
                    done={false}
                    disabled={!canCheckOut}
                    onPress={checkOut}
                    loading={actionLoading === "checkout"}
                    theme={theme}
                  />
                )}
              </View>
              {isCheckedIn && hasPendingGivenItems && !isCheckedOut && (
                <Text style={[styles.sectionHint, { color: "#ef4444" }]}>Given but not submitted inventory is marked in red.</Text>
              )}
              {isCheckedIn && noItemsGiven && !isCheckedOut && (
                <Text style={[styles.sectionHint, { color: theme.textTertiary }]}>No inventory taken — checkout is enabled.</Text>
              )}

              {/* ── Revoke Actions (volunteer / admin / super admin) ───── */}
              {showRevokeCard && (
                <>
                  <View style={[styles.revokeCard, { backgroundColor: theme.surface, borderColor: "#ef444433" }]}>
                    <View style={styles.revokeHeader}>
                      <View style={styles.revokeIconCircle}>
                        <Feather name="rotate-ccw" size={14} color="#ef4444" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.revokeCardTitle, { color: theme.text }]}>Inventory Revoke</Text>
                        <Text style={[styles.revokeCardHint, { color: theme.textSecondary }]}>
                          Undo or unlock inventory items for this student.
                        </Text>
                      </View>
                      {actionLoading?.startsWith("revoke") && <ActivityIndicator size="small" color="#ef4444" />}
                    </View>

                    <View style={styles.revokeBtnGroup}>
                      {(["mattress", "bedsheet", "pillow"] as const).map((item) => {
                        const submitKey = `${item}Submitted` as "mattressSubmitted" | "bedsheetSubmitted" | "pillowSubmitted";
                        const taken = !!inv[item] || !!inv[submitKey];
                        if (!taken) return null;
                        return (
                          <Pressable
                            key={`revoke-${item}`}
                            disabled={!!actionLoading}
                            onPress={() => revokeItem(item)}
                            style={({ pressed }) => [styles.revokeBtnRow, {
                              backgroundColor: pressed && !actionLoading ? "#fee2e2" : "#fef2f2",
                              borderColor: "#ef444422",
                              opacity: actionLoading ? 0.6 : 1,
                            }]}
                          >
                            <View style={[styles.revokeBtnIcon, { backgroundColor: "#ef444412" }]}>
                              <Feather name="x" size={15} color="#ef4444" />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.revokeBtnTitle}>Revoke {item.charAt(0).toUpperCase() + item.slice(1)}</Text>
                              <Text style={[styles.revokeBtnSub, { color: theme.textSecondary }]}>
                                Mark as not given/submitted
                              </Text>
                            </View>
                            {actionLoading === `revoke-${item}`
                              ? <ActivityIndicator size="small" color="#ef4444" />
                              : <Feather name="chevron-right" size={16} color="#ef4444" />}
                          </Pressable>
                        );
                      })}

                      {(inv.mattress || inv.bedsheet || inv.pillow || inv.inventoryLocked) && (
                        <Pressable
                          disabled={!!actionLoading}
                          onPress={revokeAllInventory}
                          style={({ pressed }) => [styles.revokeBtnRow, {
                            backgroundColor: pressed && !actionLoading ? "#fff7ed" : "#fffbeb",
                            borderColor: "#f59e0b33",
                            opacity: actionLoading ? 0.6 : 1,
                          }]}
                        >
                          <View style={[styles.revokeBtnIcon, { backgroundColor: "#f59e0b18" }]}>
                            <Feather name="unlock" size={15} color="#f59e0b" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.revokeBtnTitle, { color: "#92400e" }]}>Unlock & Reset Inventory</Text>
                            <Text style={[styles.revokeBtnSub, { color: theme.textSecondary }]}>
                              Clears all submissions for this student
                            </Text>
                          </View>
                          {actionLoading === "revoke-all"
                            ? <ActivityIndicator size="small" color="#f59e0b" />
                            : <Feather name="chevron-right" size={16} color="#f59e0b" />}
                        </Pressable>
                      )}
                    </View>
                  </View>
                </>
              )}

            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Student Row ────────────────────────────────────────────────────────────────

const StudentRow = React.memo(function StudentRow({ item, theme, onPress }: { item: any; theme: any; onPress: () => void }) {
  const hasCheckedIn = !!item.checkInTime;
  const hasCheckedOut = !!item.checkOutTime;
  const isCurrentlyIn = hasCheckedIn && !hasCheckedOut;
  const inv = item.inventory || {};
  const hasMissingInventory = hasCheckedOut && (
    (inv.mattress && !inv.mattressSubmitted) ||
    (inv.bedsheet && !inv.bedsheetSubmitted) ||
    (inv.pillow && !inv.pillowSubmitted)
  );

  const attColor = hasMissingInventory ? "#ef4444" : isCurrentlyIn ? "#22c55e" : hasCheckedOut ? "#6366f1" : "#f59e0b";
  const statusLabel = hasMissingInventory ? "Inv. Missing" : isCurrentlyIn ? "In Campus" : hasCheckedOut ? "Checked Out" : "Pending";

  const checkInLabel = hasCheckedIn ? `In ${formatListTime(item.checkInTime)}` : "";
  const checkOutLabel = hasCheckedOut ? `Out ${formatListTime(item.checkOutTime)}` : "";
  const timeMeta = hasCheckedIn
    ? (checkOutLabel ? `${checkInLabel} · ${checkOutLabel}` : checkInLabel)
    : "Waiting to arrive";

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.studentRow, { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.82 : 1 }]}
    >
      <View style={[styles.avatar, { backgroundColor: theme.tint + "18" }]}>
        <Text style={[styles.avatarText, { color: theme.tint }]}>{(item.name || "?").charAt(0).toUpperCase()}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.studentName, { color: theme.text }]} numberOfLines={1}>{item.name}</Text>
        <Text style={[styles.studentMeta, { color: theme.textSecondary }]} numberOfLines={1}>
          {item.rollNumber || item.email}
          {item.roomNumber ? ` · Room ${item.roomNumber}` : ""}
        </Text>
        <Text style={[styles.studentMeta, { color: theme.textTertiary }]} numberOfLines={1}>
          Mess: {item.assignedMess || item.allottedMess || "—"}
        </Text>
        <Text style={[styles.timeMeta, { color: theme.textTertiary }]} numberOfLines={1}>{timeMeta}</Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 4 }}>
        <View style={[styles.attBadge, { backgroundColor: attColor + "18" }]}>
          <View style={[styles.attDot, { backgroundColor: attColor }]} />
          <Text style={[styles.attLabel, { color: attColor }]} numberOfLines={1}>{statusLabel}</Text>
        </View>
        <Feather name="chevron-right" size={14} color={theme.textTertiary} />
      </View>
    </Pressable>
  );
});

// ─── Student Self View ─────────────────────────────────────────────────────────

function StudentSelfView({ theme, user, request }: { theme: any; user: any; request: any }) {
  const [state, setState] = useState<CheckinState | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await request(`/checkins/${user.id}/today`);
      setState(data);
    } catch { }
    setLoading(false);
  }, [user, request]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const timer = setInterval(() => { load(); }, 5000);
    return () => clearInterval(timer);
  }, [load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const checkin = state?.checkin;
  const inv = state?.inventory;
  const isIn = !!checkin && !checkin?.checkOutTime;
  const isOut = !!checkin?.checkOutTime;
  const hasAttendanceSession = isIn || isOut;

  const items = [
    { key: "mattress", given: inv?.mattress, submitted: inv?.mattressSubmitted },
    { key: "bedsheet", given: inv?.bedsheet, submitted: inv?.bedsheetSubmitted },
    { key: "pillow", given: inv?.pillow, submitted: inv?.pillowSubmitted },
  ];

  return (
    <SafeAreaView edges={["top"]} style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.pageHeader, { paddingTop: 16, borderBottomColor: theme.border }]}>
        <Text style={[styles.pageTitle, { color: theme.text }]}>Attendance</Text>
        <Text style={[styles.pageSubtitle, { color: theme.textSecondary }]}>Today's status</Text>
      </View>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: Platform.OS === "web" ? 80 : 90 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.tint} />}
      >
        {loading ? (
          <CardSkeleton />
        ) : (
          <>
            {/* Status card */}
            <View style={[styles.selfStatusCard, { backgroundColor: isOut ? "#6366f115" : isIn ? "#22c55e15" : theme.surface, borderColor: isOut ? "#6366f140" : isIn ? "#22c55e40" : theme.border }]}>
              <Feather name={isOut ? "log-out" : isIn ? "log-in" : "clock"} size={28} color={isOut ? "#6366f1" : isIn ? "#22c55e" : "#f59e0b"} />
              <Text style={[styles.selfStatusText, { color: isOut ? "#6366f1" : isIn ? "#22c55e" : "#f59e0b" }]}>
                {isOut ? "Checked Out" : isIn ? "Checked In" : "Not Checked In Yet"}
              </Text>
              {checkin?.checkInTime && (
                <Text style={[styles.selfStatusSub, { color: theme.textSecondary }]}>
                  In: {new Date(checkin.checkInTime).toLocaleTimeString("en-IN", { hour12: true, hour: "2-digit", minute: "2-digit" })}
                  {checkin.checkOutTime ? ` · Out: ${new Date(checkin.checkOutTime).toLocaleTimeString("en-IN", { hour12: true, hour: "2-digit", minute: "2-digit" })}` : ""}
                </Text>
              )}
            </View>

            {/* Inventory */}
            <Text style={[styles.selfSection, { color: theme.text }]}>My Inventory</Text>
            <View style={styles.invRow}>
              {items.map(({ key, given, submitted }) => (
                (() => {
                  const activeGiven = hasAttendanceSession && !!given;
                  const activeSubmitted = hasAttendanceSession && !!submitted;
                  return (
                <View key={key} style={[styles.invCard, {
                  backgroundColor: activeSubmitted ? "#22c55e15" : activeGiven ? theme.tint + "15" : theme.surface,
                  borderColor: activeSubmitted ? "#22c55e40" : activeGiven ? theme.tint + "40" : theme.border,
                }]}>
                  <Feather
                    name={activeSubmitted ? "check-circle" : activeGiven ? "package" : "circle"}
                    size={22}
                    color={activeSubmitted ? "#22c55e" : activeGiven ? theme.tint : theme.textTertiary}
                  />
                  <Text style={[styles.invCardLabel, { color: activeSubmitted ? "#22c55e" : activeGiven ? theme.tint : theme.textSecondary }]}> 
                    {key.charAt(0).toUpperCase() + key.slice(1)}
                  </Text>
                  <Text style={[styles.invCardStatus, { color: activeSubmitted ? "#22c55e" : activeGiven ? theme.tint : theme.textTertiary }]}> 
                    {activeSubmitted ? "Returned" : activeGiven ? "Given" : "—"}
                  </Text>
                </View>
                  );
                })()
              ))}
            </View>
            {!isIn && !isOut && (
              <View style={[styles.hintBox, { backgroundColor: theme.surface, borderColor: theme.border, marginTop: 12 }]}>
                <Feather name="info" size={13} color={theme.textTertiary} />
                <Text style={[styles.hintText, { color: theme.textSecondary }]}>Your volunteer will check you in when you arrive at the hostel.</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Main Screen ────────────────────────────────────────────────────────────────

export default function AttendanceTab() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = Platform.OS === "web" ? 24 : Math.max(insets.top + 20, 100);

  const { user, isStudent, isCoordinator, isSuperAdmin, isVolunteer } = useAuth();
  const request = useApiRequest();
  const qc = useQueryClient();
  const isFocused = useIsFocused();

  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchNonce, setSearchNonce] = useState(0);
  const [page, setPage] = useState(0);
  const [allStudents, setAllStudents] = useState<any[]>(() => qc.getQueryData<any[]>(["students-att-cache"]) || []);
  const [hasMore, setHasMore] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(() => !(qc.getQueryData<any[]>(["students-att-cache"])?.length));
  const [activating, setActivating] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const hasSearchQuery = searchQuery.trim().length > 0;
  const requiresShift = user?.role === "volunteer" || user?.role === "admin" || user?.role === "coordinator";

  const fetchStudentsRef = React.useRef<((reset?: boolean, silent?: boolean) => void) | null>(null);

  useFocusEffect(
    useCallback(() => {
      qc.invalidateQueries({ queryKey: ["my-status"] });
      fetchStudentsRef.current?.(true, true);
    }, [qc])
  );

  const { data: myStatus, refetch: refetchStatus } = useQuery<{ isActive: boolean; lastActiveAt: string | null }>({
    queryKey: ["my-status"],
    queryFn: () => request("/staff/me-status"),
    enabled: requiresShift && isFocused,
    refetchInterval: isFocused ? 20000 : false,
    staleTime: 8000,
  });
  const canWork = !requiresShift || !!myStatus?.isActive;

  const fetchStudents = useCallback(async (reset = false, silent = false) => {
    if (isStudent) return;
    if (!canWork) { setHasMore(false); return; }
    if (!searchQuery.trim()) {
      setAllStudents([]);
      setHasMore(false);
      setPage(0);
      if (!silent) setLoading(false);
      return;
    }
    if (!hasMore && !reset) return;
    const offset = reset ? 0 : page * PAGE_SIZE;
    if (reset) { setHasMore(true); }
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      const data = await request(`/students?${params}`);
      const list: any[] = Array.isArray(data) ? data : (data.students || data.data || []);
      setAllStudents(prev => reset ? list : [...prev, ...list]);
      if (reset) qc.setQueryData(["students-att-cache"], list);
      setHasMore(list.length === PAGE_SIZE);
      if (!reset) setPage(p => p + 1);
      else setPage(1);
    } catch { }
    if (!silent) setLoading(false);
  }, [isStudent, request, searchQuery, searchNonce, page, hasMore, canWork, qc]);

  useEffect(() => { fetchStudentsRef.current = fetchStudents; }, [fetchStudents]);

  const onRefresh = useCallback(async () => {
    if (!searchQuery.trim()) { setRefreshing(false); return; }
    setRefreshing(true);
    await fetchStudents(true);
    setRefreshing(false);
  }, [fetchStudents, searchQuery]);

  const handleStudentDataChanged = useCallback((studentId: string, patch: Partial<Student>) => {
    setAllStudents(prev => prev.map(s => (s.id === studentId ? { ...s, ...patch } : s)));
  }, []);

  useEffect(() => {
    if (isStudent) return;
    if (!isFocused) return;
    if (!canWork) {
      setAllStudents([]);
      setHasMore(false);
      setPage(0);
      return;
    }
    fetchStudents(true);
  }, [isStudent, searchQuery, searchNonce, canWork, isFocused]);

  const submitSearch = useCallback(() => {
    setSearchQuery(searchInput.trim());
    setSearchNonce((n) => n + 1);
  }, [searchInput]);

  useEffect(() => {
    if (isStudent || !canWork || !isFocused) return;
    const timer = setInterval(() => {
      fetchStudents(true, true);
    }, 10000);
    return () => clearInterval(timer);
  }, [isStudent, fetchStudents, canWork, isFocused]);

  const goActive = async () => {
    setActivating(true);
    try {
      await request("/staff/go-active", { method: "POST", body: JSON.stringify({}) });
      await refetchStatus();
    } catch {
    } finally {
      setActivating(false);
    }
  };

  const goInactive = async () => {
    setDeactivating(true);
    try {
      await request("/staff/go-inactive", { method: "POST", body: JSON.stringify({}) });
      await refetchStatus();
    } catch {
    } finally {
      setDeactivating(false);
    }
  };

  if (isStudent) {
    return <StudentSelfView theme={theme} user={user} request={request} />;
  }

  return (
    <SafeAreaView edges={["top"]} style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.pageHeader, { paddingTop: 16, borderBottomColor: theme.border }]}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={[styles.pageTitle, { color: theme.text }]}>Attendance</Text>
          {allStudents.length > 0 && (
            <View style={[styles.countBadge, { backgroundColor: theme.tint + "15", borderColor: theme.tint + "40" }]}>
              <Text style={[styles.countText, { color: theme.tint }]}>{allStudents.length}</Text>
            </View>
          )}
        </View>
        <View style={[styles.searchBar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Feather name="search" size={15} color={theme.textSecondary} />
          <TextInput
            placeholder="Search by name, room, roll…"
            placeholderTextColor={theme.textTertiary}
            value={searchInput}
            onChangeText={setSearchInput}
            style={[styles.searchInput, { color: theme.text }]}
            clearButtonMode="while-editing"
            returnKeyType="search"
            onSubmitEditing={submitSearch}
          />
          {searchInput.length > 0 && (
            <Pressable onPress={() => { setSearchInput(""); setSearchQuery(""); setSearchNonce((n) => n + 1); }} hitSlop={8}>
              <Feather name="x-circle" size={15} color={theme.textSecondary} />
            </Pressable>
          )}
          <Pressable
            onPress={submitSearch}
            style={{ backgroundColor: theme.tint + "20", borderWidth: 1, borderColor: theme.tint + "55", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}
          >
            <Text style={{ color: theme.tint, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Search</Text>
          </Pressable>
        </View>
        {!hasSearchQuery && (
          <Text style={{ color: theme.textSecondary, fontSize: 12, fontFamily: "Inter_400Regular" }}>
            Enter name, roll or room and press Search.
          </Text>
        )}
      </View>

      <FlatList
        data={allStudents}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 14, paddingBottom: Platform.OS === "web" ? 72 : 90 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.tint} />}
        onEndReached={() => hasMore && !loading && fetchStudents()}
        onEndReachedThreshold={0.4}
        windowSize={7}
        maxToRenderPerBatch={15}
        initialNumToRender={15}
        removeClippedSubviews={true}
        renderItem={({ item }) => (
          <StudentRow
            item={item}
            theme={theme}
            onPress={() => { Haptics.selectionAsync(); setSelectedStudent(item); }}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListEmptyComponent={() => loading ? (
          <View style={{ padding: 20 }}>
            <CardSkeleton /><CardSkeleton /><CardSkeleton />
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Feather name="users" size={48} color={theme.textTertiary} />
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>{hasSearchQuery ? "No students found" : "Search to load students"}</Text>
          </View>
        )}
        ListFooterComponent={() => loading && allStudents.length > 0 ? (
          <ActivityIndicator color={theme.tint} style={{ marginVertical: 16 }} />
        ) : null}
      />

      <AttendanceModal
        student={selectedStudent}
        visible={!!selectedStudent && canWork}
        onClose={() => setSelectedStudent(null)}
        theme={theme}
        request={request}
        onDataChanged={handleStudentDataChanged}
      />

      {!canWork && (
        <View style={styles.lockOverlay}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? "rgba(0,0,0,0.8)" : "rgba(255,255,255,0.88)" }]} />
          <View style={[styles.lockCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Feather name="lock" size={20} color={theme.textSecondary} />
            <Text style={[styles.lockTitle, { color: theme.text }]}>Shift Inactive</Text>
            <Text style={[styles.lockSub, { color: theme.textSecondary }]}>Go to the Home tab to start your shift, then come back here.</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pageHeader: { paddingHorizontal: 20, paddingBottom: 20, borderBottomWidth: 1, gap: 16 },
  pageTitle: { fontSize: 26, fontFamily: "Inter_700Bold" },
  pageSubtitle: { fontSize: 13, fontFamily: "Inter_400Regular" },
  countBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  countText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  searchBar: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  shiftBanner: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8 },
  shiftDot: { width: 8, height: 8, borderRadius: 4 },
  shiftText: { flex: 1, fontSize: 12, fontFamily: "Inter_700Bold" },
  shiftBtnInline: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  shiftBtnInlineText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", paddingVertical: 0 },
  studentRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 12, borderWidth: 1 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 16, fontFamily: "Inter_700Bold" },
  studentName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  studentMeta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  timeMeta: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 3 },
  attBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, maxWidth: 118 },
  attDot: { width: 6, height: 6, borderRadius: 3 },
  attLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  emptyState: { alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular" },
  // Modal
  modalContainer: { flex: 1 },
  dragHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#94a3b830", alignSelf: "center", marginTop: 12, marginBottom: 4 },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
  modalAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  modalAvatarText: { fontSize: 18, fontFamily: "Inter_700Bold" },
  modalName: { fontSize: 17, fontFamily: "Inter_700Bold" },
  modalSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  closeBtn: { padding: 4 },
  statusCard: { padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 20 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 15, fontFamily: "Inter_700Bold", flex: 1 },
  statusTime: { fontSize: 12, fontFamily: "Inter_400Regular" },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.8, marginBottom: 8, marginTop: 4 },
  sectionHint: { fontSize: 11, fontFamily: "Inter_400Regular", marginBottom: 8, marginTop: -4 },
  stepRow: { flexDirection: "row", gap: 8, marginBottom: 16, flexWrap: "wrap" },
  stepBtn: { flex: 1, minWidth: 90, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 10, borderWidth: 1 },
  stepBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  statusLegendRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  statusLegendChip: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 8, alignItems: "center", gap: 2 },
  statusLegendTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  statusLegendValue: { fontSize: 11, fontFamily: "Inter_700Bold" },
  hintBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 10, borderRadius: 10, borderWidth: 1, marginBottom: 12 },
  hintText: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  // Revoke section
  revokeCard: { borderRadius: 14, borderWidth: 1, padding: 14, marginTop: 14, marginBottom: 14 },
  revokeHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  revokeIconCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#ef444430", alignItems: "center", justifyContent: "center" },
  revokeCardTitle: { fontSize: 14, fontFamily: "Inter_700Bold" },
  revokeCardHint: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  revokeBtnGroup: { gap: 8 },
  revokeBtnRow: { flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1 },
  revokeBtnIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  revokeBtnTitle: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#991b1b" },
  revokeBtnSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1, lineHeight: 14 },
  // Student self view
  selfStatusCard: { padding: 20, borderRadius: 14, borderWidth: 1, alignItems: "center", gap: 8, marginBottom: 20 },
  selfStatusText: { fontSize: 18, fontFamily: "Inter_700Bold" },
  selfStatusSub: { fontSize: 13, fontFamily: "Inter_400Regular" },
  selfSection: { fontSize: 17, fontFamily: "Inter_700Bold", marginBottom: 12 },
  invRow: { flexDirection: "row", gap: 10 },
  invCard: { flex: 1, alignItems: "center", padding: 14, borderRadius: 12, borderWidth: 1, gap: 6 },
  invCardLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  invCardStatus: { fontSize: 11, fontFamily: "Inter_400Regular" },
  lockOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", padding: 20 },
  lockCard: { borderWidth: 1, borderRadius: 14, padding: 16, alignItems: "center", gap: 8, width: "100%", maxWidth: 340 },
  lockTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  lockSub: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center" },
  lockBtn: { marginTop: 4, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  lockBtnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_700Bold" },
});
