import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { get, BASE_URL } from "../../lib/api";

function formatAmount(value) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    return "Free";
  }
  return `PHP ${amount.toLocaleString()}`;
}

function resolveReceiptUrl(paymentUrl) {
  if (typeof paymentUrl !== "string" || !paymentUrl.trim()) {
    return null;
  }
  if (/^https?:/i.test(paymentUrl)) {
    return paymentUrl.trim();
  }
  const path = paymentUrl.startsWith("/") ? paymentUrl : `/${paymentUrl}`;
  return `${BASE_URL}${path}`;
}

function BookingItem({ booking }) {
  const receiptUrl = resolveReceiptUrl(booking?.paymentUrl);
  const handleOpenReceipt = () => {
    if (!receiptUrl) {
      return;
    }
    Linking.openURL(receiptUrl).catch(() => {
      Alert.alert("Unable to open receipt", "Please try again later.");
    });
  };

  return (
    <View style={styles.card}>
      <Text style={styles.userName}>{booking?.user?.name || "Anonymous"}</Text>
      <Text style={styles.userEmail}>{booking?.user?.email || "No email provided"}</Text>
      <Text style={styles.amountLabel}>Paid: {formatAmount(booking?.totalAmount)}</Text>
      <Text style={styles.referenceLabel}>Reference: {booking?.id}</Text>
      {receiptUrl ? (
        <TouchableOpacity style={styles.receiptButton} onPress={handleOpenReceipt}>
          <Text style={styles.receiptButtonText}>View receipt</Text>
        </TouchableOpacity>
      ) : (
        <Text style={styles.noReceipt}>No receipt uploaded</Text>
      )}
    </View>
  );
}

export default function EventBookingsPage({ route }) {
  const { eventId, title } = route.params;
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchBookings = async () => {
      try {
        const data = await get(`/api/events/${eventId}/bookings`);
        if (isMounted) {
          setBookings(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error("Failed to fetch bookings:", err);
        if (isMounted) {
          setBookings([]);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchBookings();
    return () => {
      isMounted = false;
    };
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
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <BookingItem booking={item} />}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 20, fontWeight: "700", marginBottom: 16, color: "#111827" },
  emptyText: { color: "#6b7280", fontSize: 14 },
  card: {
    padding: 16,
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  separator: { height: 12 },
  userName: { fontSize: 16, fontWeight: "600", color: "#111827" },
  userEmail: { fontSize: 14, color: "#4b5563", marginBottom: 6 },
  amountLabel: { fontSize: 14, fontWeight: "600", color: "#047857" },
  referenceLabel: { fontSize: 12, color: "#6b7280", marginTop: 4 },
  receiptButton: {
    marginTop: 10,
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "#1d4ed8",
  },
  receiptButtonText: { color: "#ffffff", fontSize: 12, fontWeight: "700" },
  noReceipt: { fontSize: 12, color: "#9ca3af", marginTop: 10 },
});
