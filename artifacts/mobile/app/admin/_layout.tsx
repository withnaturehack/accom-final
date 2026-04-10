import { Stack } from "expo-router";
import React from "react";
import { useColorScheme } from "react-native";
import Colors from "@/constants/colors";

export default function AdminLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = isDark ? Colors.dark : Colors.light;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.background },
        animation: "slide_from_right",
      }}
    />
  );
}
