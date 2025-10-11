import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Icon from "react-native-vector-icons/Feather";
import { useFocusEffect } from "@react-navigation/native";
import { get, put, BASE_URL } from "../../lib/api";

const EVENT_IMAGE_PLACEHOLDER = "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee";
const AVATAR_COLORS = ["#DCFCE7", "#E0F2FE", "#FDE68A", "#FCE7F3", "#EDE9FE", "#FFE4E6"];

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

function formatPrice(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    return "Free";
  }
  return `PHP ${amount.toLocaleString()}`;
}

function formatDateTime(value) {
  if (!value) {
    return "Booked date pending";
  }
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return "Booked date pending";
  }
  const dateLabel = date.toLocaleDateString();
  const timeLabel = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `${dateLabel} at ${timeLabel}`;
}

function truncate(text, limit = 160) {
  if (typeof text !== "string") {
    return null;
  }
  const trimmed = text.trim();
  if (trimmed.length <= limit) {
    return trimmed;
  }
  return `${trimmed.slice(0, limit - 3)}...`;
}

function getLocationLabel(event) {
  if (!event) {
    return "Location to follow";
  }
  if (typeof event.locationName === "string" && event.locationName.trim().length) {
    return event.locationName.trim();
  }
  const lat = Number(event.locationLatitude);
  const lng = Number(event.locationLongitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return `Lat ${lat.toFixed(3)}, Lon ${lng.toFixed(3)}`;
  }
  return "Location to follow";
}

function getEventMetrics(event) {
  if (!event) {
    return [];
  }
  const metrics = [];
  const distance = Number(event.distanceKm);
  if (Number.isFinite(distance) && distance > 0) {
    metrics.push({ key: "distance", label: `${distance.toFixed(1)} km` });
  }
  const duration = Number(event.durationHrs);
  if (Number.isFinite(duration) && duration > 0) {
    metrics.push({ key: "duration", label: `${duration.toFixed(1)} hrs` });
  }
  const elevation = Number(event.elevationM);
  if (Number.isFinite(elevation) && elevation > 0) {
    metrics.push({ key: "elevation", label: `${elevation.toFixed(0)} m elevation` });
  }
  const steps = Number(event.steps);
  if (Number.isFinite(steps) && steps > 0) {
    metrics.push({ key: "steps", label: `${steps.toLocaleString()} steps` });
  }
  return metrics;
}

function getStatusStyles(status) {
  const normalized = typeof status === "string" ? status.toUpperCase() : "PENDING";
  switch (normalized) {
    case "CONFIRMED":
    case "APPROVED":
      return { backgroundColor: "#DCFCE7", color: "#166534", label: normalized };
    case "DECLINED":
    case "CANCELLED":
      return { backgroundColor: "#FEE2E2", color: "#991B1B", label: normalized };
    default:
      return { backgroundColor: "#E0F2FE", color: "#1D4ED8", label: normalized || "PENDING" };
  }
}

function getInitials(name, email) {
  if (typeof name === "string" && name.trim().length) {
    const parts = name.trim().split(/\s+/).slice(0, 2);
    const letters = parts.map((part) => part.charAt(0).toUpperCase()).filter(Boolean);
    if (letters.length) {
      return letters.join("");
    }
  }
  if (typeof email === "string" && email.trim().length) {
    return email.trim().charAt(0).toUpperCase();
  }
  return "?";
}

function getTimeValue(value) {
  const ms = new Date(value || 0).valueOf();
  return Number.isFinite(ms) ? ms : 0;
}

function AttendeeRow({ attendee, index }) {
  const initials = getInitials(attendee?.user?.name, attendee?.user?.email);
  const avatarColor = AVATAR_COLORS[index % AVATAR_COLORS.length];
  const receiptUrl = resolveReceiptUrl(attendee?.paymentUrl);
  const handleOpenReceipt = useCallback(() => {
    if (!receiptUrl) {
      return;
    }
    Linking.openURL(receiptUrl).catch(() => {
      Alert.alert("Unable to open receipt", "We couldn't open the receipt link. Please try again later.");
    });
  }, [receiptUrl]);
  return (
    <View style={styles.attendeeRow}>
      <View style={[styles.attendeeAvatar, { backgroundColor: avatarColor }]}>
        <Text style={styles.attendeeAvatarText}>{initials}</Text>
      </View>
      <View style={styles.attendeeDetails}>
        <Text style={styles.attendeeName}>{attendee?.user?.name || "Anonymous hiker"}</Text>
        <Text style={styles.attendeeEmail}>{attendee?.user?.email || "No email provided"}</Text>
      </View>
      <View style={styles.attendeeMeta}>
        <Text style={styles.attendeeAmount}>{formatPrice(attendee?.totalAmount)}</Text>
        {receiptUrl ? (
          <TouchableOpacity style={styles.receiptLink} onPress={handleOpenReceipt}>
            <Text style={styles.receiptLinkText}>View receipt</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.noReceiptText}>No receipt</Text>
        )}
      </View>
    </View>
  );
}

