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
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { get, put, patch, BASE_URL } from "../../lib/api";
import ScreenHeader from "../../components/ScreenHeader";
import { Picker } from "@react-native-picker/picker";
import { useTheme } from "../../context/ThemeContext";

const EVENT_IMAGE_PLACEHOLDER = "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee";
const AVATAR_COLORS = ["#DCFCE7", "#E0F2FE", "#FDE68A", "#FCE7F3", "#EDE9FE", "#FFE4E6"];

function useEventStyles() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme.colors), [theme.colors]);
  return { styles, colors: theme.colors, theme };
}

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

const EVENT_STATUS_OPTIONS = [
  { value: "PUBLISHED", label: "Published (visible)" },
  { value: "DRAFT", label: "Draft" },
  { value: "CLOSED", label: "Closed (stop new bookings)" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

const EVENT_STATUS_BADGES = {
  PUBLISHED: { label: "Published", background: "#DCFCE7", color: "#166534" },
  DRAFT: { label: "Draft", background: "#E0F2FE", color: "#1D4ED8" },
  CLOSED: { label: "Closed", background: "#FEF3C7", color: "#92400E" },
  COMPLETED: { label: "Completed", background: "#E5E7EB", color: "#374151" },
  CANCELLED: { label: "Cancelled", background: "#FEE2E2", color: "#B91C1C" },
};

const CLOSING_SOON_THRESHOLD_HOURS = 72;

function parseDateValue(value) {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.valueOf()) ? null : value;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

function formatEventDateTime(value) {
  const date = parseDateValue(value);
  if (!date) {
    return null;
  }
  const dateLabel = date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const timeLabel = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `${dateLabel} at ${timeLabel}`;
}

function formatRelativeToNow(value) {
  const date = parseDateValue(value);
  if (!date) {
    return null;
  }
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  if (diffMs <= 0) {
    return null;
  }
  const diffMinutes = Math.round(diffMs / 60000);
  if (diffMinutes < 60) {
    if (diffMinutes <= 1) {
      return "in about a minute";
    }
    return `in ${diffMinutes} minutes`;
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 48) {
    if (diffHours === 1) {
      return "in 1 hour";
    }
    return `in ${diffHours} hours`;
  }
  const diffDays = Math.round(diffHours / 24);
  if (diffDays === 1) {
    return "in 1 day";
  }
  return `in ${diffDays} days`;
}

function computeEventScheduleFlags(event) {
  const startsAt = parseDateValue(event?.startsAt);
  const closesAt = parseDateValue(event?.registrationClosesAt);
  const endsAt = parseDateValue(event?.endsAt);
  const now = new Date();
  const status =
    typeof event?.status === "string" ? event.status.trim().toUpperCase() : "PUBLISHED";
  const registrationClosed =
    status !== "PUBLISHED" ||
    (closesAt && closesAt <= now) ||
    (startsAt && startsAt <= now);
  const closingSoon =
    status === "PUBLISHED" &&
    !registrationClosed &&
    closesAt &&
    (closesAt.getTime() - now.getTime()) / (1000 * 60 * 60) <= CLOSING_SOON_THRESHOLD_HOURS;
  const capacityLimit =
    Number.isFinite(Number(event?.maxParticipants)) && Number(event.maxParticipants) > 0
      ? Number(event.maxParticipants)
      : null;
  const approvedCount = Number.isFinite(Number(event?.approvedAttendeeCount))
    ? Number(event.approvedAttendeeCount)
    : 0;
  const isFull =
    event?.isFull ??
    (capacityLimit !== null ? approvedCount >= capacityLimit : false);

  return {
    status,
    startsAt,
    closesAt,
    endsAt,
    registrationClosed,
    closingSoon,
    isFull,
  };
}

function getEventStatusBadge(status) {
  const normalized = typeof status === "string" ? status.trim().toUpperCase() : "PUBLISHED";
  return EVENT_STATUS_BADGES[normalized] ?? EVENT_STATUS_BADGES.PUBLISHED;
}

function buildEventUpdatePayload(event, overrides = {}) {
  const toFloat = (value) => (Number.isFinite(Number(value)) ? Number(value) : null);
  const toInt = (value) => (Number.isFinite(Number(value)) ? Math.round(Number(value)) : null);
  const toIso = (value) => {
    const date = parseDateValue(value);
    return date ? date.toISOString() : null;
  };

  const base = {
    title: event?.title ?? "",
    overview: event?.overview ?? null,
    itinerary: event?.itinerary ?? null,
    directions: event?.directions ?? null,
    distanceKm: toFloat(event?.distanceKm),
    durationHrs: toFloat(event?.durationHrs),
    steps: toInt(event?.steps),
    elevationM: toFloat(event?.elevationM),
    price: toInt(event?.price) ?? 0,
    difficulty: event?.difficulty ?? "BEGINNER",
    gcashNumber: event?.gcashNumber ?? "",
    imageUrl: event?.imageUrl ?? null,
    trailId: event?.trailId ?? event?.trail?.id ?? null,
    trailGeoJson: event?.trailGeoJson ?? event?.trail?.geoJson ?? null,
    trailDistanceMeters:
      toFloat(event?.trailDistanceMeters) ??
      toFloat(event?.trail?.totalDistanceMeters) ??
      0,
    locationName: event?.locationName ?? null,
    locationLatitude: toFloat(event?.locationLatitude),
    locationLongitude: toFloat(event?.locationLongitude),
    locationZoomLevel: toFloat(event?.locationZoomLevel),
    locationBounds: event?.locationBounds ?? null,
    startsAt: toIso(event?.startsAt),
    endsAt: toIso(event?.endsAt),
    registrationOpensAt: toIso(event?.registrationOpensAt),
    registrationClosesAt: toIso(event?.registrationClosesAt),
    announceAt: toIso(event?.announceAt),
    minParticipants: Math.max(0, toInt(event?.minParticipants) ?? 0),
    maxParticipants: toInt(event?.maxParticipants),
    status: typeof event?.status === "string" ? event.status.toUpperCase() : "PUBLISHED",
  };

  const payload = {
    ...base,
    ...overrides,
  };

  if (typeof payload.status === "string") {
    payload.status = payload.status.toUpperCase();
  }

  return payload;
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
  const { styles } = useEventStyles();
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
  const { styles } = useEventStyles();
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
          onPress={() => onOpenEvent(event, booking)}
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

function OrganizerEventCard({
  event,
  attendees,
  onViewDetails,
  onViewBookings,
  onEditEvent,
  onUpdateStatus,
  isUpdatingStatus,
}) {
  const { styles, colors } = useEventStyles();
  const pickerTextColor = colors?.textPrimary ?? "#1F2937";
  const pickerIconColor = colors?.icon ?? "#1D4ED8";
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
  const approvedAttendees = Array.isArray(attendees)
    ? attendees.filter((booking) =>
        ["APPROVED", "CONFIRMED"].includes((booking?.status || "").toUpperCase())
      )
    : [];
  const approvedCount = approvedAttendees.length;
  const scheduleMeta = computeEventScheduleFlags(event);
  const statusBadge = getEventStatusBadge(scheduleMeta.status);
  const startLabel = formatEventDateTime(scheduleMeta.startsAt);
  const closeRelative = scheduleMeta.closesAt ? formatRelativeToNow(scheduleMeta.closesAt) : null;
  const closeAbsolute = scheduleMeta.closesAt ? formatEventDateTime(scheduleMeta.closesAt) : null;
  const closingDescription = scheduleMeta.registrationClosed
    ? "Registration closed"
    : closeRelative
    ? `Registration closes ${closeRelative}`
    : closeAbsolute
    ? `Registration closes on ${closeAbsolute}`
    : "Registration closing time not set";
  const minParticipantsCount =
    Number.isFinite(Number(event?.minParticipants)) && Number(event.minParticipants) > 0
      ? Number(event.minParticipants)
      : 0;
  const capacityLimit =
    Number.isFinite(Number(event?.maxParticipants)) && Number(event.maxParticipants) > 0
      ? Number(event.maxParticipants)
      : null;
  const minShortfall = Math.max(0, minParticipantsCount - approvedCount);

  return (
    <View style={styles.card}>
      <Image source={bannerSource} style={styles.cardImage} />
      <View style={styles.cardBody}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>{event?.title || "Untitled event"}</Text>
          <Text style={styles.priceTag}>{priceLabel}</Text>
        </View>

        <View style={styles.statusRow}>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: statusBadge.background },
            ]}
          >
            <Text style={[styles.statusBadgeText, { color: statusBadge.color }]}>
              {statusBadge.label}
            </Text>
          </View>
          {scheduleMeta.closingSoon ? (
            <View style={styles.badgeWarning}>
              <Text style={styles.badgeWarningText}>Closing soon</Text>
            </View>
          ) : null}
          {scheduleMeta.isFull ? (
            <View style={styles.badgeDanger}>
              <Text style={styles.badgeDangerText}>Fully booked</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.scheduleSection}>
          <Icon name="clock" size={16} color="#1D4ED8" style={styles.scheduleIcon} />
          <View style={styles.scheduleTextGroup}>
            <Text style={styles.schedulePrimary}>
              {startLabel ?? "Start time not set"}
            </Text>
            <Text style={styles.scheduleSecondary}>{closingDescription}</Text>
          </View>
        </View>

        {minParticipantsCount > 0 ? (
          <View
            style={[
              styles.minimumState,
              minShortfall > 0 ? styles.minimumStateWarning : styles.minimumStateSuccess,
            ]}
          >
            <Text
              style={[
                styles.minimumStateText,
                minShortfall > 0 ? null : styles.minimumStateTextSuccess,
              ]}
            >
              {minShortfall > 0
                ? `Needs ${minShortfall} more approved hiker${minShortfall === 1 ? "" : "s"} to reach the minimum of ${minParticipantsCount}.`
                : `Minimum requirement reached (${minParticipantsCount} hikers).`}
            </Text>
          </View>
        ) : null}

        <View style={styles.capacitySummary}>
          <View style={styles.capacityCard}>
            <Text style={styles.capacityLabel}>Minimum hikers</Text>
            <Text style={styles.capacityValue}>
              {minParticipantsCount > 0 ? minParticipantsCount : "Not set"}
            </Text>
          </View>
          <View style={[styles.capacityCard, styles.capacityCardLast]}>
            <Text style={styles.capacityLabel}>Capacity</Text>
            <Text style={styles.capacityValue}>
              {capacityLimit ? capacityLimit : "Unlimited"}
            </Text>
          </View>
        </View>

        <View style={styles.statusControl}>
          <Text style={styles.statusControlLabel}>Update status</Text>
          <View style={styles.statusPickerWrapper}>
            <Picker
              selectedValue={scheduleMeta.status}
              onValueChange={(value) => {
                if (value !== scheduleMeta.status) {
                  onUpdateStatus?.(event, value);
                }
              }}
              enabled={Boolean(onUpdateStatus) && !isUpdatingStatus}
              style={[styles.statusPicker, { color: pickerTextColor }]}
              dropdownIconColor={pickerIconColor}
            >
              {EVENT_STATUS_OPTIONS.map((option) => (
                <Picker.Item
                  key={option.value}
                  label={option.label}
                  value={option.value}
                  color={pickerTextColor}
                />
              ))}
            </Picker>
            {isUpdatingStatus ? (
              <ActivityIndicator
                size="small"
                color="#1D4ED8"
                style={styles.statusPickerSpinner}
              />
            ) : null}
          </View>
        </View>

        <View style={styles.metricSummary}>
          <View style={styles.summaryItem}>
            <Icon name="users" size={16} color="#2E7D32" style={styles.summaryIcon} />
            <Text style={styles.summaryLabel}>
              {attendeeCount
                ? `${approvedCount} approved / ${attendeeCount} total`
                : "No bookings yet"}
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
            onPress={() => onEditEvent?.(event)}
            disabled={!event?.id}
          >
            <Icon name="edit-2" size={16} color="#2E7D32" />
            <Text style={styles.secondaryButtonText}>Edit Event</Text>
          </TouchableOpacity>
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
  const { styles } = useEventStyles();
  const [user, setUser] = useState(null);
  const [bookedEvents, setBookedEvents] = useState([]);
  const [createdEvents, setCreatedEvents] = useState([]);
  const [eventAttendees, setEventAttendees] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cancellingBookingId, setCancellingBookingId] = useState(null);
  const [statusUpdatingId, setStatusUpdatingId] = useState(null);

  const hasLoadedRef = useRef(false);
  const insets = useSafeAreaInsets();
  const contentInsets = useMemo(
    () => ({
      paddingTop: Math.max(16, insets.top + 8),
      paddingBottom: Math.max(32, insets.bottom + 16),
    }),
    [insets.bottom, insets.top]
  );
  const scrollIndicatorInsets = useMemo(
    () => ({
      top: Math.max(8, insets.top),
      bottom: Math.max(8, insets.bottom),
    }),
    [insets.bottom, insets.top]
  );

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
    (event, viewerBooking = null) => {
      if (!event) {
        return;
      }
      navigation.navigate("EventDetails", {
        event,
        viewerBooking: viewerBooking ?? null,
      });
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

  const handleChangeStatus = useCallback(
    async (targetEvent, nextStatusRaw) => {
      if (!targetEvent?.id) {
        return;
      }

      const normalizedStatus =
        typeof nextStatusRaw === "string" ? nextStatusRaw.toUpperCase() : null;
      if (!normalizedStatus || normalizedStatus === (targetEvent?.status || "").toUpperCase()) {
        return;
      }

      try {
        setStatusUpdatingId(targetEvent.id);
        const latest = await get(`/api/events/${targetEvent.id}`);
        if (!latest) {
          throw new Error("Unable to load event details.");
        }

        const payload = buildEventUpdatePayload(latest, { status: normalizedStatus });
        if (!payload.registrationClosesAt) {
          payload.registrationClosesAt = latest?.registrationClosesAt ?? null;
        }

        await patch(`/api/events/${targetEvent.id}`, payload);
        await fetchData();
      } catch (error) {
        console.error(`Failed to update status for event ${targetEvent?.id}:`, error);
        const message =
          error?.body?.error ||
          error?.message ||
          "We couldn't update the event status right now. Please try again.";
        Alert.alert("Update failed", message);
      } finally {
        setStatusUpdatingId(null);
      }
    },
    [fetchData]
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

  const handleEditEvent = useCallback(
    (event) => {
      if (!event?.id) {
        return;
      }

      navigation.navigate("EditEvent", {
        mode: "edit",
        eventId: event.id,
        event,
        onEventUpdated: () => {
          fetchData({ showSpinner: false });
        },
      });
    },
    [navigation, fetchData]
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

  const renderHeader = () => (
    <ScreenHeader
      navigation={navigation}
      title="Events"
      subtitle="Review your bookings and hosted adventures"
    />
  );

  if (loading) {
    return (
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        {renderHeader()}
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2E7D32" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      {renderHeader()}
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.contentContainer, contentInsets]}
        scrollIndicatorInsets={scrollIndicatorInsets}
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
                onEditEvent={handleEditEvent}
                onUpdateStatus={handleChangeStatus}
                isUpdatingStatus={statusUpdatingId === event.id}
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
    </SafeAreaView>
  );
}

function createStyles(theme) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: theme.background },
    container: { flex: 1, backgroundColor: theme.surface },
    contentContainer: { padding: 16, paddingBottom: 32 },
    center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: theme.surface },
    section: { marginBottom: 30 },
    sectionHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 14,
    },
    sectionTitle: { fontSize: 20, fontWeight: "700", color: theme.textPrimary },
    sectionMeta: { fontSize: 14, color: theme.textSecondary },
    emptyCard: {
      backgroundColor: theme.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 20,
    },
    emptyTitle: { fontSize: 16, fontWeight: "700", color: theme.textPrimary, marginBottom: 6 },
    emptyText: { fontSize: 14, color: theme.textSecondary, lineHeight: 20 },
    card: {
      backgroundColor: theme.surface,
      borderRadius: 18,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: 18,
      shadowColor: "#000",
      shadowOpacity: 0.08,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 3,
    },
    cardImage: { width: "100%", height: 160, backgroundColor: theme.surfaceMuted },
    cardBody: { padding: 16 },
    cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    cardTitle: { flex: 1, fontSize: 18, fontWeight: "700", color: theme.textPrimary, marginRight: 12 },
    priceTag: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: theme.accentSurface,
      borderRadius: 999,
      color: theme.accent,
      fontSize: 12,
      fontWeight: "600",
    },
    statusRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      marginTop: 10,
      marginBottom: 10,
    },
    statusBadge: {
      borderRadius: 999,
      paddingVertical: 4,
      paddingHorizontal: 12,
      marginRight: 8,
      marginBottom: 6,
    },
    statusBadgeText: {
      fontSize: 12,
      fontWeight: "700",
      textTransform: "uppercase",
      color: theme.textPrimary,
    },
    badgeWarning: {
      backgroundColor: theme.warningSurface,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
      marginRight: 8,
      marginBottom: 6,
    },
    badgeWarningText: {
      color: theme.warningText,
      fontSize: 12,
      fontWeight: "700",
      textTransform: "uppercase",
    },
    badgeDanger: {
      backgroundColor: theme.dangerSurface,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
      marginRight: 8,
      marginBottom: 6,
    },
    badgeDangerText: {
      color: theme.dangerText,
      fontSize: 12,
      fontWeight: "700",
      textTransform: "uppercase",
    },
    scheduleSection: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.surfaceMuted,
      borderRadius: 12,
      padding: 12,
      marginBottom: 12,
    },
    scheduleIcon: {
      marginRight: 12,
    },
    scheduleTextGroup: {
      flex: 1,
    },
    schedulePrimary: {
      fontSize: 15,
      fontWeight: "700",
      color: theme.textPrimary,
    },
    scheduleSecondary: {
      marginTop: 4,
      fontSize: 13,
      color: theme.textSecondary,
    },
    minimumState: {
      borderRadius: 12,
      padding: 12,
      marginBottom: 12,
    },
    minimumStateWarning: {
      backgroundColor: theme.warningSurface,
    },
    minimumStateSuccess: {
      backgroundColor: theme.positiveSurface,
    },
    minimumStateText: {
      fontSize: 13,
      fontWeight: "600",
      color: theme.warningText,
    },
    minimumStateTextSuccess: {
      color: theme.positiveText,
    },
    capacitySummary: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 12,
    },
    capacityCard: {
      flex: 1,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
      marginRight: 12,
    },
    capacityCardLast: {
      marginRight: 0,
    },
    capacityLabel: {
      fontSize: 12,
      color: theme.textMuted,
      fontWeight: "700",
      textTransform: "uppercase",
      marginBottom: 6,
    },
    capacityValue: {
      fontSize: 15,
      fontWeight: "700",
      color: theme.textPrimary,
    },
    statusControl: {
      marginBottom: 14,
    },
    statusControlLabel: {
      fontSize: 12,
      fontWeight: "700",
      color: theme.textMuted,
      textTransform: "uppercase",
      marginBottom: 6,
    },
    statusPickerWrapper: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      backgroundColor: theme.surface,
      position: "relative",
    },
    statusPicker: {
      width: "100%",
      height: 44,
      color: theme.textPrimary,
    },
    statusPickerSpinner: {
      position: "absolute",
      right: 12,
      top: 10,
    },
    chipRow: { flexDirection: "row", alignItems: "center", marginTop: 12, marginBottom: 12 },
    statusChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
    statusText: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", color: theme.textPrimary },
    statusDivider: { width: 1, height: 16, backgroundColor: theme.border, marginHorizontal: 10 },
    bookedAtLabel: { fontSize: 12, color: theme.textMuted, fontWeight: "500" },
    infoRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
    infoIcon: { marginRight: 8 },
    infoText: { flex: 1, fontSize: 14, color: theme.textSecondary },
    overviewText: { fontSize: 14, color: theme.textSecondary, lineHeight: 20, marginTop: 6 },
    metricRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 12, marginBottom: 10 },
    metricChip: {
      backgroundColor: theme.infoSurface,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 6,
      marginRight: 8,
      marginBottom: 8,
    },
    metricText: { fontSize: 12, fontWeight: "600", color: theme.infoText },
    primaryButton: {
      marginTop: 14,
      backgroundColor: theme.accent,
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: "center",
    },
    primaryButtonText: { color: theme.textInverse, fontSize: 14, fontWeight: "700" },
    cancelButton: {
      marginTop: 10,
      borderWidth: 1,
      borderColor: theme.dangerText,
      backgroundColor: theme.dangerSurface,
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: "center",
    },
    cancelButtonText: { color: theme.dangerText, fontSize: 14, fontWeight: "700" },
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
    summaryLabel: { fontSize: 13, fontWeight: "600", color: theme.textPrimary },
    attendeeSection: { marginTop: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.border },
    sectionSubHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "baseline",
      marginBottom: 6,
    },
    sectionSubTitle: { fontSize: 15, fontWeight: "700", color: theme.textPrimary },
    sectionSubMeta: { fontSize: 12, color: theme.textMuted },
    attendeeRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
    attendeeAvatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 10,
      backgroundColor: theme.surfaceMuted,
    },
    attendeeAvatarText: { fontSize: 13, fontWeight: "700", color: theme.textPrimary },
    attendeeDetails: { flex: 1 },
    attendeeName: { fontSize: 14, fontWeight: "600", color: theme.textPrimary },
    attendeeEmail: { fontSize: 12, color: theme.textSecondary },
    attendeeMeta: { alignItems: "flex-end", marginLeft: 8 },
    attendeeAmount: { fontSize: 12, fontWeight: "700", color: theme.accent, textAlign: "right" },
    receiptLink: { marginTop: 4 },
    receiptLinkText: { fontSize: 12, fontWeight: "700", color: theme.infoText },
    noReceiptText: { fontSize: 12, color: theme.textMuted, marginTop: 4, textAlign: "right" },
    emptyStateText: { fontSize: 13, color: theme.textMuted, lineHeight: 18 },
    actionRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 20 },
    secondaryButton: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderColor: theme.accent,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 10,
      marginRight: 12,
      marginBottom: 12,
    },
    secondaryButtonAlt: { backgroundColor: theme.accent, borderColor: theme.accent },
    secondaryButtonText: { marginLeft: 8, color: theme.accent, fontSize: 13, fontWeight: "600" },
    secondaryButtonTextAlt: { color: theme.textInverse },
  });
}




