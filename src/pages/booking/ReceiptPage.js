import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";

export default function ReceiptPage({ route, navigation }) {
  const { event } = route.params;

  return (
    <View style={styles.container}>
      <Text style={styles.checkmark}>✅</Text>
      <Text style={styles.title}>Booking Complete</Text>
      <Text style={styles.subtitle}>Please wait for the organizer approval</Text>

      <View style={styles.summary}>
        <Text>Event: {event.title}</Text>
        <Text>Total Paid: ₱ {event.price.toLocaleString()}</Text>
      </View>

      <TouchableOpacity
        style={styles.okBtn}
        onPress={() => navigation.navigate("MainTabs")}
      >
        <Text style={{ color: "white" }}>Okay</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20 },
  checkmark: { fontSize: 60, marginBottom: 20 },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 10 },
  subtitle: { fontSize: 16, color: "gray", marginBottom: 20, textAlign: "center" },
  summary: { marginBottom: 30, alignItems: "center" },
  okBtn: {
    backgroundColor: "green",
    padding: 15,
    borderRadius: 8,
    width: "80%",
    alignItems: "center",
  },
});
