import React, { useEffect, useState } from "react";
import { View, Text, FlatList, ActivityIndicator, StyleSheet, TouchableOpacity } from "react-native";
import { get } from "../../lib/api";

// ✅ The 'user' prop is removed, as the component will fetch its own data.
export default function EventsPage({ navigation }) {
  const [user, setUser] = useState(null); // ✅ Add state to hold the user
  const [bookedEvents, setBookedEvents] = useState([]);
  const [createdEvents, setCreatedEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAllData = async () => {
      try {
        // ✅ 1. Fetch the current user first to determine their role.
        const currentUser = await get("/api/users/me");
        setUser(currentUser);

        // 2. Fetch the user's bookings.
        const booked = await get("/api/bookings");
        setBookedEvents(booked);

        // ✅ 3. Based on the fetched user's role, get the events they created.
        if (currentUser?.role === "ORGANIZER") {
          const created = await get("/api/events");
          setCreatedEvents(created);
        }
      } catch (err) {
        console.error("❌ Failed to fetch events page data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchAllData();
  }, []); // The empty array ensures this runs once when the component mounts.

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2E7D32" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Booked Events */}
      <Text style={styles.sectionTitle}>My Bookings</Text>
      {bookedEvents.length === 0 ? (
        <Text style={styles.emptyText}>You haven't booked any events yet.</Text>
      ) : (
        <FlatList
          data={bookedEvents}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.eventTitle}>{item.event?.title}</Text>
              <Text>₱ {item.event?.price ? Number(item.event.price).toLocaleString() : 'Free'}</Text>
            </View>
          )}
        />
      )}

      {/* Created Events (if organizer) */}
      {user?.role === "ORGANIZER" && (
        <>
          <Text style={styles.sectionTitle}>Events I Created</Text>
          {createdEvents.length === 0 ? (
            <Text style={styles.emptyText}>You haven’t created any events.</Text>
          ) : (
            <FlatList
              data={createdEvents}
              keyExtractor={(item) => item.id.toString()}
              renderItem={({ item }) => (
                <View style={styles.card}>
                  <Text style={styles.eventTitle}>{item.title}</Text>
                  <Text>₱ {item.price ? Number(item.price).toLocaleString() : 'Free'}</Text>
                  <TouchableOpacity
                    style={styles.viewBtn}
                    onPress={() =>
                      navigation.navigate("EventBookings", { eventId: item.id, title: item.title })
                    }
                  >
                    <Text style={{ color: "#fff", fontWeight: "600" }}>View Bookings</Text>
                  </TouchableOpacity>
                </View>
              )}
            />
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 15, backgroundColor: "#fff" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  sectionTitle: { fontSize: 18, fontWeight: "bold", marginVertical: 10, marginTop: 20 },
  emptyText: { color: "#999", marginBottom: 10 },
  card: {
    padding: 12,
    marginBottom: 10,
    backgroundColor: "#f9f9f9",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eee',
  },
  eventTitle: { fontSize: 16, fontWeight: "600", marginBottom: 4 },
  viewBtn: {
    marginTop: 10,
    backgroundColor: "#2E7D32",
    padding: 10,
    borderRadius: 6,
    alignItems: "center",
  },
});