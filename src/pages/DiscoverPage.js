// src/pages/DiscoverPage.js
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback } from "react";
import { get } from "../lib/api";

export default function DiscoverPage() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigation = useNavigation();

  useEffect(() => {
    async function fetchEvents() {
      try {
        const data = await get("/api/events"); // ✅ your backend API
        setEvents(data);
      } catch (err) {
        console.error("❌ Failed to fetch events:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchEvents();
  }, []);

  useFocusEffect(
  useCallback(() => {
    async function fetchEvents() {
      try {
        const data = await get("/api/events");
        setEvents(data);
      } catch (err) {
        console.error("❌ Failed to fetch events:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchEvents();
  }, [])
);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2E7D32" />
      </View>
    );
  }

  if (!events.length) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>No events yet. Check back later!</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={events}
      keyExtractor={(item) => item.id.toString()}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate("EventDetails", { event: item })}
        >
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.meta}>
            Distance: {item.distanceKm} km • Duration: {item.durationHrs} hrs
          </Text>
          <Text style={styles.meta}>
            Steps: {item.steps} • Elevation: {item.elevationM} m
          </Text>
          <Text style={styles.organizer}>
            By: {item.organizer?.name || "Unknown"}
          </Text>
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  empty: { fontSize: 16, color: "#666" },
  card: {
    backgroundColor: "#fff",
    padding: 16,
    margin: 10,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
  title: { fontSize: 18, fontWeight: "bold", color: "#2E7D32" },
  meta: { fontSize: 14, color: "#555", marginTop: 4 },
  organizer: { fontSize: 12, color: "#888", marginTop: 6 },
});
