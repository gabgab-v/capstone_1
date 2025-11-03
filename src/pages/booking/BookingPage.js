import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { useNotifications } from "../../context/NotificationContext";
import { createIdempotencyKey, postFormData } from "../../lib/api";
import { getEventDifficultyLabel } from "../../utils/matchScoring";

const ALLOWED_RECEIPT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export default function BookingPage({ route, navigation }) {
  const { event } = route.params;
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(false);
  const { scheduleNotification } = useNotifications();
  const [expertWaiverAccepted, setExpertWaiverAccepted] = useState(false);
  const [bookingRequestKey, setBookingRequestKey] = useState(() => createIdempotencyKey());

  const requiresReceipt = useMemo(() => Number(event?.price ?? 0) > 0, [event?.price]);
  const eventDifficulty = useMemo(() => getEventDifficultyLabel(event), [event]);
  const isExpertDifficulty = eventDifficulty === "Expert";
  const isExpertGatePending = isExpertDifficulty && !expertWaiverAccepted;

  useEffect(() => {
    setExpertWaiverAccepted(false);
    setBookingRequestKey(createIdempotencyKey());
  }, [event?.id, isExpertDifficulty]);

  const priceLabel = useMemo(() => {
    const amount = Number(event?.price ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      return "Free";
    }
    return `PHP ${amount.toLocaleString()}`;
  }, [event?.price]);

  const pickReceipt = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["image/*"],
        multiple: false,
        copyToCacheDirectory: false,
      });

      if (result.canceled || !result.assets || !result.assets.length) {
        return;
      }

      const asset = result.assets[0];
      const mimeType = (asset.mimeType || asset.type || "").toLowerCase();
      if (mimeType && !ALLOWED_RECEIPT_TYPES.includes(mimeType)) {
        Alert.alert(
          "Unsupported File",
          "Please upload an image receipt (JPEG, PNG, WEBP, or GIF).",
        );
        return;
      }

      setReceipt({
        uri: asset.uri,
        name: asset.name || "receipt.jpg",
        mimeType: mimeType || "image/jpeg",
      });
    } catch (error) {
      console.error("Error picking document:", error);
      Alert.alert("Error", "Could not pick the document.");
    }
  };

  const clearReceipt = () => {
    setReceipt(null);
  };

  const submitBooking = async () => {
    if (loading) {
      return;
    }

    if (requiresReceipt && !receipt) {
      Alert.alert("Receipt Required", "Please upload your payment receipt before submitting.");
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("eventId", event.id);
      formData.append("amount", Number(event?.price ?? 0));

      if (receipt) {
        formData.append("receipt", {
          uri: receipt.uri,
          name: receipt.name,
          type: receipt.mimeType,
        });
      }

      const booking = await postFormData("/api/bookings", formData, {
        idempotencyKey: bookingRequestKey,
      });

      await scheduleNotification({
        title: "Booking submitted",
        body: `Your spot for ${event?.title ?? "the event"} is awaiting organizer approval.`,
        data: {
          type: "booking",
          eventId: event?.id,
          bookingId: booking?.id ?? null,
        },
      });

      navigation.navigate("ReceiptPage", { event, booking });
      setBookingRequestKey(createIdempotencyKey());
    } catch (err) {
      console.error("Booking failed:", err);
      const errorMessage = err.body?.error || err.message || "Something went wrong while booking.";
      Alert.alert("Booking Failed", errorMessage);
      const shouldRotateKey = typeof err?.status === "number" ? err.status !== 0 : true;
      if (shouldRotateKey) {
        setBookingRequestKey(createIdempotencyKey());
      }
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmPress = () => {
    if (loading) {
      return;
    }

    if (requiresReceipt && !receipt) {
      Alert.alert("Receipt Required", "Please upload your payment receipt before submitting.");
      return;
    }

    if (isExpertGatePending) {
      Alert.alert(
        "Acknowledgement Needed",
        "This event is rated Expert difficulty. Please acknowledge that you understand the risks before booking.",
      );
      return;
    }

    submitBooking();
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Image source={{ uri: event.imageUrl }} style={styles.image} />
      <Text style={styles.title}>{event.title}</Text>
      <Text style={styles.price}>{priceLabel}</Text>

      <View style={styles.summary}>
        <Text style={styles.detailText}>
          <Text style={styles.detailLabel}>Organizer: </Text>
          {event.organizer?.email || "N/A"}
        </Text>
        <Text style={styles.detailText}>
          <Text style={styles.detailLabel}>GCash Number: </Text>
          {event.organizer?.gcashNumber || event.gcashNumber || "Not provided"}
        </Text>
        <Text style={styles.detailText}>
          <Text style={styles.detailLabel}>Total Due: </Text>
          {priceLabel}
        </Text>
        <Text style={[styles.detailText, styles.receiptNote]}>
          {requiresReceipt
            ? "Upload your payment receipt so the organizer can verify your booking."
            : "This event is free, but you can still upload a receipt or note for the organizer."}
        </Text>
      </View>

      {isExpertDifficulty ? (
        <View style={styles.expertCard}>
          <Text style={styles.expertCardTitle}>Expert Difficulty Waiver</Text>
          <Text style={styles.expertCardBody}>
            This event is rated Expert difficulty. It involves advanced terrain and elevated risk.
            Confirm that you understand these risks before submitting your booking.
          </Text>
          <TouchableOpacity
            style={styles.waiverToggle}
            onPress={() => setExpertWaiverAccepted((prev) => !prev)}
            disabled={loading}
            activeOpacity={0.8}
          >
            <View style={styles.checkbox}>
              {expertWaiverAccepted ? <View style={styles.checkboxInner} /> : null}
            </View>
            <Text style={styles.waiverText}>
              I understand the risks of this expert event and wish to proceed with my booking.
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <TouchableOpacity style={styles.uploadBtn} onPress={pickReceipt} disabled={loading}>
        <Text style={styles.uploadBtnText}>{receipt ? "Change Receipt" : "Upload Receipt"}</Text>
      </TouchableOpacity>

      {receipt ? (
        <View style={styles.previewCard}>
          <Image source={{ uri: receipt.uri }} style={styles.previewImage} />
          <View style={styles.previewMeta}>
            <Text style={styles.previewName} numberOfLines={1}>
              {receipt.name}
            </Text>
            <TouchableOpacity onPress={clearReceipt} disabled={loading}>
              <Text style={styles.removeText}>Remove</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <TouchableOpacity
        style={[styles.confirmBtn, (loading || isExpertGatePending) && styles.disabledBtn]}
        onPress={handleConfirmPress}
        disabled={loading}
        activeOpacity={0.9}
      >
        {loading ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.confirmText}>Submit Booking</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.cancelBtn}
        onPress={() => navigation.goBack()}
        disabled={loading}
        activeOpacity={0.7}
      >
        <Text style={styles.cancelText}>Cancel</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
    backgroundColor: "#fff",
  },
  image: { width: "100%", height: 200, borderRadius: 10, marginBottom: 16 },
  title: { fontSize: 20, fontWeight: "bold", marginBottom: 6, color: "#111827" },
  price: { fontSize: 16, color: "#047857", marginBottom: 20, fontWeight: "600" },
  summary: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  detailText: {
    fontSize: 14,
    lineHeight: 22,
    color: "#1f2937",
  },
  detailLabel: {
    fontWeight: "600",
    color: "#111827",
  },
  receiptNote: {
    marginTop: 12,
    color: "#4b5563",
  },
  uploadBtn: {
    padding: 14,
    backgroundColor: "#e5e7eb",
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 16,
  },
  uploadBtnText: { fontSize: 14, fontWeight: "600", color: "#111827" },
  previewCard: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    padding: 12,
    marginBottom: 18,
    backgroundColor: "#f9fafb",
  },
  previewImage: {
    width: "100%",
    height: 180,
    borderRadius: 8,
    marginBottom: 10,
    backgroundColor: "#e5e7eb",
  },
  previewMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  previewName: { flex: 1, fontSize: 13, fontWeight: "600", color: "#1f2937", marginRight: 10 },
  removeText: { fontSize: 13, color: "#dc2626", fontWeight: "600" },
  confirmBtn: {
    padding: 16,
    backgroundColor: "#047857",
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 12,
  },
  confirmText: { color: "#ffffff", fontSize: 15, fontWeight: "700" },
  disabledBtn: {
    opacity: 0.7,
  },
  expertCard: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: "#fef2f2",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#fca5a5",
  },
  expertCardTitle: { fontSize: 16, fontWeight: "700", color: "#b91c1c", marginBottom: 8 },
  expertCardBody: {
    fontSize: 13,
    color: "#7f1d1d",
    lineHeight: 20,
    marginBottom: 12,
  },
  waiverToggle: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: "#b91c1c",
    borderRadius: 4,
    marginRight: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  checkboxInner: {
    width: 12,
    height: 12,
    borderRadius: 2,
    backgroundColor: "#b91c1c",
  },
  waiverText: {
    flex: 1,
    fontSize: 13,
    color: "#7f1d1d",
    lineHeight: 20,
  },
  cancelBtn: {
    padding: 14,
    alignItems: "center",
  },
  cancelText: {
    fontSize: 14,
    color: "#4b5563",
    fontWeight: "600",
  },
});
