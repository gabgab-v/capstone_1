import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
} from "react-native";

export default function EventDetailsPage({ route, navigation }) {
  const { event } = route.params;

  const [activeTab, setActiveTab] = useState("overview");

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Banner Image */}
        <Image
          source={{ uri: event.imageUrl || "https://picsum.photos/600/400" }}
          style={styles.banner}
        />

        {/* Title & Price */}
        <View style={styles.header}>
          <Text style={styles.title}>{event.title}</Text>
          <Text style={styles.date}>{event.date || "Date to be announced"}</Text>
          <Text style={styles.price}>PHP {event.price}</Text>
        </View>

        {/* Tabs */}
        <View style={styles.tabRow}>
          {["overview", "details", "itinerary", "directions"].map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[
                styles.tabButton,
                activeTab === tab && styles.activeTabButton,
              ]}
              onPress={() => setActiveTab(tab)}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === tab && styles.activeTabText,
                ]}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tab Content */}
        {activeTab === "overview" && (
          <Text style={styles.overviewText}>
            {event.overview ||
              "This is an amazing adventure event. More details coming soon!"}
          </Text>
        )}

        {activeTab === "details" && (
          <ScrollView contentContainerStyle={styles.detailsContainer}>
            <Text style={styles.detailsTitle}>{event.title}</Text>

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

            <View style={styles.section}>
              <Text style={styles.label}>GCash:</Text>
              <Text style={styles.value}>{event.gcashNumber || "Unknown"}</Text>
            </View>
          </ScrollView>
        )}

        {activeTab === "itinerary" && (
          <Text style={styles.overviewText}>
            {event.itinerary || "Itinerary will be shared soon."}
          </Text>
        )}

        {activeTab === "directions" && (
          <Text style={styles.overviewText}>
            {event.directions || "Directions will be provided closer to the event date."}
          </Text>
        )}

        {/* Organizer Section */}
        <View style={styles.organizerCard}>
          <View style={styles.organizerInfo}>
            <View style={styles.avatarPlaceholder} />
            <View>
              <Text style={styles.organizerName}>
                {event.organizer?.name || "Unknown Organizer"}
              </Text>
              <Text style={styles.organizerDate}>May 10, 2025</Text>
            </View>
          </View>
          <View style={styles.actionButtons}>
            <TouchableOpacity style={styles.followBtn}>
              <Text style={styles.followText}>Follow</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.messageBtn}>
              <Text style={styles.messageText}>Message</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Comments */}
        <Text style={styles.commentsTitle}>Comments:</Text>
        <View style={styles.commentCard}>
          <View style={styles.avatarPlaceholder} />
          <View>
            <Text style={styles.commentAuthor}>Rheniel Penional</Text>
            <Text style={styles.commentText}>
              Lorem ipsum dolor sit amet consectetur adipiscing elit.
            </Text>
          </View>
        </View>
        <View style={styles.commentCard}>
          <View style={styles.avatarPlaceholder} />
          <View>
            <Text style={styles.commentAuthor}>Rheniel Penional</Text>
            <Text style={styles.commentText}>
              Another comment goes here to show layout.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Book Now Fixed Button */}
      <TouchableOpacity
        style={styles.bookButton}
        onPress={() => navigation.navigate("BookingPage", { event })}
      >
        <Text style={styles.bookText}>Book Now</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#fff" },
  container: { paddingBottom: 100 },
  banner: { width: "100%", height: 200 },
  header: { padding: 16 },
  title: { fontSize: 22, fontWeight: "bold", color: "#2E7D32" },
  date: { fontSize: 14, color: "#666", marginVertical: 4 },
  price: { fontSize: 18, fontWeight: "bold", color: "#000" },
  tabRow: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  tabButton: { flex: 1, paddingVertical: 8, alignItems: "center" },
  tabText: { fontSize: 14, color: "#555" },
  activeTabButton: { borderBottomWidth: 2, borderBottomColor: "#2E7D32" },
  activeTabText: { color: "#2E7D32", fontWeight: "bold" },
  overviewText: { padding: 16, fontSize: 14, color: "#444", lineHeight: 20 },
  organizerCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#eee",
    alignItems: "center",
  },
  organizerInfo: { flexDirection: "row", alignItems: "center" },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#ccc",
    marginRight: 10,
  },
  organizerName: { fontWeight: "bold", fontSize: 14 },
  organizerDate: { fontSize: 12, color: "#666" },
  actionButtons: { flexDirection: "row", gap: 10 },
  followBtn: {
    backgroundColor: "#2E7D32",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  followText: { color: "#fff", fontSize: 12 },
  messageBtn: {
    borderWidth: 1,
    borderColor: "#2E7D32",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  messageText: { color: "#2E7D32", fontSize: 12 },
  commentsTitle: { margin: 16, fontWeight: "bold", fontSize: 16 },
  commentCard: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: "flex-start",
  },
  commentAuthor: { fontWeight: "600", fontSize: 13, marginBottom: 2 },
  commentText: { fontSize: 13, color: "#555" },
  bookButton: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#2E7D32",
    padding: 16,
    alignItems: "center",
  },
  bookText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  detailsContainer: {
  padding: 16,
  },
  detailsTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 12,
    color: "#2E7D32",
  },
  section: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    paddingBottom: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  value: {
    fontSize: 14,
    color: "#555",
  },

});
