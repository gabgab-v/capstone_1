// src/pages/event/EventBookingsPage.js
import React, { useEffect, useState } from "react";
import { View, Text, FlatList, ActivityIndicator, StyleSheet } from "react-native";
import { get } from "../../lib/api";

export default function EventBookingsPage({ route }) {
  const { eventId, title } = route.params;
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBookings = async () => {
      try {
        const data = await get(`/api/events/${eventId}/bookings`); // ✅ backend should return users who booked
        setBookings(data);
      } catch (err) {
        console.error("❌ Failed to fetch bookings:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchBookings();
  }, [eventId]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2E7D32" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Bookings for {title}</Text>

      {bookings.length === 0 ? (
        <Text style={styles.emptyText}>No users booked this event yet.</Text>
      ) : (
        <FlatList
          data={bookings}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.userName}>{item.user?.name || "Anonymous"}</Text>
              <Text>{item.user?.email}</Text>
              <Text>Paid: ₱ {Number(item.amount).toLocaleString()}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 15, backgroundColor: "#fff" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 20, fontWeight: "bold", marginBottom: 15 },
  emptyText: { color: "#999" },
  card: {
    padding: 12,
    marginBottom: 10,
    backgroundColor: "#f9f9f9",
    borderRadius: 8,
  },
  userName: { fontSize: 16, fontWeight: "600" },
});