function BookingCard({ booking, onOpenEvent, onCancelBooking, isCancelling }) {
  const event = booking?.event ?? null;
  const bannerSource = event?.imageUrl ? { uri: event.imageUrl } : { uri: EVENT_IMAGE_PLACEHOLDER };
  const priceLabel = formatPrice(event?.price);
  const amountPaid = formatPrice(booking?.totalAmount);
  const locationLabel = getLocationLabel(event);
  const metrics = getEventMetrics(event);
  const overview = truncate(event?.overview);
  const statusStyles = getStatusStyles(booking?.status);
  const bookedAtLabel = formatDateTime(booking?.createdAt);
  const normalizedStatus =
    typeof booking?.status === "string" ? booking.status.toUpperCase() : "PENDING";
  const canCancel = normalizedStatus === "PENDING" && typeof onCancelBooking === "function";

  return (
    <View style={styles.card}>
      <Image source={bannerSource} style={styles.cardImage} />
      <View style={styles.cardBody}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>{event?.title || "Untitled event"}</Text>
          <Text style={styles.priceTag}>{priceLabel}</Text>
        </View>

        <View style={styles.chipRow}>
          <View style={[styles.statusChip, { backgroundColor: statusStyles.backgroundColor }]}>
            <Text style={[styles.statusText, { color: statusStyles.color }]}>{statusStyles.label}</Text>
          </View>
          <View style={styles.statusDivider} />
          <Text style={styles.bookedAtLabel}>{bookedAtLabel}</Text>
        </View>

        <View style={styles.infoRow}>
          <Icon name="map-pin" size={16} color="#2E7D32" style={styles.infoIcon} />
          <Text style={styles.infoText}>{locationLabel}</Text>
        </View>
        <View style={styles.infoRow}>
          <Icon name="credit-card" size={16} color="#2E7D32" style={styles.infoIcon} />
          <Text style={styles.infoText}>Paid {amountPaid}</Text>
        </View>

        {overview ? <Text style={styles.overviewText}>{overview}</Text> : null}

        {metrics.length ? (
          <View style={styles.metricRow}>
            {metrics.map((metric) => (
              <View key={metric.key} style={styles.metricChip}>
                <Text style={styles.metricText}>{metric.label}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <TouchableOpacity
          style={styles.primaryButton}
          activeOpacity={0.9}
          onPress={() => onOpenEvent(event)}
          disabled={!event}
        >
          <Text style={styles.primaryButtonText}>View Event Details</Text>
        </TouchableOpacity>
        {canCancel ? (
          <TouchableOpacity
            style={[styles.cancelButton, isCancelling ? styles.cancelButtonDisabled : null]}
            activeOpacity={0.85}
            onPress={() => onCancelBooking(booking)}
            disabled={isCancelling}
          >
            {isCancelling ? (
              <ActivityIndicator size="small" color="#B91C1C" />
            ) : (
              <Text style={styles.cancelButtonText}>Cancel Booking</Text>
            )}
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

function OrganizerEventCard({ event, attendees, onViewDetails, onViewBookings }) {
  const bannerSource = event?.imageUrl ? { uri: event.imageUrl } : { uri: EVENT_IMAGE_PLACEHOLDER };
  const priceLabel = formatPrice(event?.price);
  const locationLabel = getLocationLabel(event);
  const metrics = getEventMetrics(event);
  const overview = truncate(event?.overview);
  const attendeeCount = Array.isArray(attendees) ? attendees.length : 0;
  const totalRevenue = Array.isArray(attendees)
    ? attendees.reduce((sum, booking) => sum + (Number(booking?.totalAmount) || 0), 0)
    : 0;
  const revenueLabel = formatPrice(totalRevenue);

  return (
    <View style={styles.card}>
      <Image source={bannerSource} style={styles.cardImage} />
      <View style={styles.cardBody}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>{event?.title || "Untitled event"}</Text>
          <Text style={styles.priceTag}>{priceLabel}</Text>
        </View>

        <View style={styles.metricSummary}>
          <View style={styles.summaryItem}>
            <Icon name="users" size={16} color="#2E7D32" style={styles.summaryIcon} />
            <Text style={styles.summaryLabel}>
              {attendeeCount} {attendeeCount === 1 ? "booking" : "bookings"}
            </Text>
          </View>
          <View style={styles.summaryItem}>
            <Icon name="dollar-sign" size={16} color="#2E7D32" style={styles.summaryIcon} />
            <Text style={styles.summaryLabel}>{revenueLabel}</Text>
          </View>
        </View>

        <View style={styles.infoRow}>
          <Icon name="map-pin" size={16} color="#2E7D32" style={styles.infoIcon} />
          <Text style={styles.infoText}>{locationLabel}</Text>
        </View>

        {overview ? <Text style={styles.overviewText}>{overview}</Text> : null}

        {metrics.length ? (
          <View style={styles.metricRow}>
            {metrics.map((metric) => (
              <View key={metric.key} style={styles.metricChip}>
                <Text style={styles.metricText}>{metric.label}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.attendeeSection}>
          <View style={styles.sectionSubHeader}>
            <Text style={styles.sectionSubTitle}>Attendees</Text>
            <Text style={styles.sectionSubMeta}>
              {attendeeCount ? `${attendeeCount} total` : "No bookings yet"}
            </Text>
          </View>

          {attendeeCount ? (
            attendees.map((booking, index) => (
              <AttendeeRow key={booking?.id || index} attendee={booking} index={index} />
            ))
          ) : (
            <Text style={styles.emptyStateText}>
              No bookings yet. Share your event to reach more hikers.
            </Text>
          )}
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.secondaryButton}
            activeOpacity={0.85}
            onPress={() => onViewDetails(event)}
            disabled={!event}
          >
            <Icon name="eye" size={16} color="#2E7D32" />
            <Text style={styles.secondaryButtonText}>View Event</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryButton, styles.secondaryButtonAlt]}
            activeOpacity={0.85}
            onPress={() => onViewBookings(event)}
            disabled={!event?.id}
          >
            <Icon name="list" size={16} color="#fff" />
            <Text style={[styles.secondaryButtonText, styles.secondaryButtonTextAlt]}>
              Manage Bookings
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export default function EventsPage({ navigation }) {
  const [user, setUser] = useState(null);
  const [bookedEvents, setBookedEvents] = useState([]);
  const [createdEvents, setCreatedEvents] = useState([]);
  const [eventAttendees, setEventAttendees] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cancellingBookingId, setCancellingBookingId] = useState(null);

  const hasLoadedRef = useRef(false);

  const sortedBookings = useMemo(() => {
    return [...bookedEvents].sort((a, b) => getTimeValue(b?.createdAt) - getTimeValue(a?.createdAt));
  }, [bookedEvents]);

  const sortedCreatedEvents = useMemo(() => {
    return [...createdEvents].sort((a, b) => getTimeValue(b?.createdAt) - getTimeValue(a?.createdAt));
  }, [createdEvents]);

  const fetchData = useCallback(
    async ({ showSpinner = false, useRefreshControl = false } = {}) => {
      if (showSpinner) {
        setLoading(true);
      }
      if (useRefreshControl) {
        setRefreshing(true);
      }

      try {
        const currentUser = await get("/api/users/me");
        setUser(currentUser ?? null);

        const bookingsPromise = get("/api/bookings").catch((error) => {
          console.error("Failed to fetch bookings:", error);
          return [];
        });

        const eventsPromise =
          currentUser?.role === "ORGANIZER"
            ? get("/api/events").catch((error) => {
                console.error("Failed to fetch organizer events:", error);
                return [];
              })
            : Promise.resolve([]);

        const [bookingsData, eventsData] = await Promise.all([bookingsPromise, eventsPromise]);

        setBookedEvents(Array.isArray(bookingsData) ? bookingsData : []);

        if (currentUser?.role === "ORGANIZER") {
          const myEvents = Array.isArray(eventsData)
            ? eventsData.filter((event) => event.organizerId === currentUser.id)
            : [];

          setCreatedEvents(myEvents);

          if (myEvents.length) {
            const attendeeEntries = await Promise.all(
              myEvents.map(async (event) => {
                try {
                  const attendees = await get(`/api/events/${event.id}/bookings`);
                  return [event.id, Array.isArray(attendees) ? attendees : []];
                } catch (error) {
                  console.error(`Failed to fetch bookings for event ${event.id}:`, error);
                  return [event.id, []];
                }
              })
            );
            setEventAttendees(Object.fromEntries(attendeeEntries));
          } else {
            setEventAttendees({});
          }
        } else {
          setCreatedEvents([]);
          setEventAttendees({});
        }
      } catch (error) {
        console.error("Failed to fetch events page data:", error);
        setUser(null);
        setBookedEvents([]);
        setCreatedEvents([]);
        setEventAttendees({});
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  const handleRefresh = useCallback(() => {
    fetchData({ useRefreshControl: true });
  }, [fetchData]);

  const handleOpenEvent = useCallback(
    (event) => {
      if (!event) {
        return;
      }
      navigation.navigate("EventDetails", { event });
    },
    [navigation]
  );

  const cancelBooking = useCallback(
    async (bookingId) => {
      if (!bookingId) {
        return;
      }

      setCancellingBookingId(bookingId);
      try {
        const updatedBooking = await put(`/api/bookings/${bookingId}`, { status: "CANCELLED" });
        setBookedEvents((prev) =>
          Array.isArray(prev)
            ? prev.map((item) => (item?.id === updatedBooking?.id ? { ...item, ...updatedBooking } : item))
            : prev,
        );
        Alert.alert("Booking cancelled", "Your booking has been cancelled successfully.");
      } catch (error) {
        const message =
          error?.body?.error ||
          error?.message ||
          "We couldn't cancel your booking right now. Please try again.";
        Alert.alert("Cancellation failed", message);
      } finally {
        setCancellingBookingId(null);
      }
    },
    [],
  );

  const handleCancelBooking = useCallback(
    (booking) => {
      if (!booking?.id) {
        return;
      }

      Alert.alert(
        "Cancel booking?",
        "This will release your spot for other hikers. You can book again if slots remain open.",
        [
          { text: "Keep Booking", style: "cancel" },
          {
            text: "Cancel Booking",
            style: "destructive",
            onPress: () => cancelBooking(booking.id),
          },
        ],
        { cancelable: true },
      );
    },
    [cancelBooking],
  );

  const handleViewBookings = useCallback(
    (event) => {
      if (!event?.id) {
        return;
      }
      navigation.navigate("EventBookings", {
        eventId: event.id,
        title: event.title || "Event bookings",
      });
    },
    [navigation]
  );

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      const run = async () => {
        await fetchData({ showSpinner: !hasLoadedRef.current });
        if (isActive) {
          hasLoadedRef.current = true;
        }
      };

      run();

      return () => {
        isActive = false;
      };
    }, [fetchData])
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2E7D32" />
      </View>
    );
  }



  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor="#2E7D32"
          colors={["#2E7D32"]}
        />
      }
    >
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>My Bookings</Text>
          <Text style={styles.sectionMeta}>{sortedBookings.length} total</Text>
        </View>

        {sortedBookings.length ? (
          sortedBookings.map((booking) => (
            <BookingCard
              key={booking?.id || booking?.eventId}
              booking={booking}
              onOpenEvent={handleOpenEvent}
              onCancelBooking={handleCancelBooking}
              isCancelling={cancellingBookingId === (booking?.id || null)}
            />
          ))
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No bookings yet</Text>
            <Text style={styles.emptyText}>
              Explore new adventures in Discover and lock in your spot once you find an event you love.
            </Text>
          </View>
        )}
      </View>

      {user?.role === "ORGANIZER" ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Events I Host</Text>
            <Text style={styles.sectionMeta}>{sortedCreatedEvents.length} total</Text>
          </View>

          {sortedCreatedEvents.length ? (
            sortedCreatedEvents.map((event) => (
              <OrganizerEventCard
                key={event?.id}
                event={event}
                attendees={eventAttendees[event.id] || []}
                onViewDetails={handleOpenEvent}
                onViewBookings={handleViewBookings}
              />
            ))
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No events yet</Text>
              <Text style={styles.emptyText}>
                Create your first event to start accepting bookings and grow your hiking community.
              </Text>
            </View>
          )}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  contentContainer: { padding: 16, paddingBottom: 32 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#FFFFFF" },
  section: { marginBottom: 30 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  sectionTitle: { fontSize: 20, fontWeight: "700", color: "#1F2937" },
  sectionMeta: { fontSize: 14, color: "#64748B" },
  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 20,
  },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#1F2937", marginBottom: 6 },
  emptyText: { fontSize: 14, color: "#64748B", lineHeight: 20 },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 18,
    shadowColor: "#0F172A",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  cardImage: { width: "100%", height: 160, backgroundColor: "#E2E8F0" },
  cardBody: { padding: 16 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { flex: 1, fontSize: 18, fontWeight: "700", color: "#1F2937", marginRight: 12 },
  priceTag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#DCFCE7",
    borderRadius: 999,
    color: "#166534",
    fontSize: 12,
    fontWeight: "600",
  },
  chipRow: { flexDirection: "row", alignItems: "center", marginTop: 12, marginBottom: 12 },
  statusChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusText: { fontSize: 12, fontWeight: "700", textTransform: "uppercase" },
  statusDivider: { width: 1, height: 16, backgroundColor: "#E5E7EB", marginHorizontal: 10 },
  bookedAtLabel: { fontSize: 12, color: "#64748B", fontWeight: "500" },
  infoRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  infoIcon: { marginRight: 8 },
  infoText: { flex: 1, fontSize: 14, color: "#4B5563" },
  overviewText: { fontSize: 14, color: "#374151", lineHeight: 20, marginTop: 6 },
  metricRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 12, marginBottom: 10 },
  metricChip: {
    backgroundColor: "#EFF6FF",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    marginBottom: 8,
  },
  metricText: { fontSize: 12, fontWeight: "600", color: "#1D4ED8" },
  primaryButton: {
    marginTop: 14,
    backgroundColor: "#2E7D32",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  primaryButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  cancelButton: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#B91C1C",
    backgroundColor: "#FEF2F2",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  cancelButtonText: { color: "#B91C1C", fontSize: 14, fontWeight: "700" },
  cancelButtonDisabled: { opacity: 0.7 },
  metricSummary: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    marginBottom: 14,
  },
  summaryItem: { flexDirection: "row", alignItems: "center" },
  summaryIcon: { marginRight: 8 },
  summaryLabel: { fontSize: 13, fontWeight: "600", color: "#1F2937" },
  attendeeSection: { marginTop: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#E2E8F0" },
  sectionSubHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 6,
  },
  sectionSubTitle: { fontSize: 15, fontWeight: "700", color: "#1F2937" },
  sectionSubMeta: { fontSize: 12, color: "#94A3B8" },
  attendeeRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
  attendeeAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  attendeeAvatarText: { fontSize: 13, fontWeight: "700", color: "#1F2937" },
  attendeeDetails: { flex: 1 },
  attendeeName: { fontSize: 14, fontWeight: "600", color: "#1F2937" },
  attendeeEmail: { fontSize: 12, color: "#64748B" },
  attendeeMeta: { alignItems: "flex-end", marginLeft: 8 },
  attendeeAmount: { fontSize: 12, fontWeight: "700", color: "#2E7D32", textAlign: "right" },
  receiptLink: { marginTop: 4 },
  receiptLinkText: { fontSize: 12, fontWeight: "700", color: "#1D4ED8" },
  noReceiptText: { fontSize: 12, color: "#9CA3AF", marginTop: 4, textAlign: "right" },
  emptyStateText: { fontSize: 13, color: "#94A3B8", lineHeight: 18 },
  actionRow: { flexDirection: "row", marginTop: 20 },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#2E7D32",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    marginRight: 12,
  },
  secondaryButtonAlt: { backgroundColor: "#2E7D32", borderColor: "#2E7D32" },
  secondaryButtonText: { marginLeft: 8, color: "#2E7D32", fontSize: 13, fontWeight: "600" },
  secondaryButtonTextAlt: { color: "#FFFFFF" },
});




