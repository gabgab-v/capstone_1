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
import { useAuth } from "../../context/AuthContext";
import { createIdempotencyKey, get, postFormData } from "../../lib/api";
import { evaluateEventReadiness, getEventDifficultyLabel } from "../../utils/matchScoring";

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
    helper: "Provide a recent medical certificate showing you are fit to join. Required for Expert trails; strongly recommended for safety on other levels.",
  },
  experienceProof: {
    key: "experienceProof",
    label: "Experience Proof",
    helper:
      "Upload summit photos or past hike evidence so organizers can verify your experience and trail policy adherence.",
    multiple: true,
  },
  trailPolicy: {
    key: "trailPolicy",
    label: "Trail Policy Acknowledgement",
    helper: "Attach any trail-specific policy or permit required by the organizer.",
  },
};

const REQUIRED_DOCUMENTS_BY_DIFFICULTY = {
  Technical: ["waiver", "trailPolicy"],
  Expert: ["waiver", "medicalCertificate", "experienceProof"],
};

const OPTIONAL_DOCUMENTS_BY_DIFFICULTY = {
  Beginner: ["experienceProof"],
  Intermediate: ["experienceProof"],
  Technical: ["experienceProof"],
  Expert: [],
};
const BOOKING_POLICY_ITEMS = [
  "Bookings are non-refundable once submitted. Cancelling releases your slot.",
  "You may request a schedule transfer. The organizer reviews each request and may approve or decline it.",
  "If the organizer moves the event schedule, attendees vote in a reschedule poll and the majority decides.",
  "If you cannot attend, update your attendance status so the organizer can plan accurately.",
];

