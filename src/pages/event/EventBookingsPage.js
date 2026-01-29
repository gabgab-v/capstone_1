import React, { useCallback, useEffect, useState } from "react";
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
import { get, put, BASE_URL } from "../../lib/api";
import ScreenHeader from "../../components/ScreenHeader";

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

function getBookingStatusMeta(status) {
  const normalized = typeof status === "string" ? status.toUpperCase() : "PENDING";
  switch (normalized) {
    case "APPROVED":
    case "CONFIRMED":
      return { label: "Approved", color: "#166534", normalized };
    case "REJECTED":
    case "DECLINED":
      return { label: "Rejected", color: "#B91C1C", normalized };
    case "CANCELLED":
      return { label: "Cancelled", color: "#B45309", normalized };
    case "RESCHEDULE_REQUESTED":
      return { label: "Reschedule requested", color: "#D97706", normalized };
    default:
      return { label: "Pending", color: "#1D4ED8", normalized: normalized || "PENDING" };
  }
}

function BookingItem({
  booking,
  onUpdateStatus,
  actionInFlight,
  onViewProfile,
  onReviewRescheduleRequest,
  rescheduleDecisionInFlight,
}) {
  const receiptUrl = resolveReceiptUrl(booking?.paymentUrl);
  const statusMeta = getBookingStatusMeta(booking?.status);
  const normalizedStatus = statusMeta.normalized || "PENDING";
  const isApproved = normalizedStatus === "APPROVED" || normalizedStatus === "CONFIRMED";
  const isRejected = normalizedStatus === "REJECTED" || normalizedStatus === "DECLINED";
  const approving =
    actionInFlight?.bookingId === booking?.id && actionInFlight?.status === "APPROVED";
  const rejecting =
    actionInFlight?.bookingId === booking?.id && actionInFlight?.status === "REJECTED";
  const pending =
    actionInFlight?.bookingId === booking?.id && actionInFlight?.status === "PENDING";
  const disableActions = approving || rejecting || pending;
  const statusBackgroundMap = {
    APPROVED: "#DCFCE7",
    CONFIRMED: "#DCFCE7",
    REJECTED: "#FEE2E2",
    DECLINED: "#FEE2E2",
    CANCELLED: "#FEF3C7",
    RESCHEDULE_REQUESTED: "#FEF3C7",
    DEFAULT: "#DBEAFE",
  };
  const statusBackground = statusBackgroundMap[normalizedStatus] ?? statusBackgroundMap.DEFAULT;

  const renderActionButton = (label, nextStatus, variant, loading) => {
    const variantStyles = {
      approve: {
        container: [styles.actionButton, styles.actionApprove],
        text: [styles.actionButtonText, styles.actionButtonTextLight],
        spinnerColor: "#ffffff",
      },
      pending: {
        container: [styles.actionButton, styles.actionPending],
        text: [styles.actionButtonText, styles.actionButtonTextDark],
        spinnerColor: "#1f2937",
      },
      reject: {
        container: [styles.actionButton, styles.actionReject],
        text: [styles.actionButtonText, styles.actionButtonTextLight],
        spinnerColor: "#ffffff",
      },
    };
    const stylesForVariant = variantStyles[variant] ?? variantStyles.pending;

    return (
      <TouchableOpacity
        key={`${booking?.id}-${label}`}
        style={[
          ...stylesForVariant.container,
          disableActions ? styles.actionButtonDisabled : null,
        ].filter(Boolean)}
        onPress={() => onUpdateStatus?.(booking?.id, nextStatus)}
        disabled={disableActions}
        activeOpacity={0.85}
      >
        {loading ? (
          <ActivityIndicator size="small" color={stylesForVariant.spinnerColor} />
        ) : (
          <Text
            style={[
              ...stylesForVariant.text,
              disableActions ? styles.actionButtonTextDisabled : null,
            ].filter(Boolean)}
          >
            {label}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  const bookingUserId = booking?.user?.id ?? booking?.userId ?? null;
  const canViewProfile = typeof onViewProfile === "function" && Boolean(bookingUserId);
  const cancellationReason =
    typeof booking?.cancellationReason === "string" && booking.cancellationReason.trim().length
      ? booking.cancellationReason.trim()
      : null;
  const rescheduleReason =
    typeof booking?.rescheduleReason === "string" && booking.rescheduleReason.trim().length
      ? booking.rescheduleReason.trim()
      : null;
  const rescheduleApprovalStatus =
    typeof booking?.rescheduleApprovalStatus === "string" &&
    booking.rescheduleApprovalStatus.trim().length
      ? booking.rescheduleApprovalStatus.trim().toUpperCase()
      : null;
  const rescheduleApprovalLabel =
    rescheduleApprovalStatus === "APPROVED"
      ? "Approved"
      : rescheduleApprovalStatus === "REJECTED"
        ? "Rejected"
        : rescheduleApprovalStatus === "PENDING"
          ? "Pending"
          : rescheduleApprovalStatus;
  const isRescheduleRequest = normalizedStatus === "RESCHEDULE_REQUESTED";
  const canReviewReschedule =
    isRescheduleRequest && typeof onReviewRescheduleRequest === "function";
  const decisionInFlight =
    rescheduleDecisionInFlight?.bookingId === booking?.id
      ? rescheduleDecisionInFlight
      : null;
  const approvingDecision = decisionInFlight?.decision === "APPROVED";
  const rejectingDecision = decisionInFlight?.decision === "REJECTED";
  const reviewDisabled = Boolean(decisionInFlight);
  const showReviewActions =
    canReviewReschedule && (!rescheduleApprovalStatus || rescheduleApprovalStatus === "PENDING");

  const actionButtons = [];
  if (!isApproved) {
    actionButtons.push(renderActionButton("Approve", "APPROVED", "approve", approving));
  }
  if (normalizedStatus !== "PENDING") {
    actionButtons.push(renderActionButton("Mark pending", "PENDING", "pending", pending));
  }
  if (!isRejected) {
    actionButtons.push(renderActionButton("Reject", "REJECTED", "reject", rejecting));
  }

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
      {canViewProfile ? (
        <TouchableOpacity
          style={styles.profileLink}
          onPress={() => onViewProfile(bookingUserId)}
          activeOpacity={0.75}
        >
          <Text style={styles.profileLinkText}>Go to profile</Text>
        </TouchableOpacity>
      ) : null}
      <Text style={styles.amountLabel}>Paid: {formatAmount(booking?.totalAmount)}</Text>
      <Text style={styles.referenceLabel}>Reference: {booking?.id}</Text>
      {isRescheduleRequest ? (
        <View style={styles.rescheduleReview}>
          <Text style={styles.rescheduleReviewTitle}>Reschedule request</Text>
          {rescheduleReason ? (
            <Text style={styles.reasonText}>Reason: {rescheduleReason}</Text>
          ) : null}
          <Text style={styles.rescheduleReviewStatus}>
            Organizer decision: {rescheduleApprovalLabel || "Pending"}
          </Text>
          {showReviewActions ? (
            <View style={styles.rescheduleReviewActions}>
              <TouchableOpacity
                style={[
                  styles.reviewButton,
                  styles.reviewApprove,
                  reviewDisabled ? styles.reviewButtonDisabled : null,
                ]}
                onPress={() => onReviewRescheduleRequest?.(booking?.id, "APPROVED")}
                disabled={reviewDisabled}
                activeOpacity={0.85}
              >
                {approvingDecision ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.reviewButtonText}>Approve request</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.reviewButton,
                  styles.reviewReject,
                  reviewDisabled ? styles.reviewButtonDisabled : null,
                ]}
                onPress={() => onReviewRescheduleRequest?.(booking?.id, "REJECTED")}
                disabled={reviewDisabled}
                activeOpacity={0.85}
              >
                {rejectingDecision ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.reviewButtonText}>Decline request</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      ) : null}
      {!isRescheduleRequest && rescheduleReason ? (
        <Text style={styles.reasonText}>Reschedule reason: {rescheduleReason}</Text>
      ) : null}
      {!isRescheduleRequest && rescheduleApprovalStatus ? (
        <Text style={styles.reasonText}>Reschedule vote: {rescheduleApprovalLabel}</Text>
      ) : null}
      {cancellationReason ? (
        <Text style={styles.reasonText}>Cancellation reason: {cancellationReason}</Text>
      ) : null}
      <View style={styles.statusRow}>
        <Text style={styles.statusLabel}>Status</Text>
        <View
          style={[
            styles.statusPill,
            { backgroundColor: statusBackground, borderColor: statusMeta.color },
          ]}
        >
          <Text style={[styles.statusPillText, { color: statusMeta.color }]}>
            {statusMeta.label}
          </Text>
        </View>
      </View>
      {receiptUrl ? (
        <TouchableOpacity style={styles.receiptButton} onPress={handleOpenReceipt}>
          <Text style={styles.receiptButtonText}>View receipt</Text>
        </TouchableOpacity>
      ) : (
        <Text style={styles.noReceipt}>No receipt uploaded</Text>
      )}
      {actionButtons.length ? <View style={styles.actionBar}>{actionButtons}</View> : null}
    </View>
  );
}

export default function EventBookingsPage({ route, navigation }) {
  const { eventId, title } = route.params;
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionInFlight, setActionInFlight] = useState(null);
  const [rescheduleDecisionInFlight, setRescheduleDecisionInFlight] = useState(null);
  const [showPollVoters, setShowPollVoters] = useState(false);
  const [eventMeta, setEventMeta] = useState(null);

  const handleViewProfile = useCallback(
    (userId) => {
      if (!userId) {
        return;
      }
      navigation.navigate("UserProfile", { userId });
    },
    [navigation]
  );

  const pollVotes = bookings.reduce(
    (acc, booking) => {
      const status = typeof booking?.rescheduleApprovalStatus === "string"
        ? booking.rescheduleApprovalStatus.toUpperCase()
        : null;
      if (status === "APPROVED") {
        acc.approved.push(booking);
      } else if (status === "REJECTED") {
        acc.rejected.push(booking);
      }
      return acc;
    },
    { approved: [], rejected: [] },
  );
  const getVoterName = (booking) => booking?.user?.name || "Anonymous";
  const pollActive = Boolean(eventMeta?.rescheduledAt);

  useEffect(() => {
    let isMounted = true;
    const fetchBookings = async () => {
      try {
        const [data, eventData] = await Promise.all([
          get(`/api/events/${eventId}/bookings`),
          get(`/api/events/${eventId}`).catch((error) => {
            console.error("Failed to fetch event meta:", error);
            return null;
          }),
        ]);
        if (isMounted) {
          setBookings(Array.isArray(data) ? data : []);
          setEventMeta(eventData?.id ? eventData : null);
        }
      } catch (err) {
        console.error("Failed to fetch bookings:", err);
        if (isMounted) {
          setBookings([]);
          setEventMeta(null);
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

  const handleReviewRescheduleRequest = useCallback(
    async (bookingId, decision) => {
      if (!bookingId || !decision) {
        return;
      }
      setRescheduleDecisionInFlight({ bookingId, decision });
      try {
        const updated = await put(`/api/bookings/${bookingId}`, {
          rescheduleApprovalStatus: decision,
        });
        setBookings((prev) =>
          Array.isArray(prev)
            ? prev.map((item) => (item?.id === updated?.id ? updated : item))
            : prev,
        );
      } catch (error) {
        const message =
          error?.body?.error ||
          error?.message ||
          "Unable to review the reschedule request right now.";
        Alert.alert("Reschedule review failed", message);
      } finally {
        setRescheduleDecisionInFlight(null);
      }
    },
    [],
  );

  const handleUpdateStatus = useCallback(
    async (bookingId, nextStatus) => {
      if (!bookingId || !nextStatus) {
        return;
      }
      setActionInFlight({ bookingId, status: nextStatus });
      try {
        const updated = await put(`/api/bookings/${bookingId}`, { status: nextStatus });
        setBookings((prev) =>
          Array.isArray(prev)
            ? prev.map((item) => (item?.id === updated?.id ? { ...item, ...updated } : item))
            : prev,
        );
      } catch (error) {
        const message =
          error?.body?.error || error?.message || "Failed to update booking status.";
        Alert.alert("Update failed", message);
      } finally {
        setActionInFlight(null);
      }
    },
    [],
  );

  if (loading) {
    return (
      <View style={styles.screen}>
        <ScreenHeader navigation={navigation} title={title || "Event Bookings"} />
        <View style={[styles.center, styles.loadingContainer]}>
          <ActivityIndicator size="large" color="#2E7D32" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        navigation={navigation}
        title={title || "Event Bookings"}
        subtitle="Manage attendee statuses and receipts"
      />
      <View style={styles.container}>
        <Text style={styles.title}>Bookings for {title}</Text>

        {pollActive ? (
          <View style={styles.pollCard}>
            <View style={styles.pollHeader}>
              <Text style={styles.pollTitle}>Reschedule poll votes</Text>
              <TouchableOpacity onPress={() => setShowPollVoters((prev) => !prev)}>
                <Text style={styles.pollToggle}>
                  {showPollVoters ? "Hide voters" : "View voters"}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.pollMeta}>
              Approved: {pollVotes.approved.length} · Rejected: {pollVotes.rejected.length}
            </Text>
            {showPollVoters ? (
              <View style={styles.pollList}>
                <View style={styles.pollGroup}>
                  <Text style={styles.pollGroupTitle}>
                    Approve ({pollVotes.approved.length})
                  </Text>
                  {pollVotes.approved.length ? (
                    pollVotes.approved.map((booking) => (
                      <Text key={booking?.id} style={styles.pollVoter}>
                        {getVoterName(booking)}
                      </Text>
                    ))
                  ) : (
                    <Text style={styles.pollEmpty}>No approvals yet.</Text>
                  )}
                </View>
                <View style={styles.pollGroup}>
                  <Text style={styles.pollGroupTitle}>
                    Decline ({pollVotes.rejected.length})
                  </Text>
                  {pollVotes.rejected.length ? (
                    pollVotes.rejected.map((booking) => (
                      <Text key={booking?.id} style={styles.pollVoter}>
                        {getVoterName(booking)}
                      </Text>
                    ))
                  ) : (
                    <Text style={styles.pollEmpty}>No declines yet.</Text>
                  )}
                </View>
              </View>
            ) : null}
          </View>
        ) : null}

        {bookings.length === 0 ? (
          <Text style={styles.emptyText}>No users booked this event yet.</Text>
        ) : (
          <FlatList
            data={bookings}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <BookingItem
                booking={item}
                onUpdateStatus={handleUpdateStatus}
                actionInFlight={actionInFlight}
                onViewProfile={handleViewProfile}
                onReviewRescheduleRequest={handleReviewRescheduleRequest}
                rescheduleDecisionInFlight={rescheduleDecisionInFlight}
              />
            )}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  container: { flex: 1, padding: 16 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingContainer: { padding: 16 },
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
  profileLink: { alignSelf: "flex-start", marginBottom: 8 },
  profileLinkText: { fontSize: 12, fontWeight: "600", color: "#1d4ed8" },
  amountLabel: { fontSize: 14, fontWeight: "600", color: "#047857" },
  referenceLabel: { fontSize: 12, color: "#6b7280", marginTop: 4 },
  reasonText: { fontSize: 12, color: "#6b7280", marginTop: 6, lineHeight: 18 },
  rescheduleReview: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#fff7ed",
    borderWidth: 1,
    borderColor: "#fed7aa",
  },
  rescheduleReviewTitle: { fontSize: 13, fontWeight: "700", color: "#9a3412" },
  rescheduleReviewStatus: { fontSize: 12, color: "#7c2d12", marginTop: 4 },
  rescheduleReviewActions: { flexDirection: "row", marginTop: 8 },
  reviewButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    marginRight: 8,
  },
  reviewApprove: { backgroundColor: "#16a34a" },
  reviewReject: { backgroundColor: "#dc2626" },
  reviewButtonText: { color: "#ffffff", fontSize: 12, fontWeight: "700" },
  reviewButtonDisabled: { opacity: 0.7 },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    marginBottom: 10,
    justifyContent: "space-between",
  },
  statusLabel: { fontSize: 13, fontWeight: "600", color: "#475569" },
  statusPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusPillText: { fontSize: 12, fontWeight: "700" },
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
  actionBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 12,
  },
  actionButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    marginRight: 8,
    marginBottom: 8,
  },
  actionApprove: { backgroundColor: "#166534", borderColor: "#166534" },
  actionPending: { backgroundColor: "#f8fafc", borderColor: "#cbd5f5" },
  actionReject: { backgroundColor: "#b91c1c", borderColor: "#b91c1c" },
  actionButtonDisabled: { opacity: 0.7 },
  actionButtonText: { fontSize: 12, fontWeight: "700" },
  actionButtonTextLight: { color: "#ffffff" },
  actionButtonTextDark: { color: "#1f2937" },
  actionButtonTextDisabled: { opacity: 0.7 },
  pollCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    marginBottom: 16,
  },
  pollHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  pollTitle: { fontSize: 15, fontWeight: "700", color: "#0f172a" },
  pollToggle: { fontSize: 12, fontWeight: "600", color: "#1d4ed8" },
  pollMeta: { fontSize: 12, color: "#475569", marginBottom: 8 },
  pollList: { },
  pollGroup: { marginBottom: 6 },
  pollGroupTitle: { fontSize: 12, fontWeight: "700", color: "#1f2937" },
  pollVoter: { fontSize: 12, color: "#475569", marginTop: 2 },
  pollEmpty: { fontSize: 12, color: "#94a3b8", marginTop: 2 },
});
