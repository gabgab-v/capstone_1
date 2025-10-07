import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import EventLocationMap from '../../components/EventLocationMap';
import { formatMetersToKm } from '../../utils/geo';
import { useAuth } from '../../context/AuthContext';
import { get, BASE_URL } from '../../lib/api';

const BASE_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'details', label: 'Details' },
  { key: 'itinerary', label: 'Itinerary' },
  { key: 'directions', label: 'Directions' },
];

const AVATAR_COLORS = ['#DCFCE7', '#E0F2FE', '#FDE68A', '#FCE7F3', '#EDE9FE', '#FFE4E6'];

function resolveReceiptUrl(paymentUrl) {
  if (typeof paymentUrl !== 'string' || !paymentUrl.trim()) {
    return null;
  }
  if (/^https?:/i.test(paymentUrl)) {
    return paymentUrl.trim();
  }
  const normalized = paymentUrl.startsWith('/') ? paymentUrl : `/${paymentUrl}`;
  return `${BASE_URL}${normalized}`;
}

function getAttendeeInitials(name, email) {
  if (typeof name === 'string' && name.trim().length) {
    const parts = name.trim().split(/\s+/).slice(0, 2);
    const letters = parts.map((part) => part.charAt(0).toUpperCase()).filter(Boolean);
    if (letters.length) {
      return letters.join('');
    }
  }
  if (typeof email === 'string' && email.trim().length) {
    return email.trim().charAt(0).toUpperCase();
  }
  return '?';
}

function sanitizeText(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function getLocationPoint(event) {
  if (!event) {
    return null;
  }
  const lat = Number(event.locationLatitude);
  const lng = Number(event.locationLongitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  return { lat, lng };
}

function getLocationLabel(event) {
  const name = sanitizeText(event?.locationName);
  if (name) {
    return name;
  }
  const point = getLocationPoint(event);
  if (point) {
    return `Lat ${point.lat.toFixed(3)}, Lon ${point.lng.toFixed(3)}`;
  }
  return 'Location to follow';
}

function formatPrice(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return null;
  }
  if (amount <= 0) {
    return 'Free';
  }
  return `PHP ${amount.toLocaleString()}`;
}

function getMetrics(event) {
  if (!event) {
    return [];
  }

  const metrics = [];

  const distance = Number(event.distanceKm);
  if (Number.isFinite(distance) && distance > 0) {
    metrics.push({ id: 'distance', icon: 'map', value: `${distance.toFixed(1)} km` });
  }

  const duration = Number(event.durationHrs);
  if (Number.isFinite(duration) && duration > 0) {
    metrics.push({ id: 'duration', icon: 'clock', value: `${duration.toFixed(1)} hrs` });
  }

  const elevation = Number(event.elevationM);
  if (Number.isFinite(elevation) && elevation > 0) {
    metrics.push({ id: 'elevation', icon: 'trending-up', value: `${elevation.toFixed(0)} m up` });
  }

  const steps = Number(event.steps);
  if (Number.isFinite(steps) && steps > 0) {
    metrics.push({ id: 'steps', icon: 'activity', value: `${steps.toLocaleString()} steps` });
  }

  return metrics;
}

function getDetailRows(event, locationLabel) {
  if (!event) {
    return [];
  }

  const rows = [];

  rows.push({ label: 'Meeting point', value: locationLabel });

  if (event.trail?.label) {
    rows.push({ label: 'Trail preview', value: event.trail.label });
  }

  if (Number.isFinite(Number(event.trailDistanceMeters)) && Number(event.trailDistanceMeters) > 0) {
    rows.push({
      label: 'Trail distance',
      value: formatMetersToKm(event.trailDistanceMeters),
    });
  }

  if (sanitizeText(event.gcashNumber)) {
    rows.push({ label: 'GCash number', value: event.gcashNumber.trim() });
  }

  rows.push({ label: 'Organizer', value: sanitizeText(event.organizer?.name) ?? 'Unknown organizer' });

  if (event.createdAt) {
    const createdDate = new Date(event.createdAt);
    if (!Number.isNaN(createdDate.valueOf())) {
      rows.push({ label: 'Created', value: createdDate.toLocaleDateString() });
    }
  }

  return rows;
}

function AttendeeRow({ booking, index }) {
  const initials = getAttendeeInitials(booking?.user?.name, booking?.user?.email);
  const avatarColor = AVATAR_COLORS[index % AVATAR_COLORS.length];
  const receiptUrl = resolveReceiptUrl(booking?.paymentUrl);
  const handleOpenReceipt = () => {
    if (!receiptUrl) {
      return;
    }
    Linking.openURL(receiptUrl).catch(() => {
      Alert.alert('Unable to open receipt', "We couldn't open the receipt link. Please try again later.");
    });
  };

  return (
    <View style={styles.attendeeRow}>
      <View style={[styles.attendeeAvatar, { backgroundColor: avatarColor }]}>
        <Text style={styles.attendeeAvatarText}>{initials}</Text>
      </View>
      <View style={styles.attendeeDetails}>
        <Text style={styles.attendeeName}>{booking?.user?.name || 'Anonymous hiker'}</Text>
        <Text style={styles.attendeeEmail}>{booking?.user?.email || 'No email provided'}</Text>
      </View>
      <View style={styles.attendeeMeta}>
        <Text style={styles.attendeeAmount}>{formatPrice(booking?.totalAmount)}</Text>
        {receiptUrl ? (
          <TouchableOpacity onPress={handleOpenReceipt}>
            <Text style={styles.receiptLink}>View receipt</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.noReceipt}>No receipt</Text>
        )}
      </View>
    </View>
  );
}

