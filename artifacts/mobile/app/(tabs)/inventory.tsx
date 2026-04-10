import React from "react";
import { View, Text, StyleSheet, useColorScheme } from "react-native";
import InventoryTableScreen from "../admin/inventory-table";
import Colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";

export default function InventoryTabScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === "dark" ? Colors.dark : Colors.light;
  const { isStudent } = useAuth();

  if (isStudent) {
    return (
      <View style={[styles.blocked, { backgroundColor: theme.background }]}> 
        <Text style={[styles.title, { color: theme.text }]}>Inventory</Text>
        <Text style={[styles.sub, { color: theme.textSecondary }]}>Inventory is managed by staff.</Text>
      </View>
    );
  }

  return <InventoryTableScreen showBack={false} />;
}

const styles = StyleSheet.create({
  blocked: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  title: { fontSize: 20, fontFamily: "Inter_700Bold" },
  sub: { marginTop: 8, fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
});
