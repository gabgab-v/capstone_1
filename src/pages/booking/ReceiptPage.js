import React from "react";
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { BASE_URL } from "../../lib/api";

function resolveReceiptUrl(paymentUrl) {
  if (typeof paymentUrl !== "string" || !paymentUrl.trim()) {
    return null;
  }
  if (/^https?:/i.test(paymentUrl)) {
    return paymentUrl.trim();
  }
  const normalized = paymentUrl.startsWith("/") ? paymentUrl : `/${paymentUrl}`;
  return `${BASE_URL}${normalized}`;
}

function formatAmount(amount) {
  const value = Number(amount ?? 0);
  if (!Number.isFinite(value) || value <= 0) {
    return "Free";
  }
  return `PHP ${value.toLocaleString()}`;
}

export default function ReceiptPage({ route, navigation }) {
  const event = route?.params?.event ?? null;
  const booking = route?.params?.booking ?? null;
  const receiptUrl = resolveReceiptUrl(booking?.paymentUrl);
  const amountLabel = formatAmount(booking?.totalAmount ?? event?.price);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>OK</Text>
        </View>
        <Text style={styles.title}>Booking Submitted</Text>
        <Text style={styles.subtitle}>We will notify you once the organizer reviews your payment.</Text>
      </View>

      <View style={styles.summary}>
        <Text style={styles.summaryLabel}>Event</Text>
        <Text style={styles.summaryValue}>{event?.title || "Event"}</Text>
        <Text style={[styles.summaryLabel, styles.summarySpacer]}>Amount Paid</Text>
        <Text style={styles.summaryValue}>{amountLabel}</Text>
        <Text style={[styles.summaryLabel, styles.summarySpacer]}>Booking Reference</Text>
        <Text style={styles.summaryValueSmall}>{booking?.id || "Pending"}</Text>
      </View>

      {receiptUrl ? (
        <View style={styles.receiptCard}>
          <Text style={styles.receiptTitle}>Uploaded Receipt</Text>
          <Image source={{ uri: receiptUrl }} style={styles.receiptImage} resizeMode="contain" />
          <Text style={styles.receiptHint}>
            Keep this receipt handy. Organizers use it to verify your payment.
          </Text>
        </View>
      ) : (
        <Text style={styles.receiptPlaceholder}>
          No receipt was uploaded for this booking.
        </Text>
      )}

      <TouchableOpacity
        style={styles.okBtn}
        onPress={() => navigation.navigate("MainTabs")}
        activeOpacity={0.85}
      >
        <Text style={styles.okText}>Back to Home</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#ffffff",
  },
  header: {
    alignItems: "center",
    marginBottom: 24,
  },
  badge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#10b981",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  badgeText: {
    fontSize: 32,
    color: "#ffffff",
    fontWeight: "700",
  },
  title: { fontSize: 24, fontWeight: "700", color: "#111827", marginBottom: 8 },
  subtitle: { fontSize: 14, color: "#4b5563", textAlign: "center" },
  summary: {
    width: "100%",
    padding: 20,
    borderRadius: 16,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginBottom: 20,
  },
  summaryLabel: { fontSize: 12, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 },
  summaryValue: { fontSize: 18, fontWeight: "700", color: "#111827" },
  summaryValueSmall: { fontSize: 14, fontWeight: "600", color: "#1f2937" },
  summarySpacer: { marginTop: 14 },
  receiptCard: {
    width: "100%",
    padding: 20,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
    marginBottom: 24,
  },
  receiptTitle: { fontSize: 16, fontWeight: "700", color: "#111827", marginBottom: 12 },
  receiptImage: { width: "100%", height: 260, backgroundColor: "#f3f4f6", borderRadius: 12 },
  receiptHint: { fontSize: 12, color: "#6b7280", marginTop: 12, textAlign: "center" },
  receiptPlaceholder: { fontSize: 13, color: "#6b7280", marginBottom: 24 },
  okBtn: {
    backgroundColor: "#047857",
    paddingVertical: 16,
    paddingHorizontal: 36,
    borderRadius: 999,
  },
  okText: { color: "#ffffff", fontSize: 15, fontWeight: "700" },
});
