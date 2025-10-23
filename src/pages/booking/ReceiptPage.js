import React, { useMemo } from "react";
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { BASE_URL } from "../../lib/api";
import KeyboardSpacer from "../../components/KeyboardSpacer";

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

function getStatusMeta(status) {
  const normalized = typeof status === "string" ? status.toUpperCase() : "PENDING";
  switch (normalized) {
    case "CONFIRMED":
    case "APPROVED":
      return { label: "Confirmed", color: "#047857", normalized };
    case "REJECTED":
    case "DECLINED":
      return { label: "Rejected", color: "#b91c1c", normalized };
    case "CANCELLED":
      return { label: "Cancelled", color: "#b45309", normalized };
    default:
      return { label: "Pending", color: "#1d4ed8", normalized: normalized || "PENDING" };
  }
}

export default function ReceiptPage({ route, navigation }) {
  const event = route?.params?.event ?? null;
  const booking = route?.params?.booking ?? null;

  const receiptUrl = resolveReceiptUrl(booking?.paymentUrl);
  const amountLabel = formatAmount(booking?.totalAmount ?? event?.price);

  const statusMeta = useMemo(() => getStatusMeta(booking?.status), [booking?.status]);
  const isConfirmed = statusMeta.normalized === "CONFIRMED" || statusMeta.normalized === "APPROVED";
  const isRejected = statusMeta.normalized === "REJECTED" || statusMeta.normalized === "DECLINED";
  const isCancelled = statusMeta.normalized === "CANCELLED";
  const statusMessage = useMemo(() => {
    if (isConfirmed) {
      return "Attendance confirmed. See you on the trail!";
    }
    if (isRejected) {
      return "This booking was rejected. Contact the organizer for details.";
    }
    if (isCancelled) {
      return "This booking was cancelled.";
    }
    return "Waiting for organizer review.";
  }, [isCancelled, isConfirmed, isRejected]);

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
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
        <Text style={[styles.summaryLabel, styles.summarySpacer]}>Status</Text>
        <Text style={[styles.summaryStatus, { color: statusMeta.color }]}>{statusMeta.label}</Text>
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

      <View style={[styles.statusBanner, { borderColor: statusMeta.color }]}>
        <Text style={[styles.statusBannerText, { color: statusMeta.color }]}>{statusMessage}</Text>
      </View>

      <TouchableOpacity
        style={styles.okBtn}
        onPress={() => navigation.navigate("MainTabs")}
        activeOpacity={0.85}
      >
        <Text style={styles.okText}>Back to Home</Text>
      </TouchableOpacity>
      <KeyboardSpacer extraHeight={24} />
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
  summaryStatus: { fontSize: 14, fontWeight: "700" },
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
  statusBanner: {
    width: "100%",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: "#f8fafc",
    marginBottom: 18,
  },
  statusBannerText: { fontSize: 13, fontWeight: "600", textAlign: "center" },
  okBtn: {
    backgroundColor: "#047857",
    paddingVertical: 16,
    paddingHorizontal: 36,
    borderRadius: 999,
  },
  okText: { color: "#ffffff", fontSize: 15, fontWeight: "700" },
});
