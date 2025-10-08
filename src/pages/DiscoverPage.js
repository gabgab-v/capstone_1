import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  Image,
  RefreshControl,
} from "react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { get } from "../lib/api";

const EVENT_IMAGE_PLACEHOLDER = "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee";

function truncate(text, limit = 140) {
  if (typeof text !== "string") {
    return null;
  }
  const trimmed = text.trim();
  if (trimmed.length <= limit) {
    return trimmed;
  }
  return `${trimmed.slice(0, limit - 1)}…`;
}

function getLocationLabel(event) {
  if (event?.locationName) {
    return event.locationName;
  }
  const lat = Number(event?.locationLatitude);
  const lng = Number(event?.locationLongitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return `Lat ${lat.toFixed(3)}, Lon ${lng.toFixed(3)}`;
  }
  return "Location to follow";
}

export default function DiscoverPage() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const navigation = useNavigation();

  const fetchEvents = useCallback(
    async ({ showSpinner = false, useRefreshControl = false } = {}) => {
      if (showSpinner) {
        setLoading(true);
      }
      if (useRefreshControl) {
        setRefreshing(true);
      }

      try {
        const data = await get("/api/events");
        setEvents(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Failed to fetch events:", err);
      } finally {
        if (showSpinner) {
          setLoading(false);
        }
        if (useRefreshControl) {
          setRefreshing(false);
        }
      }
    },
    []
  );

  useFocusEffect(
    useCallback(() => {
      fetchEvents({ showSpinner: events.length === 0 });
    }, [fetchEvents, events.length])
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
      keyExtractor={(item, index) => item.id?.toString() ?? `event-${index}`}
      contentContainerStyle={styles.listContent}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => fetchEvents({ useRefreshControl: true })}
          colors={["#2E7D32"]}
        />
      }
      renderItem={({ item }) => {
        const metrics = [
          Number.isFinite(Number(item.distanceKm))
            ? `${Number(item.distanceKm).toFixed(1)} km`
            : null,
          Number.isFinite(Number(item.durationHrs))
            ? `${Number(item.durationHrs).toFixed(1)} hrs`
            : null,
          Number.isFinite(Number(item.elevationM))
            ? `${Number(item.elevationM).toFixed(0)} m elevation`
            : null,
          Number.isFinite(Number(item.steps)) ? `${item.steps} steps` : null,
        ].filter(Boolean);

        const directionText =
          truncate(item.directions) ?? "Directions will be shared soon.";
        const approvedRaw = Number(item.approvedAttendeeCount);
        const totalRaw = Number(item.totalBookingCount);
        const approvedCount =
          Number.isFinite(approvedRaw) && approvedRaw >= 0 ? approvedRaw : 0;
        const totalCountCandidate =
          Number.isFinite(totalRaw) && totalRaw >= 0 ? totalRaw : approvedCount;
        const totalCount = Math.max(totalCountCandidate, approvedCount);
        const attendeeProgress =
          totalCount > 0 ? Math.max(0, Math.min(approvedCount / totalCount, 1)) : 0;
        const attendeeProgressWidth =
          attendeeProgress === 0
            ? "0%"
            : `${Math.min(100, Math.max(attendeeProgress * 100, 8)).toFixed(0)}%`;
        const attendeeCaption =
          totalCount === 0
            ? "No bookings yet"
            : `${approvedCount} approved of ${totalCount} booking${
                totalCount === 1 ? "" : "s"
              }`;

        return (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.85}
            onPress={() => navigation.navigate("EventDetails", { event: item })}
          >
            <Image
              source={{ uri: item.imageUrl || EVENT_IMAGE_PLACEHOLDER }}
              style={styles.banner}
            />
            <View style={styles.cardBody}>
              <View style={styles.cardHeader}>
                <Text style={styles.title}>{item.title}</Text>
                {Number.isFinite(Number(item.price)) && (
                  <Text style={styles.priceTag}>
                    ₱{Number(item.price).toLocaleString()}
                  </Text>
                )}
              </View>
              <Text style={styles.location}>{getLocationLabel(item)}</Text>
              {metrics.length > 0 && (
                <View style={styles.metricRow}>
                  {metrics.map((metric) => (
                    <View key={metric} style={styles.metricChip}>
                      <Text style={styles.metricText}>{metric}</Text>
                    </View>
                  ))}
                </View>
              )}
              <View style={styles.attendeeBarContainer}>
                <View style={styles.attendeeBarHeader}>
                  <Text style={styles.attendeeBarLabel}>Attendees</Text>
                  <Text style={styles.attendeeBarValue}>
                    {approvedCount}/{totalCount}
                  </Text>
                </View>
                <View style={styles.attendeeBarTrack}>
                  <View style={[styles.attendeeBarFill, { width: attendeeProgressWidth }]} />
                </View>
                <Text style={styles.attendeeBarCaption}>{attendeeCaption}</Text>
              </View>
              <View style={styles.sectionSpacing}>
                <Text style={styles.sectionLabel}>Directions</Text>
                <Text style={styles.sectionText}>{directionText}</Text>
              </View>
              <Text style={styles.organizer}>
                Hosted by {item.organizer?.name || "Unknown organizer"}
              </Text>
            </View>
          </TouchableOpacity>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  empty: { fontSize: 16, color: "#666" },
  listContent: {
    paddingVertical: 18,
  },
  card: {
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginBottom: 18,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E6EAD4",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  banner: {
    width: "100%",
    height: 170,
    backgroundColor: "#F1F5F9",
  },
  cardBody: {
    padding: 16,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    color: "#1A3620",
    marginRight: 12,
  },
  priceTag: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2E7D32",
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  location: {
    fontSize: 14,
    color: "#4B5563",
    marginBottom: 10,
  },
  metricRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 12,
  },
  metricChip: {
    backgroundColor: "#F0FDF4",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    marginBottom: 8,
  },
  metricText: {
    color: "#166534",
    fontSize: 12,
    fontWeight: "600",
  },
  attendeeBarContainer: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#F8FAFC",
    marginBottom: 12,
  },
  attendeeBarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 6,
  },
  attendeeBarLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1F2937",
    textTransform: "uppercase",
  },
  attendeeBarValue: { fontSize: 13, fontWeight: "700", color: "#0F172A" },
  attendeeBarTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: "#E2E8F0",
    overflow: "hidden",
    marginBottom: 6,
  },
  attendeeBarFill: {
    height: "100%",
    backgroundColor: "#2E7D32",
    borderRadius: 999,
  },
  attendeeBarCaption: { fontSize: 12, color: "#475569" },
  sectionSpacing: {
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "600",
    marginBottom: 4,
    textTransform: "uppercase",
  },
  sectionText: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 20,
  },
  organizer: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "500",
  },
});
