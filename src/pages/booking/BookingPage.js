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

const ALLOWED_RECEIPT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/jpg"];
const ALLOWED_DOCUMENT_TYPES = [...ALLOWED_RECEIPT_TYPES, "application/pdf"];

const DOCUMENT_CONFIG = {
  waiver: {
    key: "waiver",
    label: "Risk Waiver",
    helper: "Upload the signed waiver acknowledging you understand the advanced risks.",
  },
  medicalCertificate: {
    key: "medicalCertificate",
    label: "Medical Clearance",
    helper: "Provide a recent medical certificate showing you are fit to join.",
  },
  trailPolicy: {
    key: "trailPolicy",
    label: "Trail Policy Acknowledgement",
    helper: "Attach any trail-specific policy or permit required by the organizer.",
  },
};

const REQUIRED_DOCUMENTS_BY_DIFFICULTY = {
  Technical: ["waiver", "trailPolicy"],
  Expert: ["waiver", "medicalCertificate"],
};

export default function BookingPage({ route, navigation }) {
  const { event } = route.params;
  const [receipt, setReceipt] = useState(null);
  const [documents, setDocuments] = useState({
    waiver: null,
    medicalCertificate: null,
    trailPolicy: null,
  });
  const [loading, setLoading] = useState(false);
  const { scheduleNotification } = useNotifications();
  const [expertWaiverAccepted, setExpertWaiverAccepted] = useState(false);
  const [safetyWaiverAccepted, setSafetyWaiverAccepted] = useState(false);
  const [bookingRequestKey, setBookingRequestKey] = useState(() => createIdempotencyKey());

  const requiresReceipt = useMemo(() => Number(event?.price ?? 0) > 0, [event?.price]);
  const eventDifficulty = useMemo(() => getEventDifficultyLabel(event), [event]);
  const isExpertDifficulty = eventDifficulty === "Expert";
  const requiredDocuments = useMemo(
    () => REQUIRED_DOCUMENTS_BY_DIFFICULTY[eventDifficulty] ?? [],
    [eventDifficulty],
  );
  const isExpertGatePending = isExpertDifficulty && !expertWaiverAccepted;
  const isSafetyWaiverPending = !safetyWaiverAccepted;

  useEffect(() => {
    setExpertWaiverAccepted(false);
    setSafetyWaiverAccepted(false);
    setBookingRequestKey(createIdempotencyKey());
    setDocuments({ waiver: null, medicalCertificate: null, trailPolicy: null });
    setReceipt(null);
  }, [event?.id, eventDifficulty]);

  const priceLabel = useMemo(() => {
    const amount = Number(event?.price ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      return "Free";
    }
    return `PHP ${amount.toLocaleString()}`;
  }, [event?.price]);

  const createFilePayload = (asset, fallbackName, fallbackMimeType) => {
    const normalizedMime = (asset.mimeType || asset.type || fallbackMimeType || "").toLowerCase();
    return {
      uri: asset.uri,
      name: asset.name || fallbackName,
      mimeType: normalizedMime || fallbackMimeType || "application/octet-stream",
    };
  };

  const pickFile = async ({
    pickerTypes,
    allowedMimeTypes,
    fallbackName,
    fallbackMimeType,
    label,
    unsupportedMessage,
    onPicked,
  }) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: pickerTypes,
        multiple: false,
        copyToCacheDirectory: false,
      });

      if (result.canceled || !result.assets || !result.assets.length) {
        return;
      }

      const file = createFilePayload(result.assets[0], fallbackName, fallbackMimeType);

      if (
        Array.isArray(allowedMimeTypes) &&
        allowedMimeTypes.length > 0 &&
        file.mimeType &&
        !allowedMimeTypes.includes(file.mimeType)
      ) {
        Alert.alert("Unsupported File", unsupportedMessage);
        return;
      }

      onPicked(file);
    } catch (error) {
      console.error(`Error picking ${label}:`, error);
      Alert.alert("Error", `Could not pick the ${label.toLowerCase()}.`);
    }
  };

  const pickReceipt = async () => {
    if (loading) {
      return;
    }
    await pickFile({
      pickerTypes: ["image/*"],
      allowedMimeTypes: ALLOWED_RECEIPT_TYPES,
      fallbackName: "receipt.jpg",
      fallbackMimeType: "image/jpeg",
      label: "Receipt",
      unsupportedMessage: "Please upload an image receipt (JPEG, PNG, WEBP, or GIF).",
      onPicked: (file) => setReceipt(file),
    });
  };

  const pickDocument = async (docKey) => {
    if (loading) {
      return;
    }
    const config = DOCUMENT_CONFIG[docKey];
    if (!config) {
      return;
    }
    await pickFile({
      pickerTypes: ["image/*", "application/pdf"],
      allowedMimeTypes: ALLOWED_DOCUMENT_TYPES,
      fallbackName: `${docKey}.pdf`,
      fallbackMimeType: "application/pdf",
      label: config.label,
      unsupportedMessage: "Please upload an image or PDF for this document.",
      onPicked: (file) =>
        setDocuments((prev) => ({
          ...prev,
          [docKey]: file,
        })),
    });
  };

  const clearReceipt = () => {
    setReceipt(null);
  };

  const clearDocument = (docKey) => {
    setDocuments((prev) => ({
      ...prev,
      [docKey]: null,
    }));
  };

  const submitBooking = async () => {
    if (loading) {
      return;
    }

    if (requiresReceipt && !receipt) {
      Alert.alert("Receipt Required", "Please upload your payment receipt before submitting.");
      return;
    }

    const missingDocumentLabels = requiredDocuments
      .filter((docKey) => !documents[docKey])
      .map((docKey) => DOCUMENT_CONFIG[docKey]?.label || docKey);

    if (missingDocumentLabels.length) {
      Alert.alert(
        "Documentation Required",
        `Please upload the following before submitting: ${missingDocumentLabels.join(", ")}.`,
      );
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

      Object.entries(documents).forEach(([docKey, file]) => {
        if (!file) {
          return;
        }
        formData.append(docKey, {
          uri: file.uri,
          name: file.name,
          type: file.mimeType,
        });
      });

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

      setDocuments({ waiver: null, medicalCertificate: null, trailPolicy: null });
      setReceipt(null);
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

    const missingDocumentLabels = requiredDocuments
      .filter((docKey) => !documents[docKey])
      .map((docKey) => DOCUMENT_CONFIG[docKey]?.label || docKey);
    if (missingDocumentLabels.length) {
      Alert.alert(
        "Documentation Required",
        `Please upload the following before submitting: ${missingDocumentLabels.join(", ")}.`,
      );
      return;
    }

    if (isSafetyWaiverPending) {
      Alert.alert(
        "Safety Waiver Required",
        "Please acknowledge the trail warnings and confirm that you are responsible for your health during the hike.",
      );
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

      <View style={styles.safetyCard}>
        <Text style={styles.safetyCardTitle}>Trail Safety Waiver</Text>
        <Text style={styles.safetyCardBody}>
          Mountain hikes can involve unpredictable weather, steep inclines, and delayed emergency
          response times. Please review the reminders below before finalizing your booking.
        </Text>
        <View style={styles.safetyList}>
          <Text style={styles.safetyListItem}>
            - Join only if you are healthy enough for strenuous activity and have consulted a doctor
            about any medical conditions.
          </Text>
          <Text style={styles.safetyListItem}>
            - You are responsible for monitoring your hydration, medications, and overall wellbeing
            throughout the hike.
          </Text>
          <Text style={styles.safetyListItem}>
            - Inform guides of any concerns immediately and acknowledge that you participate at your
            own risk.
          </Text>
        </View>
        <TouchableOpacity
          style={styles.safetyWaiverToggle}
          onPress={() => setSafetyWaiverAccepted((prev) => !prev)}
          disabled={loading}
          activeOpacity={0.8}
        >
          <View style={styles.safetyCheckbox}>
            {safetyWaiverAccepted ? <View style={styles.safetyCheckboxInner} /> : null}
          </View>
          <Text style={styles.safetyWaiverText}>
            I have read the trail warnings and accept personal responsibility for my participation.
          </Text>
        </TouchableOpacity>
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

      {requiredDocuments.length ? (
        <View style={styles.documentationCard}>
          <Text style={styles.documentationTitle}>Required Documentation</Text>
          <Text style={styles.documentationSubtitle}>
            {`This trail is rated ${eventDifficulty || "advanced"}. Upload these files before submitting your booking.`}
          </Text>

          {requiredDocuments.map((docKey) => {
            const config = DOCUMENT_CONFIG[docKey];
            if (!config) {
              return null;
            }
            const doc = documents[docKey];
            const isImage = (doc?.mimeType || "").startsWith("image/");
            return (
              <View key={docKey} style={styles.documentSection}>
                <View style={styles.documentLabelRow}>
                  <Text style={styles.documentLabel}>{config.label}</Text>
                  <Text style={styles.documentRequiredBadge}>Required</Text>
                </View>
                <Text style={styles.documentHelper}>{config.helper}</Text>
                <TouchableOpacity
                  style={styles.uploadBtn}
                  onPress={() => pickDocument(docKey)}
                  disabled={loading}
                >
                  <Text style={styles.uploadBtnText}>
                    {doc ? `Change ${config.label}` : `Upload ${config.label}`}
                  </Text>
                </TouchableOpacity>
                {doc ? (
                  <View style={styles.previewCard}>
                    {isImage ? (
                      <Image source={{ uri: doc.uri }} style={styles.previewImage} />
                    ) : (
                      <View style={styles.documentPlaceholder}>
                        <Text style={styles.documentPlaceholderText}>PDF attached</Text>
                      </View>
                    )}
                    <View style={styles.previewMeta}>
                      <Text style={styles.previewName} numberOfLines={1}>
                        {doc.name}
                      </Text>
                      <TouchableOpacity onPress={() => clearDocument(docKey)} disabled={loading}>
                        <Text style={styles.removeText}>Remove</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })}
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
        style={[styles.confirmBtn, (loading || isExpertGatePending || isSafetyWaiverPending) && styles.disabledBtn]}
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
  safetyCard: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: "#fffbeb",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#fcd34d",
  },
  safetyCardTitle: { fontSize: 16, fontWeight: "700", color: "#92400e", marginBottom: 6 },
  safetyCardBody: {
    fontSize: 13,
    color: "#78350f",
    lineHeight: 20,
    marginBottom: 12,
  },
  safetyList: {
    marginBottom: 12,
  },
  safetyListItem: {
    fontSize: 12,
    color: "#92400e",
    lineHeight: 18,
    marginBottom: 6,
  },
  safetyWaiverToggle: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  safetyCheckbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: "#b45309",
    borderRadius: 4,
    marginRight: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff7ed",
  },
  safetyCheckboxInner: {
    width: 12,
    height: 12,
    borderRadius: 2,
    backgroundColor: "#d97706",
  },
  safetyWaiverText: {
    flex: 1,
    fontSize: 13,
    color: "#78350f",
    lineHeight: 20,
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
  documentationCard: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: "#ecfeff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#bae6fd",
  },
  documentationTitle: { fontSize: 16, fontWeight: "700", color: "#0f172a", marginBottom: 6 },
  documentationSubtitle: {
    fontSize: 13,
    color: "#1e3a8a",
    lineHeight: 20,
    marginBottom: 14,
  },
  documentSection: {
    marginBottom: 16,
  },
  documentLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  documentLabel: { fontSize: 14, fontWeight: "600", color: "#0f172a" },
  documentRequiredBadge: { fontSize: 12, fontWeight: "700", color: "#b91c1c" },
  documentHelper: { fontSize: 12, color: "#334155", marginBottom: 10, lineHeight: 18 },
  documentPlaceholder: {
    width: "100%",
    height: 120,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5f5",
    backgroundColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  documentPlaceholderText: { fontSize: 13, fontWeight: "600", color: "#475569" },
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