export default function EventDetailsPage({ route, navigation }) {
  const { event } = route.params ?? {};

  const { user } = useAuth();
  const isOrganizer = Boolean(user?.id && event?.organizerId && user.id === event.organizerId);

  const [attendees, setAttendees] = useState([]);
  const [attendeesLoading, setAttendeesLoading] = useState(false);
  const [attendeesError, setAttendeesError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  const tabs = useMemo(() => {
    const baseTabs = [...BASE_TABS];
    if (isOrganizer) {
      baseTabs.push({ key: 'attendees', label: 'Attendees' });
    }
    return baseTabs;
  }, [isOrganizer]);

  useEffect(() => {
    if (!tabs.some((tab) => tab.key === activeTab)) {
      setActiveTab(tabs[0]?.key ?? 'overview');
    }
  }, [tabs, activeTab]);

  useEffect(() => {
    if (!isOrganizer || !event?.id) {
      setAttendees([]);
      setAttendeesError(null);
      setAttendeesLoading(false);
      return;
    }

    let isCancelled = false;

    const fetchAttendees = async () => {
      setAttendeesLoading(true);
      setAttendeesError(null);
      try {
        const data = await get(`/api/events/${event.id}/bookings`);
        if (!isCancelled) {
          setAttendees(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        if (!isCancelled) {
          setAttendeesError(error?.body?.error || error?.message || 'Failed to load attendees.');
          setAttendees([]);
        }
      } finally {
        if (!isCancelled) {
          setAttendeesLoading(false);
        }
      }
    };

    fetchAttendees();

    return () => {
      isCancelled = true;
    };
  }, [event?.id, isOrganizer]);

  const locationLabel = useMemo(() => getLocationLabel(event), [event]);
  const locationPoint = useMemo(() => getLocationPoint(event), [event]);
  const metrics = useMemo(() => getMetrics(event), [event]);
  const detailRows = useMemo(() => getDetailRows(event, locationLabel), [event, locationLabel]);

  const overviewText = useMemo(() => sanitizeText(event?.overview), [event?.overview]);
  const itineraryText = useMemo(() => sanitizeText(event?.itinerary), [event?.itinerary]);
  const directionsText = useMemo(() => sanitizeText(event?.directions), [event?.directions]);

  if (!event) {
    return (
      <View style={styles.centerFallback}>
        <Text style={styles.placeholderText}>Event details not found.</Text>
      </View>
    );
  }

  const priceLabel = formatPrice(event.price);
  const eventDate = sanitizeText(event.date) ?? 'Date to be announced';
  const hasMapContent = Boolean(locationPoint || event.trailGeoJson || event.trail?.geoJson);

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.container}>
        <Image
          source={{ uri: event.imageUrl || 'https://picsum.photos/600/400' }}
          style={styles.banner}
        />

        <View style={styles.contentPadding}>
          <View style={styles.header}>
            <Text style={styles.title}>{event.title}</Text>
            <Text style={styles.date}>{eventDate}</Text>
            {priceLabel && <Text style={styles.price}>{priceLabel}</Text>}
            <View style={styles.locationChip}>
              <Icon name="map-pin" size={16} color="#166534" style={styles.locationIcon} />
              <Text style={styles.locationChipText} numberOfLines={1}>
                {locationLabel}
              </Text>
            </View>
          </View>

          {!!metrics.length && (
            <View style={styles.metricRow}>
              {metrics.map((metric) => (
                <View key={metric.id} style={styles.metricBadge}>
                  <Icon name={metric.icon} size={14} color="#166534" style={styles.metricIcon} />
                  <Text style={styles.metricText}>{metric.value}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.tabRow}>
            {tabs.map((tab) => (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tabButton, activeTab === tab.key && styles.activeTabButton]}
                onPress={() => setActiveTab(tab.key)}
              >
                <Text style={[styles.tabText, activeTab === tab.key && styles.activeTabText]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.tabContent}>
            {activeTab === 'overview' && (
              <View style={styles.sectionCard}>
                <Text style={styles.sectionBody}>
                  {overviewText || 'The organizer will add more details soon.'}
                </Text>
              </View>
            )}

            {activeTab === 'details' && (
              <View style={styles.sectionCard}>
                {detailRows.map((row) => (
                  <View key={row.label} style={styles.detailRow}>
                    <Text style={styles.detailLabel}>{row.label}</Text>
                    <Text style={styles.detailValue}>{row.value}</Text>
                  </View>
                ))}
              </View>
            )}

            {activeTab === 'itinerary' && (
              <View style={styles.sectionCard}>
                <Text style={styles.sectionBody}>
                  {itineraryText || 'Itinerary will be shared soon.'}
                </Text>
              </View>
            )}

            {activeTab === 'directions' && (
              <View style={styles.sectionCard}>
                <View style={styles.locationHeader}>
                  <View style={styles.locationBadge}>
                    <Icon name="navigation" size={18} color="#ffffff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.locationTitle}>{locationLabel}</Text>
                    {locationPoint && (
                      <Text style={styles.locationCoords}>
                        {locationPoint.lat.toFixed(4)}° N, {locationPoint.lng.toFixed(4)}° E
                      </Text>
                    )}

            {activeTab === 'attendees' && (
              <View style={styles.sectionCard}>
                {attendeesLoading ? (
                  <View style={styles.attendeeLoading}>
                    <ActivityIndicator size="small" color="#2E7D32" />
                    <Text style={styles.attendeeLoadingText}>Loading attendees...</Text>
                  </View>
                ) : attendeesError ? (
                  <Text style={styles.attendeeError}>{attendeesError}</Text>
                ) : attendees.length ? (
                  attendees.map((booking, index) => (
                    <AttendeeRow key={booking?.id || index} booking={booking} index={index} />
                  ))
                ) : (
                  <Text style={styles.attendeeEmpty}>No bookings yet.</Text>
                )}
              </View>
            )}
                  </View>
                </View>

                {hasMapContent && (
                  <EventLocationMap event={event} style={styles.mapPreview} />
                )}

                {directionsText ? (
                  <View style={styles.directionsNote}>
                    <Text style={styles.sectionLabel}>Directions</Text>
                    <Text style={styles.sectionBody}>{directionsText}</Text>
                  </View>
                ) : (
                  <Text style={styles.placeholderText}>
                    The organizer will share turn-by-turn directions closer to the event date.
                  </Text>
                )}
              </View>
            )}
          </View>

          <View style={styles.organizerCard}>
            <View style={styles.organizerInfo}>
              <View style={styles.avatarPlaceholder} />
              <View>
                <Text style={styles.organizerName}>
                  {sanitizeText(event.organizer?.name) ?? 'Unknown Organizer'}
                </Text>
                <Text style={styles.organizerDate}>Event Organizer</Text>
              </View>
            </View>
            <View style={styles.actionButtons}>
              <TouchableOpacity style={styles.followBtn}>
                <Text style={styles.followText}>Follow</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.messageBtn}>
                <Text style={styles.messageText}>Message</Text>
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.commentsTitle}>Comments</Text>
          <View style={styles.commentCard}>
            <View style={styles.avatarPlaceholder} />
            <View>
              <Text style={styles.commentAuthor}>Marvin Cruz</Text>
              <Text style={styles.commentText}>
                Excited for this trail! Will the meetup have parking nearby?
              </Text>
            </View>
          </View>
          <View style={styles.commentCard}>
            <View style={styles.avatarPlaceholder} />
            <View>
              <Text style={styles.commentAuthor}>Rheniel Penional</Text>
              <Text style={styles.commentText}>
                Following for updates on the final schedule.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <TouchableOpacity
        style={styles.bookButton}
        onPress={() => navigation.navigate('BookingPage', { event })}
      >
        <Text style={styles.bookText}>Book Now</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#fff' },
  container: { paddingBottom: 120 },
  banner: { width: '100%', height: 230 },
  contentPadding: {
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  header: { marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '700', color: '#1A3620', marginBottom: 6 },
  date: { fontSize: 14, color: '#64748b', marginBottom: 4 },
  price: { fontSize: 18, fontWeight: '700', color: '#2E7D32', marginBottom: 12 },
  locationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  locationChipText: { color: '#166534', fontSize: 13, fontWeight: '600', flexShrink: 1 },
  locationIcon: { marginRight: 6 },
  metricRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 18,
    marginHorizontal: -4,
  },
  metricBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginHorizontal: 4,
    marginBottom: 8,
  },
  metricIcon: { marginRight: 6 },
  metricText: { color: '#166534', fontSize: 12, fontWeight: '600' },
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    marginBottom: 14,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  tabText: { fontSize: 14, color: '#64748b', fontWeight: '600' },
  activeTabButton: { borderBottomWidth: 3, borderBottomColor: '#2E7D32' },
  activeTabText: { color: '#2E7D32' },
  tabContent: { marginBottom: 24 },
  sectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    shadowColor: '#0f172a',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  sectionBody: { fontSize: 14, color: '#374151', lineHeight: 20 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1F2937',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  placeholderText: { fontSize: 14, color: '#94a3b8', lineHeight: 20 },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  detailLabel: { fontSize: 13, fontWeight: '600', color: '#475569' },
  detailValue: { fontSize: 13, color: '#1f2937', marginLeft: 16, flexShrink: 1, textAlign: 'right' },
  locationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  locationBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#2E7D32',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  locationTitle: { fontSize: 15, fontWeight: '700', color: '#1F2937' },
  locationCoords: { fontSize: 12, color: '#64748b', marginTop: 2 },
  mapPreview: { marginBottom: 16, height: 240 },
  directionsNote: { marginTop: 4 },
  organizerCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 20,
  },
  organizerInfo: { flexDirection: 'row', alignItems: 'center' },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#cbd5f5',
    marginRight: 12,
  },
  organizerName: { fontWeight: '700', fontSize: 14, color: '#1f2937' },
  organizerDate: { fontSize: 12, color: '#64748b' },
  actionButtons: { flexDirection: 'row' },
  followBtn: {
    backgroundColor: '#2E7D32',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  followText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  messageBtn: {
    borderWidth: 1,
    borderColor: '#2E7D32',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    marginLeft: 10,
  },
  messageText: { color: '#2E7D32', fontSize: 12, fontWeight: '600' },
  commentsTitle: { fontWeight: '700', fontSize: 16, marginBottom: 12, color: '#1F2937' },
  commentCard: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    alignItems: 'flex-start',
  },
  commentAuthor: { fontWeight: '600', fontSize: 13, marginBottom: 2, color: '#1F2937' },
  commentText: { fontSize: 13, color: '#4B5563', lineHeight: 19 },
  bookButton: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#2E7D32',
    padding: 18,
    alignItems: 'center',
  },
  attendeeLoading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16 },
  attendeeLoadingText: { marginLeft: 10, color: '#4b5563', fontSize: 14 },
  attendeeError: { color: '#b91c1c', fontSize: 13 },
  attendeeEmpty: { color: '#6b7280', fontSize: 13 },
  attendeeRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  attendeeAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  attendeeAvatarText: { fontSize: 14, fontWeight: '700', color: '#1f2937' },
  attendeeDetails: { flex: 1 },
  attendeeName: { fontSize: 14, fontWeight: '600', color: '#1f2937' },
  attendeeEmail: { fontSize: 12, color: '#6b7280' },
  attendeeMeta: { alignItems: 'flex-end' },
  attendeeAmount: { fontSize: 12, fontWeight: '700', color: '#047857', textAlign: 'right' },
  receiptLink: { fontSize: 12, fontWeight: '700', color: '#1d4ed8', marginTop: 4 },
  noReceipt: { fontSize: 12, color: '#9ca3af', marginTop: 4 },
  bookText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  centerFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
});

