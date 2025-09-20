import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";

export default function EventDetailsPage({ route, navigation }) {
  const { event } = route.params; // 👈 passed from DiscoverPage

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{event.title}</Text>

      <View style={styles.section}>
        <Text style={styles.label}>Distance:</Text>
        <Text style={styles.value}>{event.distanceKm} km</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Duration:</Text>
        <Text style={styles.value}>{event.durationHrs} hrs</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Steps:</Text>
        <Text style={styles.value}>{event.steps}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Elevation:</Text>
        <Text style={styles.value}>{event.elevationM} m</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Organizer:</Text>
        <Text style={styles.value}>{event.organizer?.name || "Unknown"}</Text>
      </View>

      {/* Book Now Button */}
      <TouchableOpacity
        style={styles.bookButton}
        onPress={() => navigation.navigate("BookingPage", { event })}

      >
        <Text style={styles.bookText}>Book Now</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: "#fff",
    flexGrow: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#2E7D32",
    marginBottom: 20,
  },
  section: {
    flexDirection: "row",
    marginBottom: 10,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: "#444",
    width: 100,
  },
  value: {
    fontSize: 16,
    color: "#666",
  },
  bookButton: {
    marginTop: 30,
    backgroundColor: "#2E7D32",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
  },
  bookText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
