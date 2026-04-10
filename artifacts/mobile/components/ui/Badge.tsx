import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useColorScheme } from "react-native";
import Colors from "@/constants/colors";

type BadgeVariant = "blue" | "green" | "red" | "amber" | "purple" | "gray";

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
}

const variantColors: Record<BadgeVariant, { light: { bg: string; text: string }; dark: { bg: string; text: string } }> = {
  blue: { light: { bg: "#DBEAFE", text: "#1E40AF" }, dark: { bg: "#1E3A6E", text: "#93C5FD" } },
  green: { light: { bg: "#DCFCE7", text: "#15803D" }, dark: { bg: "#14532D", text: "#86EFAC" } },
  red: { light: { bg: "#FEE2E2", text: "#DC2626" }, dark: { bg: "#4C1D1D", text: "#FCA5A5" } },
  amber: { light: { bg: "#FEF9C3", text: "#A16207" }, dark: { bg: "#422006", text: "#FDE68A" } },
  purple: { light: { bg: "#F3E8FF", text: "#7E22CE" }, dark: { bg: "#3B0764", text: "#D8B4FE" } },
  gray: { light: { bg: "#F1F5F9", text: "#475569" }, dark: { bg: "#1E293B", text: "#94A3B8" } },
};

export function Badge({ label, variant = "blue" }: BadgeProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = variantColors[variant][isDark ? "dark" : "light"];

  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }]}>
      <Text style={[styles.text, { color: colors.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    alignSelf: "flex-start",
  },
  text: {
    fontSize: 11,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
});