export default function BookingPage({ route, navigation }) {
  const { event } = route.params;
  const { user } = useAuth();
  const [receipt, setReceipt] = useState(null);
  const [documents, setDocuments] = useState({
    waiver: null,
    medicalCertificate: null,
    experienceProof: [],
    trailPolicy: null,
  });
  const [loading, setLoading] = useState(false);
  const { scheduleNotification } = useNotifications();
  const [expertWaiverAccepted, setExpertWaiverAccepted] = useState(false);
  const [safetyWaiverAccepted, setSafetyWaiverAccepted] = useState(false);
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [bookingRequestKey, setBookingRequestKey] = useState(() => createIdempotencyKey());
  const [warningsAcknowledged, setWarningsAcknowledged] = useState(false);

  const requiresReceipt = useMemo(() => Number(event?.price ?? 0) > 0, [event?.price]);
  const eventDifficulty = useMemo(() => getEventDifficultyLabel(event), [event]);
  const isExpertDifficulty = eventDifficulty === "Expert";
  const requiredDocuments = useMemo(
    () => REQUIRED_DOCUMENTS_BY_DIFFICULTY[eventDifficulty] ?? [],
    [eventDifficulty],
  );
  const optionalDocuments = useMemo(
    () => OPTIONAL_DOCUMENTS_BY_DIFFICULTY[eventDifficulty] ?? [],
    [eventDifficulty],
  );
  const documentationSections = useMemo(() => {
    const seen = new Set();
    const sections = [];

    requiredDocuments.forEach((docKey) => {
      if (DOCUMENT_CONFIG[docKey] && !seen.has(docKey)) {
        seen.add(docKey);
        sections.push({ key: docKey, required: true });
      }
    });

    optionalDocuments.forEach((docKey) => {
      if (DOCUMENT_CONFIG[docKey] && !seen.has(docKey)) {
        seen.add(docKey);
        sections.push({ key: docKey, required: false });
      }
    });

    return sections;
  }, [optionalDocuments, requiredDocuments]);
  const isExpertGatePending = isExpertDifficulty && !expertWaiverAccepted;
  const isSafetyWaiverPending = !safetyWaiverAccepted;
  const isPolicyPending = !policyAccepted;
  const readinessAssessment = useMemo(
    () => evaluateEventReadiness(user, event),
    [event, user],
  );
  const readinessBlockers = readinessAssessment?.blockers ?? [];
  const readinessWarnings = readinessAssessment?.warnings ?? [];
  const hasReadinessBlockers = readinessBlockers.length > 0;

  const capacityLimit = useMemo(() => {
    const raw = Number(event?.maxParticipants);
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  }, [event?.maxParticipants]);
  const approvedCount = useMemo(() => {
    const raw = Number(event?.approvedAttendeeCount);
    return Number.isFinite(raw) && raw >= 0 ? raw : 0;
  }, [event?.approvedAttendeeCount]);
  const slotsLeft = useMemo(() => {
    if (capacityLimit === null) {
      return null;
    }
    return Math.max(0, capacityLimit - approvedCount);
  }, [approvedCount, capacityLimit]);
  const isEventFull = useMemo(() => {
    if (event?.isFull === true) {
      return true;
    }
    if (capacityLimit === null) {
      return false;
    }
    return slotsLeft !== null ? slotsLeft <= 0 : false;
  }, [capacityLimit, event?.isFull, slotsLeft]);
  const slotsLabel = useMemo(() => {
    if (capacityLimit === null) {
      return "Unlimited capacity";
    }
    if (slotsLeft > 0) {
      return `${slotsLeft} slot${slotsLeft === 1 ? "" : "s"} left`;
    }
    return "Fully booked";
  }, [capacityLimit, slotsLeft]);

  useEffect(() => {
    setExpertWaiverAccepted(false);
    setSafetyWaiverAccepted(false);
    setPolicyAccepted(false);
    setBookingRequestKey(createIdempotencyKey());
    setDocuments({ waiver: null, medicalCertificate: null, experienceProof: [], trailPolicy: null });
    setReceipt(null);
    setWarningsAcknowledged(false);
  }, [event?.id, eventDifficulty]);

  useEffect(() => {
    setWarningsAcknowledged(false);
  }, [readinessWarnings.join('|'), user?.id]);

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
    allowMultiple = false,
  }) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: pickerTypes,
        multiple: allowMultiple,
        copyToCacheDirectory: false,
      });

      if (result.canceled || !result.assets || !result.assets.length) {
        return;
      }

      const files = result.assets.map((asset, index) =>
        createFilePayload(asset, `${fallbackName}-${index + 1}`, fallbackMimeType),
      );

      const hasUnsupported = Array.isArray(allowedMimeTypes)
        ? files.some((file) => file.mimeType && !allowedMimeTypes.includes(file.mimeType))
        : false;

      if (hasUnsupported) {
        Alert.alert("Unsupported File", unsupportedMessage);
        return;
      }

      onPicked(files);
    } catch (error) {
      console.error(`Error picking ${label}:`, error);
      Alert.alert("Error", `Could not pick the ${label.toLowerCase()}.`);
    }
  };

  const applyPickedDocuments = (docKey, files, allowMultiple) => {
    if (!Array.isArray(files) || !files.length) {
      return;
    }
    setDocuments((prev) => {
      if (allowMultiple) {
        const existing = Array.isArray(prev[docKey]) ? prev[docKey] : [];
        return { ...prev, [docKey]: [...existing, ...files] };
      }
      return { ...prev, [docKey]: files[0] };
    });
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
      onPicked: (files) => setReceipt(files[0]),
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
      allowMultiple: Boolean(config.multiple),
      onPicked: (files) => applyPickedDocuments(docKey, files, Boolean(config.multiple)),
    });
  };

  const clearReceipt = () => {
    setReceipt(null);
  };

  const clearDocument = (docKey, index = null) => {
    setDocuments((prev) => {
      const current = prev[docKey];
      if (Array.isArray(current)) {
        if (index === null || index === undefined) {
          return { ...prev, [docKey]: [] };
        }
        const next = current.filter((_, idx) => idx !== index);
        return { ...prev, [docKey]: next };
      }
      return { ...prev, [docKey]: null };
    });
  };

  const hasDocument = (docKey) => {
    const value = documents[docKey];
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    return Boolean(value);
  };

  const submitBooking = async () => {
    if (loading) {
      return;
    }

    if (hasReadinessBlockers) {
      const message = readinessBlockers.length
        ? `Resolve these before booking:\n• ${readinessBlockers.join('\n• ')}`
        : 'Booking is locked until you meet the organizer requirements.';
      Alert.alert('Booking locked', message);
      return;
    }

    if (requiresReceipt && !receipt) {
      Alert.alert("Receipt Required", "Please upload your payment receipt before submitting.");
      return;
    }

    const missingDocumentLabels = requiredDocuments
      .filter((docKey) => !hasDocument(docKey))
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
      // Check for existing bookings to prevent duplicates
      try {
        const existingBookings = await get(`/api/bookings?eventId=${event.id}&userId=${user.id}`);
        if (Array.isArray(existingBookings) && existingBookings.length > 0) {
          Alert.alert("Already Booked", "You have already booked this event.");
          return;
        }
      } catch (checkErr) {
        console.warn("Could not check existing bookings, proceeding anyway:", checkErr);
        // Proceed if check fails, but log it
      }

      const latestEvent = await get(`/api/events/${event.id}`);
      const latestCapacity =
        Number.isFinite(Number(latestEvent?.maxParticipants)) && Number(latestEvent.maxParticipants) > 0
          ? Number(latestEvent.maxParticipants)
          : capacityLimit;
      const latestApproved = Number.isFinite(Number(latestEvent?.approvedAttendeeCount))
        ? Number(latestEvent.approvedAttendeeCount)
        : approvedCount;
      const latestIsFull =
        latestEvent?.isFull === true ||
        (latestCapacity !== null &&
          Number.isFinite(latestApproved) &&
          latestApproved >= latestCapacity);

      if (latestIsFull) {
        Alert.alert("Fully Booked", "All slots are filled for this event. Please pick another event.");
        return;
      }

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
        if (Array.isArray(file)) {
          file.forEach((item) => {
            if (!item) {
              return;
            }
            formData.append(docKey, {
              uri: item.uri,
              name: item.name,
              type: item.mimeType,
            });
          });
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

      setDocuments({ waiver: null, medicalCertificate: null, experienceProof: [], trailPolicy: null });
      setReceipt(null);
      navigation.navigate("ReceiptPage", { event, booking });
      setBookingRequestKey(createIdempotencyKey());
    } catch (err) {
      console.error("Booking failed:", err);
      console.error("Error status:", err.status);
      console.error("Error body:", err.body);
      console.error("Error message:", err.message);
      
      // Extract the most detailed error message available
      const errorMessage = err.body?.error || err.body?.message || err.message || "Something went wrong while booking.";
      const errorDetails = err.body?.details
        ? Object.entries(err.body.details)
            .map(([key, value]) => `${key}: ${value}`)
            .join("\n")
        : null;
      
      // Show a detailed alert with status and error
      Alert.alert(
        "Booking Failed", 
        `${errorMessage}\n\nStatus: ${err.status || 'Unknown'}${errorDetails ? `\n\nDetails:\n${errorDetails}` : ""}\n\nPlease check:\n• Event is published\n• Registration is open\n• Event hasn't started yet`,
        [{ text: "OK" }]
      );
      
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

    if (isEventFull) {
      Alert.alert("Fully Booked", "All slots are filled for this event. Please pick another event or contact the organizer.");
      return;
    }

    const missingDocumentLabels = requiredDocuments
      .filter((docKey) => !hasDocument(docKey))
      .map((docKey) => DOCUMENT_CONFIG[docKey]?.label || docKey);

    const runSubmissionChecks = () => {
      if (requiresReceipt && !receipt) {
        Alert.alert("Receipt Required", "Please upload your payment receipt before submitting.");
        return;
      }

      if (missingDocumentLabels.length) {
        Alert.alert(
          "Documentation Required",
          `Please upload the following before submitting: ${missingDocumentLabels.join(", ")}.`,
        );
        return;
      }

      if (isPolicyPending) {
        Alert.alert(
          "Policy acknowledgement required",
          "Please review the booking policy and agree to the terms before submitting.",
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

    if (hasReadinessBlockers) {
      const message = readinessBlockers.length
        ? `Resolve these before booking:\n• ${readinessBlockers.join('\n• ')}`
        : 'Booking is locked until you meet the organizer requirements.';
      Alert.alert('Booking locked', message);
      return;
    }

    if (readinessWarnings.length && !warningsAcknowledged) {
      const warningBody = `We noticed:\n• ${readinessWarnings.join('\n• ')}`;
      Alert.alert('Check your fit', warningBody, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Update preferences',
          onPress: () => navigation.navigate('PreferencesSetup'),
        },
        {
          text: 'Proceed anyway',
          style: 'destructive',
          onPress: () => {
            setWarningsAcknowledged(true);
            runSubmissionChecks();
          },
        },
      ]);
      return;
    }

    runSubmissionChecks();
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Image source={{ uri: event.imageUrl }} style={styles.image} />
      <Text style={styles.title}>{event.title}</Text>
      <Text style={styles.price}>{priceLabel}</Text>

      <View
        style={[
          styles.slotBanner,
          capacityLimit === null
            ? styles.slotBannerNeutral
            : isEventFull
            ? styles.slotBannerFull
            : styles.slotBannerOpen,
        ]}
      >
        <Text style={styles.slotBannerTitle}>{slotsLabel}</Text>
        <Text style={styles.slotBannerCaption}>
          {capacityLimit === null
            ? "Organizer has not set a headcount limit."
            : slotsLeft > 0
            ? `${slotsLeft} of ${capacityLimit} slots available.`
            : `All ${capacityLimit} slots are filled.`}
        </Text>
      </View>

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

      {hasReadinessBlockers ? (
        <View style={[styles.readinessGate, styles.readinessGateBlocked]}>
          <Text style={styles.readinessGateTitle}>Booking locked for this event</Text>
          {readinessBlockers.map((message, index) => (
            <Text key={`blocker-${index}`} style={styles.readinessGateItem}>
              • {message}
            </Text>
          ))}
          <Text style={styles.readinessGateNote}>
            Update your hiking preferences or choose another event that matches your readiness.
          </Text>
        </View>
      ) : null}

      {!hasReadinessBlockers && readinessWarnings.length ? (
        <View style={[styles.readinessGate, styles.readinessGateWarning]}>
          <Text style={styles.readinessGateTitle}>Heads up before you book</Text>
          {readinessWarnings.map((message, index) => (
            <Text key={`warning-${index}`} style={styles.readinessGateItem}>
              • {message}
            </Text>
          ))}
          <Text style={styles.readinessGateNote}>
            We will remind you about these differences before submitting your booking.
          </Text>
        </View>
      ) : null}

      <View style={styles.policyCard}>
        <Text style={styles.policyCardTitle}>Booking policy</Text>
        <Text style={styles.policyCardBody}>
          Please review the booking terms before submitting. These policies are required for all
          participants.
        </Text>
        <View style={styles.policyList}>
          {BOOKING_POLICY_ITEMS.map((item, index) => (
            <Text key={`policy-${index}`} style={styles.policyListItem}>
              - {item}
            </Text>
          ))}
        </View>
        <TouchableOpacity
          style={styles.policyToggle}
          onPress={() => setPolicyAccepted((prev) => !prev)}
          disabled={loading}
          activeOpacity={0.8}
        >
          <View style={styles.policyCheckbox}>
            {policyAccepted ? <View style={styles.policyCheckboxInner} /> : null}
          </View>
          <Text style={styles.policyText}>
            I have read and agree to the booking policy terms listed above.
          </Text>
        </TouchableOpacity>
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
          <Text style={styles.safetyListItem}>
            - Provide a recent medical certificate when requested, especially for higher-difficulty trails.
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

      {documentationSections.length ? (
        <View style={styles.documentationCard}>
          <Text style={styles.documentationTitle}>Safety & Experience Docs</Text>
          <Text style={styles.documentationSubtitle}>
            {`Organizers review these to enforce trail policies. ${
              isExpertDifficulty
                ? "Expert trails are strict: waiver, medical clearance, and experience proof are all required."
                : "Expert trails are strict; below Expert, experience proof helps and medical clearance strengthens safety."
            }`}
          </Text>

          {documentationSections.map(({ key: docKey, required }) => {
            const config = DOCUMENT_CONFIG[docKey];
            if (!config) {
              return null;
            }
            const docValue = documents[docKey];
            const docList = Array.isArray(docValue) ? docValue : docValue ? [docValue] : [];
            const allowMultiple = Boolean(config.multiple);
            const badgeStyle = required ? styles.documentRequiredBadge : styles.documentOptionalBadge;
            const helperText = required
              ? config.helper
              : `${config.helper} Optional, but it helps organizers confirm you meet the trail policy.`;
            return (
              <View key={docKey} style={styles.documentSection}>
                <View style={styles.documentLabelRow}>
                  <Text style={styles.documentLabel}>{config.label}</Text>
                  <Text style={badgeStyle}>{required ? "Required" : "Optional"}</Text>
                </View>
                <Text style={styles.documentHelper}>{helperText}</Text>
                <TouchableOpacity
                  style={styles.uploadBtn}
                  onPress={() => pickDocument(docKey)}
                  disabled={loading}
                >
                  <Text style={styles.uploadBtnText}>
                    {allowMultiple && docList.length
                      ? `Add another ${config.label}`
                      : docList.length
                        ? `Change ${config.label}`
                        : `Upload ${config.label}`}
                  </Text>
                </TouchableOpacity>
                {docList.length
                  ? docList.map((doc, index) => {
                      const isImage = (doc?.mimeType || "").startsWith("image/");
                      return (
                        <View key={`${docKey}-${index}`} style={styles.previewCard}>
                          {isImage ? (
                            <Image source={{ uri: doc.uri }} style={styles.previewImage} />
                          ) : (
                            <View style={styles.documentPlaceholder}>
                              <Text style={styles.documentPlaceholderText}>PDF attached</Text>
                            </View>
                          )}
                          <View style={styles.previewMeta}>
                            <Text style={styles.previewName} numberOfLines={1}>
                              {allowMultiple ? `${index + 1}. ${doc.name}` : doc.name}
                            </Text>
                            <TouchableOpacity
                              onPress={() => clearDocument(docKey, index)}
                              disabled={loading}
                            >
                              <Text style={styles.removeText}>Remove</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })
                  : null}
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
        style={[
          styles.confirmBtn,
          (loading || isExpertGatePending || isSafetyWaiverPending || isPolicyPending || isEventFull) &&
            styles.disabledBtn,
          (hasReadinessBlockers || isEventFull) && styles.confirmBlocked,
        ]}
        onPress={handleConfirmPress}
        disabled={loading || isEventFull}
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
  slotBanner: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    backgroundColor: "#f9fafb",
    borderColor: "#e5e7eb",
  },
  slotBannerOpen: { backgroundColor: "#ECFDF3", borderColor: "#BBF7D0" },
  slotBannerFull: { backgroundColor: "#FEF2F2", borderColor: "#FECACA" },
  slotBannerNeutral: { backgroundColor: "#F9FAFB", borderColor: "#E5E7EB" },
  slotBannerTitle: { fontSize: 14, fontWeight: "700", color: "#0f172a" },
  slotBannerCaption: { marginTop: 4, fontSize: 12, color: "#475569" },
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
  readinessGate: {
    marginBottom: 16,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  readinessGateBlocked: { backgroundColor: "#fef2f2", borderColor: "#fca5a5" },
  readinessGateWarning: { backgroundColor: "#fff7ed", borderColor: "#fcd34d" },
  readinessGateTitle: { fontSize: 15, fontWeight: "700", color: "#111827", marginBottom: 6 },
  readinessGateItem: { fontSize: 13, color: "#1f2937", lineHeight: 19 },
  readinessGateNote: { marginTop: 8, fontSize: 12, color: "#6b7280" },
  policyCard: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: "#eff6ff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#93c5fd",
  },
  policyCardTitle: { fontSize: 16, fontWeight: "700", color: "#1e3a8a", marginBottom: 6 },
  policyCardBody: {
    fontSize: 13,
    color: "#1e40af",
    lineHeight: 20,
    marginBottom: 10,
  },
  policyList: { marginBottom: 12 },
  policyListItem: { fontSize: 12, color: "#1e3a8a", lineHeight: 18, marginBottom: 6 },
  policyToggle: { flexDirection: "row", alignItems: "flex-start" },
  policyCheckbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: "#2563eb",
    borderRadius: 4,
    marginRight: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#dbeafe",
  },
  policyCheckboxInner: {
    width: 12,
    height: 12,
    borderRadius: 2,
    backgroundColor: "#2563eb",
  },
  policyText: { flex: 1, fontSize: 13, color: "#1e40af", lineHeight: 20 },
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
  confirmBlocked: {
    backgroundColor: "#9ca3af",
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
  documentOptionalBadge: { fontSize: 12, fontWeight: "700", color: "#0ea5e9" },
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
