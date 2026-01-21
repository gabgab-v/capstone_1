import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import EventLocationMap from '../../components/EventLocationMap';
import ScreenHeader from '../../components/ScreenHeader';
import { formatMetersToKm } from '../../utils/geo';
import { useAuth } from '../../context/AuthContext';
import { get, put, post, del as deleteRequest, BASE_URL } from '../../lib/api';
import {
  buildMatchBreakdown,
  computeMatchScore,
  deriveUserAgeYears,
  getEventDifficultyLabel,
  evaluateEventReadiness,
} from '../../utils/matchScoring';

const BASE_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'details', label: 'Details' },
  { key: 'itinerary', label: 'Itinerary' },
  { key: 'directions', label: 'Directions' },
];

const AVATAR_COLORS = ['#DCFCE7', '#E0F2FE', '#FDE68A', '#FCE7F3', '#EDE9FE', '#FFE4E6'];
const APPROVED_BOOKING_STATUSES = new Set(['APPROVED', 'CONFIRMED']);
const INACTIVE_BOOKING_STATUSES = new Set(['CANCELLED', 'DECLINED', 'REJECTED']);
const CANCELLATION_POLICY_SUMMARY =
  'Bookings are non-refundable. Schedule transfers are allowed via reschedule requests. If the organizer moves an event due to weather, your booking stays active for the new schedule.';
const STRONG_MATCH_THRESHOLD = 0.75;
const MIN_MATCH_DISPLAY_THRESHOLD = 0.15;
const MATCH_THEMES = {
  strong: {
    background: '#ECFDF5',
    border: '#16A34A',
    accent: '#166534',
    text: '#14532D',
  },
  weak: {
    background: '#FEE2E2',
    border: '#DC2626',
    accent: '#B91C1C',
    text: '#7F1D1D',
  },
};

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

function getUserDisplayName(user) {
  if (!user) {
    return null;
  }
  const name = sanitizeText(user.name);
  if (name) {
    return name;
  }
  const email = sanitizeText(user.email);
  if (email && email.includes('@')) {
    return email.split('@')[0];
  }
  return null;
}

function formatCommentTimestamp(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return null;
  }
  return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function formatShortDateTimeLabel(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return null;
  }
  return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

const ATTENDANCE_STATUS_META = {
  GOING: { label: 'Confirmed', color: '#166534', background: '#DCFCE7' },
  NOT_GOING: { label: 'Not joining', color: '#991B1B', background: '#FEE2E2' },
  UNSURE: { label: 'Unsure', color: '#92400E', background: '#FEF3C7' },
  PENDING: { label: 'Awaiting reply', color: '#1D4ED8', background: '#E0F2FE' },
};

function formatAttendanceStatus(status) {
  if (!status) {
    return ATTENDANCE_STATUS_META.PENDING.label;
  }
  const normalized = String(status).trim().toUpperCase();
  return ATTENDANCE_STATUS_META[normalized]?.label ?? ATTENDANCE_STATUS_META.PENDING.label;
}

function buildPollStatusCopy(pollWindow) {
  if (!pollWindow) {
    return null;
  }
  if (pollWindow.locked) {
    return 'Attendance check closed once the event started.';
  }
  if (pollWindow.isOpen) {
    const closesAt = formatShortDateTimeLabel(pollWindow.closesAt);
    return closesAt ? `Attendance check is open until ${closesAt}.` : 'Attendance check is open.';
  }
  const opensAt = formatShortDateTimeLabel(pollWindow.opensAt);
  if (opensAt) {
    return `Attendance check opens on ${opensAt}.`;
  }
  return 'Attendance check opens on the day of the event.';
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

function formatDateTime(value) {
  if (!value) {
    return 'Booked date pending';
  }
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return 'Booked date pending';
  }
  const dateLabel = date.toLocaleDateString();
  const timeLabel = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${dateLabel} at ${timeLabel}`;
}

function getBookingStatusMeta(status) {
  const normalized = typeof status === 'string' ? status.toUpperCase() : 'PENDING';
  switch (normalized) {
    case 'CONFIRMED':
    case 'APPROVED':
      return { label: 'Confirmed', color: '#047857', normalized };
    case 'REJECTED':
    case 'DECLINED':
      return { label: 'Rejected', color: '#b91c1c', normalized };
    case 'CANCELLED':
      return { label: 'Cancelled', color: '#b45309', normalized };
    case 'RESCHEDULE_REQUESTED':
      return { label: 'Reschedule requested', color: '#d97706', normalized };
    default:
      return { label: 'Pending', color: '#1d4ed8', normalized: normalized || 'PENDING' };
  }
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

  const minAge = Number(event?.minAge);
  if (Number.isFinite(minAge) && minAge > 0) {
    rows.push({ label: 'Minimum age', value: `${Math.round(minAge)}+` });
  }

  rows.push({ label: 'Cancellation policy', value: CANCELLATION_POLICY_SUMMARY });

  rows.push({ label: 'Organizer', value: sanitizeText(event.organizer?.name) ?? 'Unknown organizer' });

  if (event.createdAt) {
    const createdDate = new Date(event.createdAt);
    if (!Number.isNaN(createdDate.valueOf())) {
      rows.push({ label: 'Created', value: createdDate.toLocaleDateString() });
    }
  }

  return rows;
}

function AttendeeRow({
  booking,
  index,
  showReceiptLink,
  isCurrentUser,
  canManage,
  onUpdateStatus,
  actionInFlight,
  onViewProfile,
}) {
  const initials = getAttendeeInitials(booking?.user?.name, booking?.user?.email);
  const displayName = sanitizeText(booking?.user?.name) ?? 'Anonymous hiker';
  const avatarColor = AVATAR_COLORS[index % AVATAR_COLORS.length];
  const avatarUri = sanitizeText(booking?.user?.avatarUrl);
  const receiptUrl = showReceiptLink ? resolveReceiptUrl(booking?.paymentUrl) : null;
  const statusMeta = getBookingStatusMeta(booking?.status);
  const normalizedStatus = statusMeta.normalized || 'PENDING';
  const isApproved = APPROVED_BOOKING_STATUSES.has(normalizedStatus);
  const isRejected = normalizedStatus === 'REJECTED' || normalizedStatus === 'DECLINED';
  const approving = Boolean(
    actionInFlight?.bookingId === booking?.id && actionInFlight?.status === 'APPROVED',
  );
  const rejecting = Boolean(
    actionInFlight?.bookingId === booking?.id && actionInFlight?.status === 'REJECTED',
  );
  const pending = Boolean(
    actionInFlight?.bookingId === booking?.id && actionInFlight?.status === 'PENDING',
  );
  const disableActions = approving || rejecting || pending;
  const bookingUserId = booking?.user?.id ?? booking?.userId ?? null;
  const canViewProfile = Boolean(onViewProfile && bookingUserId);
  const showPersonalDetails = Boolean(isCurrentUser || canManage);
  const attendeeEmailLabel = showPersonalDetails
    ? booking?.user?.email || 'No email provided'
    : 'Hidden for privacy';
  const displayAmount = formatPrice(booking?.totalAmount);
  const handleProfilePress = useCallback(() => {
    if (!canViewProfile) {
      return;
    }
    onViewProfile(bookingUserId);
  }, [bookingUserId, canViewProfile, onViewProfile]);
  const handleOpenReceipt = () => {
    if (!receiptUrl) {
      return;
    }
    Linking.openURL(receiptUrl).catch(() => {
      Alert.alert(
        'Unable to open receipt',
        "We couldn't open the receipt link. Please try again later.",
      );
    });
  };

  const renderActionButton = (label, targetStatus, variant, isLoading) => {
    const variantMap = {
      approve: {
        buttonStyle: [styles.attendeeActionButton, styles.attendeeApproveButton],
        textStyle: [styles.attendeeActionText, styles.attendeeActionTextLight],
        spinnerColor: '#ffffff',
      },
      pending: {
        buttonStyle: [styles.attendeeActionButton, styles.attendeePendingButton],
        textStyle: [styles.attendeeActionText, styles.attendeeActionTextDark],
        spinnerColor: '#1f2937',
      },
      reject: {
        buttonStyle: [styles.attendeeActionButton, styles.attendeeRejectButton],
        textStyle: [styles.attendeeActionText, styles.attendeeActionTextLight],
        spinnerColor: '#ffffff',
      },
    };
    const selected = variantMap[variant] ?? variantMap.pending;

    return (
      <TouchableOpacity
        key={`${booking?.id}-${label}`}
        style={[
          ...selected.buttonStyle,
          disableActions ? styles.attendeeActionDisabled : null,
        ].filter(Boolean)}
        onPress={() => onUpdateStatus?.(booking?.id, targetStatus)}
        disabled={disableActions}
        activeOpacity={0.8}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color={selected.spinnerColor} />
        ) : (
          <Text
            style={[
              ...selected.textStyle,
              disableActions ? styles.attendeeActionTextDisabled : null,
            ].filter(Boolean)}
          >
            {label}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  const actionButtons = [];
  if (canManage) {
    if (!isApproved) {
      actionButtons.push(
        renderActionButton('Approve', 'APPROVED', 'approve', approving),
      );
    }
    if (normalizedStatus !== 'PENDING') {
      actionButtons.push(
        renderActionButton('Mark pending', 'PENDING', 'pending', pending),
      );
    }
    if (!isRejected) {
      actionButtons.push(
        renderActionButton('Reject', 'REJECTED', 'reject', rejecting),
      );
    }
  }

  return (
    <View style={styles.attendeeRow}>
      <View style={[styles.attendeeAvatar, { backgroundColor: avatarColor }]}>
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={styles.attendeeAvatarImage} />
        ) : (
          <Text style={styles.attendeeAvatarText}>{initials}</Text>
        )}
      </View>
      <TouchableOpacity
        style={[styles.attendeeDetails, !canViewProfile ? styles.attendeeDetailsDisabled : null]}
        onPress={handleProfilePress}
        disabled={!canViewProfile}
        activeOpacity={0.75}
      >
        <Text style={styles.attendeeName}>{displayName}</Text>
        <Text style={styles.attendeeEmail}>{attendeeEmailLabel}</Text>
        {isCurrentUser ? <Text style={styles.attendeeYou}>You</Text> : null}
        {canViewProfile ? (
          <Text style={styles.attendeeProfileLink}>Go to profile</Text>
        ) : null}
      </TouchableOpacity>
      <View style={styles.attendeeMeta}>
        <Text style={styles.attendeeAmount}>{displayAmount ?? '—'}</Text>
        <Text style={[styles.attendeeStatus, { color: statusMeta.color }]}>
          {statusMeta.label}
        </Text>
        {receiptUrl ? (
          <TouchableOpacity onPress={handleOpenReceipt}>
            <Text style={styles.receiptLink}>View receipt</Text>
          </TouchableOpacity>
        ) : showReceiptLink ? (
          <Text style={styles.noReceipt}>No receipt</Text>
        ) : (
          <Text style={styles.receiptRestricted}>Receipt hidden</Text>
        )}
        {canManage && actionButtons.length ? (
          <View style={styles.attendeeActions}>{actionButtons}</View>
        ) : null}
      </View>
    </View>
  );
}

export default function EventDetailsPage({ route, navigation }) {
  const { event, viewerBooking: viewerBookingParam = null } = route.params ?? {};

  const { user, refreshUser } = useAuth();
  const isOrganizer = Boolean(user?.id && event?.organizerId && user.id === event.organizerId);

  const [attendees, setAttendees] = useState([]);
  const [attendeesLoading, setAttendeesLoading] = useState(false);
  const [attendeesError, setAttendeesError] = useState(null);
  const [bookingActionInFlight, setBookingActionInFlight] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [messageTargetId, setMessageTargetId] = useState(null);
  const [organizerProfile, setOrganizerProfile] = useState(null);
  const [organizerLoading, setOrganizerLoading] = useState(false);
  const [followUpdating, setFollowUpdating] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentCount, setCommentCount] = useState(null);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState(null);
  const [commentText, setCommentText] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentsVisible, setCommentsVisible] = useState(false);
  const [eventChatLoading, setEventChatLoading] = useState(false);
  const [attendancePoll, setAttendancePoll] = useState(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceError, setAttendanceError] = useState(null);
  const [attendanceSubmitting, setAttendanceSubmitting] = useState(null);
  const [reminderSending, setReminderSending] = useState(null);

  const organizerId = useMemo(
    () => event?.organizer?.id ?? event?.organizerId ?? null,
    [event?.organizer?.id, event?.organizerId],
  );

  const viewerBookingFromRoute = useMemo(() => {
    if (viewerBookingParam && typeof viewerBookingParam === 'object') {
      return viewerBookingParam;
    }
    return null;
  }, [viewerBookingParam]);

  const viewerBookingFromAttendees = useMemo(() => {
    if (!Array.isArray(attendees) || !user?.id) {
      return null;
    }
    const match = attendees.find((booking) => {
      const bookingUserId = booking?.userId ?? booking?.user?.id ?? null;
      return bookingUserId && bookingUserId === user.id;
    });
    return match ?? null;
  }, [attendees, user?.id]);

  const viewerBooking = viewerBookingFromAttendees ?? viewerBookingFromRoute;
  const viewerBookingStatus = useMemo(() => {
    if (!viewerBooking || !viewerBooking.status) {
      return null;
    }
    const normalized =
      typeof viewerBooking.status === 'string'
        ? viewerBooking.status.trim().toUpperCase()
        : String(viewerBooking.status ?? '').trim().toUpperCase();
    return normalized || null;
  }, [viewerBooking]);

  const viewerHasActiveBooking = useMemo(() => {
    if (!viewerBookingStatus) {
      return false;
    }
    return !INACTIVE_BOOKING_STATUSES.has(viewerBookingStatus);
  }, [viewerBookingStatus]);

  const viewerCanAccessEventChat = useMemo(() => {
    if (!event?.id || !user?.id) {
      return false;
    }
    if (isOrganizer) {
      return true;
    }
    if (!viewerBookingStatus) {
      return false;
    }
    return APPROVED_BOOKING_STATUSES.has(viewerBookingStatus);
  }, [event?.id, isOrganizer, user?.id, viewerBookingStatus]);

  const attendanceViewerStatus = useMemo(
    () => (attendancePoll?.viewer?.attendanceStatus ? attendancePoll.viewer.attendanceStatus : 'PENDING'),
    [attendancePoll?.viewer?.attendanceStatus],
  );

  const hasPreferences = Boolean(user?.preferencesComplete);

  const matchInsight = useMemo(() => {
    if (!hasPreferences || !event) {
      return null;
    }
    const score = computeMatchScore(user, event);
    if (!Number.isFinite(score) || score <= 0) {
      return null;
    }
    const breakdown = buildMatchBreakdown({ user, event });
    if ((!breakdown || breakdown.length === 0) && score <= MIN_MATCH_DISPLAY_THRESHOLD) {
      return null;
    }
    const percent = Math.round(score * 100);
    const severity = score >= STRONG_MATCH_THRESHOLD ? 'strong' : 'weak';
    const theme = MATCH_THEMES[severity] ?? MATCH_THEMES.weak;
    const headline =
      severity === 'strong'
        ? `Strong match · ${percent}%`
        : `Weak match · ${percent}%`;
    const summary =
      severity === 'strong'
        ? 'This event aligns closely with your hiking preferences.'
        : 'This event differs from several of your saved preferences.';
    return {
      score,
      percent,
      severity,
      theme,
      headline,
      summary,
      breakdown: Array.isArray(breakdown) ? breakdown : [],
    };
  }, [hasPreferences, event, user]);

  const readinessAssessment = useMemo(() => evaluateEventReadiness(user, event), [event, user]);
  const readinessBlockers = readinessAssessment?.blockers ?? [];
  const readinessWarnings = readinessAssessment?.warnings ?? [];
  const hasReadinessBlockers = readinessBlockers.length > 0;

  const userAgeYears = useMemo(() => deriveUserAgeYears(user), [user]);
  const eventMinAge = useMemo(() => {
    const value = Number(event?.minAge);
    return Number.isFinite(value) && value > 0 ? value : null;
  }, [event?.minAge]);

  const ageNotice = useMemo(() => {
    const age = Number.isFinite(userAgeYears) ? Math.floor(userAgeYears) : null;

    if (eventMinAge) {
      if (age === null) {
        return {
          tone: 'info',
          message: `This hike recommends ${eventMinAge}+ hikers. Add your birthdate so we can confirm eligibility and tailor safety reminders.`,
        };
      }
      if (age < eventMinAge) {
        const gap = eventMinAge - age;
        const gapLabel = gap === 1 ? '1 year' : `${gap} years`;
        return {
          tone: 'warning',
          message: `Recommended for ${eventMinAge}+ hikers. You are ${age}, about ${gapLabel} below the guidance—consider a different event or join only with guardian approval.`,
        };
      }
      if (age === eventMinAge) {
        return {
          tone: 'success',
          message: `You meet the ${eventMinAge}+ age recommendation. Hike responsibly and stay hydrated.`,
        };
      }
      return {
        tone: 'success',
        message: `You're ${age}, above the ${eventMinAge}+ guidance. Keep fitness and safety in mind for this route.`,
      };
    }

    if (age === null) {
      return {
        tone: 'info',
        message: 'Add your birthdate so we can confirm eligibility and tailor safety reminders.',
      };
    }

    return {
      tone: 'info',
      message: `You're ${age}. This organizer did not set age guidance, so choose responsibly based on your ability.`,
    };
  }, [eventMinAge, userAgeYears]);

  const attendanceWindowCopy = useMemo(
    () => buildPollStatusCopy(attendancePoll?.pollWindow),
    [attendancePoll?.pollWindow],
  );
  const attendancePromptSentLabel = useMemo(
    () => formatShortDateTimeLabel(attendancePoll?.event?.attendanceCheckSentAt),
    [attendancePoll?.event?.attendanceCheckSentAt],
  );
  const startReminderSentLabel = useMemo(
    () => formatShortDateTimeLabel(attendancePoll?.event?.announceSentAt),
    [attendancePoll?.event?.announceSentAt],
  );
  const startReminderScheduledLabel = useMemo(
    () => formatShortDateTimeLabel(event?.announceAt),
    [event?.announceAt],
  );

  const physicalReminder = useMemo(() => {
    if (!event) {
      return null;
    }
    const distance = Number(event.distanceKm);
    const elevation = Number(event.elevationM);
    const duration = Number(event.durationHrs);
    const difficulty = getEventDifficultyLabel(event);
    const parts = [];

    if (Number.isFinite(distance) && distance > 0) {
      parts.push(`${distance.toFixed(1)} km`);
    }
    if (Number.isFinite(elevation) && elevation > 0) {
      parts.push(`${Math.round(elevation)} m gain`);
    }
    if (Number.isFinite(duration) && duration > 0) {
      parts.push(`${duration.toFixed(1)} hrs`);
    }
    const metrics = parts.length ? parts.join(' • ') : null;
    const difficultyText = difficulty ? difficulty.toLowerCase() : null;

    let body = 'Make sure you feel physically fit and cleared to join. Listen to your body and avoid pushing beyond your limits.';
    if (metrics && difficultyText) {
      body = `This route is ${metrics} and rated ${difficultyText}. Confirm you can comfortably handle this effort and have no health restrictions for strenuous activity.`;
    } else if (metrics) {
      body = `This route is ${metrics}. Confirm you can comfortably handle that effort and have no health restrictions for strenuous activity.`;
    } else if (difficultyText) {
      body = `Rated ${difficultyText}. Ensure your cardio and strength match this level, and avoid joining if you have health restrictions.`;
    }

    return {
      title: 'Physical readiness',
      message: `${body} If you have medical conditions, consult a doctor before joining and bring necessary meds/clearance.`,
    };
  }, [event]);

  useEffect(() => {
    if (!organizerId) {
      setOrganizerProfile(null);
      return;
    }

    setOrganizerProfile((current) => {
      const base = current ?? {};
      return {
        ...base,
        id: organizerId,
        name: sanitizeText(event?.organizer?.name) ?? base.name ?? null,
        email: event?.organizer?.email ?? base.email ?? null,
        avatarUrl: event?.organizer?.avatarUrl ?? base.avatarUrl ?? null,
      };
    });
  }, [organizerId, event?.organizer?.name, event?.organizer?.email, event?.organizer?.avatarUrl]);

  const tabs = useMemo(
    () => [...BASE_TABS, { key: 'attendees', label: 'Attendees' }],
    []
  );

  useEffect(() => {
    if (!tabs.some((tab) => tab.key === activeTab)) {
      setActiveTab(tabs[0]?.key ?? 'overview');
    }
  }, [tabs, activeTab]);

  const fetchOrganizerProfile = useCallback(async () => {
    if (!organizerId) {
      setOrganizerLoading(false);
      return;
    }

    if (!user?.id) {
      setOrganizerProfile((current) => (current ? { ...current, isFollowing: false } : current));
      setOrganizerLoading(false);
      return;
    }

    setOrganizerLoading(true);
    try {
      const data = await get(`/api/users/${organizerId}`);
      setOrganizerProfile((current) => {
        const base = current ?? { id: organizerId };
        return {
          ...base,
          id: data?.id ?? base.id ?? organizerId,
          name: sanitizeText(data?.name) ?? base.name ?? null,
          email: data?.email ?? base.email ?? null,
          avatarUrl: data?.avatarUrl ?? base.avatarUrl ?? null,
          isFollowing:
            typeof data?.isFollowing === 'boolean'
              ? data.isFollowing
              : base.isFollowing ?? false,
          followersCount:
            typeof data?.followersCount === 'number'
              ? data.followersCount
              : base.followersCount ?? null,
        };
      });
    } catch (error) {
      if (error?.status === 401) {
        return;
      }
      console.error('Failed to load organizer profile:', error);
    } finally {
      setOrganizerLoading(false);
    }
  }, [organizerId, user?.id]);

  useEffect(() => {
    fetchOrganizerProfile();
  }, [fetchOrganizerProfile]);

  useFocusEffect(
    useCallback(() => {
      fetchOrganizerProfile();
    }, [fetchOrganizerProfile]),
  );

  useEffect(() => {
    if (!event?.id) {
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
  }, [event?.id, user?.id, isOrganizer]);

  const fetchAttendancePoll = useCallback(async () => {
    if (!event?.id || !user?.id) {
      setAttendancePoll(null);
      setAttendanceError(null);
      setAttendanceLoading(false);
      return;
    }

    setAttendanceLoading(true);
    setAttendanceError(null);
    try {
      const data = await get(`/api/events/${event.id}/attendance`);
      setAttendancePoll(data);
    } catch (error) {
      setAttendancePoll(null);
      setAttendanceError(
        error?.body?.error || error?.message || 'Unable to load the attendance check right now.',
      );
    } finally {
      setAttendanceLoading(false);
    }
  }, [event?.id, user?.id]);

  useEffect(() => {
    fetchAttendancePoll();
  }, [fetchAttendancePoll]);

  const fetchComments = useCallback(async () => {
    if (!event?.id) {
      setComments([]);
      setCommentCount(0);
      setCommentsError(null);
      setCommentsLoading(false);
      return;
    }

    setCommentsLoading(true);
    setCommentsError(null);
    try {
      const data = await get(`/api/events/${event.id}/comments`);
      const loadedComments = Array.isArray(data?.comments) ? data.comments : [];
      const loadedCount =
        typeof data?.commentCount === 'number' ? data.commentCount : loadedComments.length;

      setComments(loadedComments);
      setCommentCount(loadedCount);
    } catch (error) {
      console.error('Failed to load event comments:', error);
      setComments([]);
      setCommentCount(0);
      setCommentsError(error?.body?.error || error?.message || 'Failed to load comments.');
    } finally {
      setCommentsLoading(false);
    }
  }, [event?.id]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  useFocusEffect(
    useCallback(() => {
      fetchComments();
    }, [fetchComments]),
  );

  const handleUpdateBookingStatus = useCallback(
    async (bookingId, nextStatus) => {
      if (!bookingId || !nextStatus) {
        return;
      }
      setBookingActionInFlight({ bookingId, status: nextStatus });
      try {
        const updatedBooking = await put(`/api/bookings/${bookingId}`, { status: nextStatus });
        setAttendees((prev) =>
          Array.isArray(prev)
            ? prev.map((item) => (item?.id === updatedBooking?.id ? { ...item, ...updatedBooking } : item))
            : prev,
        );
      } catch (error) {
        const message =
          error?.body?.error || error?.message || 'Failed to update booking status. Please try again.';
        Alert.alert('Update failed', message);
      } finally {
        setBookingActionInFlight(null);
      }
    },
    [],
  );

  const handleMessageUser = useCallback(
    async (targetUser) => {
      const targetId = targetUser?.id;
      if (!targetId || targetId === user?.id) {
        return;
      }

      if (!user?.id) {
        Alert.alert('Sign in required', 'Please sign in to start a conversation.');
        return;
      }

      setMessageTargetId(targetId);
      try {
        const conversation = await post('/api/chats', { userId: targetId });
        const peersPayload =
          conversation?.peers && conversation.peers.length
            ? conversation.peers
            : [
                {
                  id: targetUser.id,
                  name: targetUser.name,
                  email: targetUser.email,
                  avatarUrl: targetUser.avatarUrl ?? null,
                },
              ];

        navigation.navigate('ChatConversation', {
          conversationId: conversation.id,
          peers: peersPayload,
          initialConversation: conversation,
        });
      } catch (error) {
        console.error('Unable to start chat with attendee:', error);
        const message =
          error?.body?.error ||
          error?.message ||
          'Unable to start a chat with this member right now.';
        Alert.alert('Chat unavailable', message);
      } finally {
        setMessageTargetId(null);
      }
    },
    [navigation, user?.id],
  );

  const handleOpenEventChat = useCallback(async () => {
    if (!event?.id) {
      return;
    }
    if (!user?.id) {
      Alert.alert('Sign in required', 'Please sign in to chat with attendees.');
      return;
    }
    setEventChatLoading(true);
    try {
      const conversation = await get(`/api/events/${event.id}/conversation`);
      navigation.navigate('ChatConversation', {
        conversationId: conversation.id,
        peers: conversation.peers ?? [],
        initialConversation: conversation,
      });
    } catch (error) {
      console.error('Unable to open event chat:', error);
      const message =
        error?.body?.error ||
        error?.message ||
        'We could not open the group chat right now.';
      Alert.alert('Chat unavailable', message);
    } finally {
      setEventChatLoading(false);
    }
  }, [event?.id, navigation, user?.id]);

  const handleSendReminder = useCallback(
    async (type) => {
      if (!event?.id || reminderSending) {
        return;
      }
      setReminderSending(type);
      try {
        const data = await post(`/api/events/${event.id}/reminders`, { type });
        const successMessage =
          type === 'attendance'
            ? 'Attendance reminder sent to the event chat.'
            : 'Start reminder sent to the event chat.';
        Alert.alert('Reminder sent', data?.messageBody || successMessage);
        fetchAttendancePoll();
      } catch (error) {
        console.error('Unable to send reminder:', error);
        Alert.alert(
          'Reminder failed',
          error?.body?.error || error?.message || 'Unable to send a chat reminder right now.',
        );
      } finally {
        setReminderSending(null);
      }
    },
    [event?.id, fetchAttendancePoll, reminderSending],
  );

  const handleAttendanceSubmit = useCallback(
    async (status) => {
      if (!event?.id || !attendancePoll?.canRespond || attendanceSubmitting) {
        return;
      }
      setAttendanceSubmitting(status);
      try {
        const data = await post(`/api/events/${event.id}/attendance`, { status });
        setAttendancePoll(data);
        setAttendanceError(null);
      } catch (error) {
        console.error('Failed to submit attendance:', error);
        Alert.alert(
          'Attendance not saved',
          error?.body?.error || error?.message || 'Unable to update your attendance right now.',
        );
      } finally {
        setAttendanceSubmitting(null);
      }
    },
    [attendancePoll?.canRespond, attendanceSubmitting, event?.id],
  );

  const handleNavigateToProfile = useCallback(
    (userId) => {
      if (!userId) {
        return;
      }
      navigation.navigate('UserProfile', { userId });
    },
    [navigation],
  );

  const handleOrganizerFollowToggle = useCallback(async () => {
    if (!organizerId || followUpdating || isOrganizer) {
      return;
    }

    if (!user?.id) {
      Alert.alert('Sign in required', 'Please sign in to follow organizers.');
      return;
    }

    setFollowUpdating(true);
    try {
      const endpoint = `/api/users/${organizerId}/follow`;
      const result = organizerProfile?.isFollowing
        ? await deleteRequest(endpoint)
        : await post(endpoint, {});

      setOrganizerProfile((current) => {
        const base = current ?? { id: organizerId };
        const wasFollowing = Boolean(base.isFollowing);
        const nextFollowers =
          typeof result?.followersCount === 'number'
            ? result.followersCount
            : Math.max(
                0,
                (base.followersCount ?? 0) + (wasFollowing ? -1 : 1),
              );

        return {
          ...base,
          isFollowing:
            typeof result?.isFollowing === 'boolean'
              ? result.isFollowing
              : !wasFollowing,
          followersCount: nextFollowers,
        };
      });

      if (typeof refreshUser === 'function') {
        refreshUser().catch((err) =>
          console.error('Failed to refresh viewer profile after follow toggle:', err),
        );
      }
    } catch (error) {
      console.error('Failed to update follow state:', error);
      Alert.alert(
        'Follow failed',
        error?.body?.error || error?.message || 'Unable to update follow status right now.',
      );
    } finally {
      setFollowUpdating(false);
      fetchOrganizerProfile();
    }
  }, [
    organizerProfile?.isFollowing,
    organizerId,
    followUpdating,
    isOrganizer,
    user?.id,
    fetchOrganizerProfile,
    refreshUser,
  ]);

  const handleSubmitComment = useCallback(async () => {
    if (!event?.id || commentSubmitting) {
      return;
    }

    if (!user?.id) {
      Alert.alert('Sign in required', 'Please sign in to join the discussion.');
      return;
    }

    const trimmed = commentText.trim();
    if (!trimmed.length) {
      return;
    }

    setCommentSubmitting(true);
    try {
      const data = await post(`/api/events/${event.id}/comments`, { content: trimmed });
      if (data?.comment) {
        setComments((current) => [...current, data.comment]);
      }
      if (typeof data?.commentCount === 'number') {
        setCommentCount(data.commentCount);
      } else {
        setCommentCount((current) => {
          if (typeof current === 'number') {
            return current + 1;
          }
          return 1;
        });
      }
      setCommentText('');
    } catch (error) {
      console.error('Failed to add comment:', error);
      Alert.alert(
        'Comment failed',
        error?.body?.error || error?.message || 'Unable to add your comment right now.',
      );
    } finally {
      setCommentSubmitting(false);
    }
  }, [commentSubmitting, commentText, event?.id, user?.id]);

  const handleOpenComments = useCallback(() => {
    setCommentsVisible(true);
    fetchComments();
  }, [fetchComments]);

  const handleCloseComments = useCallback(() => {
    setCommentsVisible(false);
  }, []);

  const locationLabel = useMemo(() => getLocationLabel(event), [event]);
  const locationPoint = useMemo(() => getLocationPoint(event), [event]);
  const metrics = useMemo(() => getMetrics(event), [event]);
  const detailRows = useMemo(() => getDetailRows(event, locationLabel), [event, locationLabel]);
  const fallbackApproved = useMemo(() => {
    const value = Number(event?.approvedAttendeeCount);
    return Number.isFinite(value) && value >= 0 ? value : 0;
  }, [event?.approvedAttendeeCount]);
  const fallbackTotal = useMemo(() => {
    const value = Number(event?.totalBookingCount);
    if (Number.isFinite(value) && value >= 0) {
      return Math.max(value, fallbackApproved);
    }
    return fallbackApproved;
  }, [event?.totalBookingCount, fallbackApproved]);
  const attendeeStats = useMemo(() => {
    if (!Array.isArray(attendees) || attendees.length === 0) {
      const pending = Math.max(fallbackTotal - fallbackApproved, 0);
      return { approved: fallbackApproved, total: fallbackTotal, pending };
    }

    const computedApproved = attendees.reduce((count, booking) => {
      const status = typeof booking?.status === 'string' ? booking.status.toUpperCase() : '';
      return APPROVED_BOOKING_STATUSES.has(status) ? count + 1 : count;
    }, 0);

    const baseApproved = Math.max(computedApproved, fallbackApproved);

    if (isOrganizer) {
      const total = Math.max(attendees.length, baseApproved);
      const pending = Math.max(total - baseApproved, 0);
      return { approved: baseApproved, total, pending };
    }

    const total = Math.max(fallbackTotal, baseApproved);
    const pending = Math.max(total - baseApproved, 0);
    return { approved: baseApproved, total, pending };
  }, [attendees, fallbackApproved, fallbackTotal, isOrganizer]);
  const attendeeProgress =
    attendeeStats.total > 0 ? Math.min(attendeeStats.approved / attendeeStats.total, 1) : 0;
  const attendeeProgressStyle = useMemo(() => {
    const clamped = Math.max(0, Math.min(attendeeProgress || 0, 1));
    return { width: `${(clamped * 100).toFixed(0)}%` };
  }, [attendeeProgress]);
  const attendeeSummaryMetaLabel = useMemo(() => {
    if (attendeeStats.total > 0) {
      return `${attendeeStats.approved}/${attendeeStats.total} approved`;
    }
    return `${attendeeStats.approved} approved`;
  }, [attendeeStats]);
  const attendeeSummaryCaption = useMemo(() => {
    if (attendeeStats.total === 0) {
      return 'No bookings yet.';
    }
    if (attendeeStats.pending > 0) {
      if (isOrganizer) {
        return `${attendeeStats.pending} booking${attendeeStats.pending === 1 ? '' : 's'} awaiting approval`;
      }
      return `${attendeeStats.approved} confirmed attendee${attendeeStats.approved === 1 ? '' : 's'}`;
    }
    if (attendeeStats.approved === 0) {
      return 'No bookings yet.';
    }
    return isOrganizer
      ? 'All current bookings approved'
      : `${attendeeStats.approved} confirmed attendee${attendeeStats.approved === 1 ? '' : 's'}`;
  }, [attendeeStats, isOrganizer]);

  const capacityLimit = useMemo(() => {
    const raw = Number(event?.maxParticipants);
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  }, [event?.maxParticipants]);

  const slotsLeft = useMemo(() => {
    if (capacityLimit === null) {
      return null;
    }
    const approvedCount = Math.max(0, attendeeStats.approved);
    return Math.max(0, capacityLimit - approvedCount);
  }, [attendeeStats.approved, capacityLimit]);

  const isEventFull = useMemo(() => {
    if (event?.isFull === true) {
      return true;
    }
    if (capacityLimit === null) {
      return false;
    }
    return (slotsLeft ?? capacityLimit) <= 0;
  }, [capacityLimit, event?.isFull, slotsLeft]);

  const slotsLabel = useMemo(() => {
    if (capacityLimit === null) {
      return 'Unlimited capacity';
    }
    if (slotsLeft > 0) {
      return `${slotsLeft} slot${slotsLeft === 1 ? '' : 's'} left`;
    }
    return 'Fully booked';
  }, [capacityLimit, slotsLeft]);

  const viewerCanBook = useMemo(() => {
    if (!event?.id || !user?.id || isOrganizer || viewerHasActiveBooking) {
      return false;
    }
    if (isEventFull) {
      return false;
    }
    return true;
  }, [event?.id, isEventFull, isOrganizer, user?.id, viewerHasActiveBooking]);

  const handleBookPress = useCallback(() => {
    if (!viewerCanBook) {
      if (isEventFull) {
        Alert.alert('Fully booked', 'All slots are filled for this event. Please check back later or browse other adventures.');
      }
      return;
    }

    if (hasReadinessBlockers) {
      const message = readinessBlockers.length
        ? `Please resolve before booking:\n• ${readinessBlockers.join('\n• ')}`
        : 'This event is locked until you meet the organizer requirements.';
      Alert.alert('Booking locked', message, [
        {
          text: 'Update preferences',
          onPress: () => navigation.navigate('PreferencesSetup'),
        },
        { text: 'OK', style: 'cancel' },
      ]);
      return;
    }

    if (readinessWarnings.length) {
      const warningBody = `Before booking:\n• ${readinessWarnings.join('\n• ')}`;
      Alert.alert('Check your fit', warningBody, [
        { text: 'Keep browsing', style: 'cancel' },
        {
          text: 'Update preferences',
          onPress: () => navigation.navigate('PreferencesSetup'),
        },
        {
          text: 'Proceed to booking',
          style: 'destructive',
          onPress: () => navigation.navigate('BookingPage', { event }),
        },
      ]);
      return;
    }

    navigation.navigate('BookingPage', { event });
  }, [
    event,
    hasReadinessBlockers,
    isEventFull,
    navigation,
    readinessBlockers,
    readinessWarnings,
    viewerCanBook,
  ]);

  const canViewOrganizerProfile = Boolean(organizerId);
  const handleViewOrganizerProfile = useCallback(() => {
    if (!organizerId) {
      return;
    }
    handleNavigateToProfile(organizerId);
  }, [handleNavigateToProfile, organizerId]);

  const organizerName = useMemo(
    () =>
      getUserDisplayName(organizerProfile) ??
      sanitizeText(event?.organizer?.name) ??
      getUserDisplayName(event?.organizer) ??
      'Unknown Organizer',
    [organizerProfile, event?.organizer],
  );
  const organizerAvatarUrl = organizerProfile?.avatarUrl ?? event?.organizer?.avatarUrl ?? null;
  const organizerInitials = useMemo(
    () =>
      getAttendeeInitials(
        organizerProfile?.name ?? event?.organizer?.name,
        organizerProfile?.email ?? event?.organizer?.email,
      ),
    [organizerProfile?.name, organizerProfile?.email, event?.organizer?.name, event?.organizer?.email],
  );
  const organizerFollowersLabel = useMemo(() => {
    if (typeof organizerProfile?.followersCount !== 'number') {
      return null;
    }
    const followers = organizerProfile.followersCount;
    const suffix = followers === 1 ? 'follower' : 'followers';
    return `${followers} ${suffix}`;
  }, [organizerProfile?.followersCount]);
  const isFollowingOrganizer = Boolean(organizerProfile?.isFollowing);
  const organizerMessageInFlight = organizerId && messageTargetId === organizerId;
  const canSubmitComment = commentText.trim().length > 0 && !commentSubmitting;
  const viewerCanComment = Boolean(user?.id);
  const previewComments = useMemo(() => comments.slice(0, 2), [comments]);
  const hasMoreComments = useMemo(
    () => typeof commentCount === 'number' && commentCount > previewComments.length,
    [commentCount, previewComments],
  );
  const commentsCtaLabel = useMemo(() => {
    if (commentsLoading) {
      return 'Loading...';
    }
    if (typeof commentCount === 'number' && commentCount > 0) {
      return hasMoreComments ? 'View all comments' : 'Open comments';
    }
    return viewerCanComment ? 'Add a comment' : 'View comments';
  }, [commentsLoading, commentCount, hasMoreComments, viewerCanComment]);

  const renderCommentItem = useCallback(
    (comment) => {
      if (!comment) {
        return null;
      }

      const commentKey = comment.id ?? `comment-${comment?.createdAt ?? ''}-${comment?.author?.id ?? ''}`;
      const authorName =
        getUserDisplayName(comment?.author) ??
        getAttendeeInitials(comment?.author?.name, comment?.author?.email);
      const initials = getAttendeeInitials(comment?.author?.name, comment?.author?.email);
      const timestamp = formatCommentTimestamp(comment?.createdAt);
      const avatarUrl = comment?.author?.avatarUrl ?? null;

      return (
        <View key={commentKey} style={styles.commentCard}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.commentAvatar} />
          ) : (
            <View style={styles.commentAvatarPlaceholder}>
              <Text style={styles.commentAvatarInitials}>{initials}</Text>
            </View>
          )}
          <View style={styles.commentBody}>
            <Text style={styles.commentAuthor}>{authorName}</Text>
            <Text style={styles.commentText}>{comment?.content ?? ''}</Text>
            {timestamp ? <Text style={styles.commentMeta}>{timestamp}</Text> : null}
          </View>
        </View>
      );
    },
    [],
  );

  const overviewText = useMemo(() => sanitizeText(event?.overview), [event?.overview]);
  const itineraryText = useMemo(() => sanitizeText(event?.itinerary), [event?.itinerary]);
  const directionsText = useMemo(() => sanitizeText(event?.directions), [event?.directions]);
  const keyboardBehavior = Platform.OS === 'ios' ? 'padding' : 'height';
  const keyboardVerticalOffset = Platform.OS === 'ios' ? 0 : 32;

  if (!event) {
    return (
      <KeyboardAvoidingView
        style={styles.page}
        behavior={keyboardBehavior}
        keyboardVerticalOffset={keyboardVerticalOffset}
      >
        <ScreenHeader navigation={navigation} title="Event Details" />
        <View style={styles.centerFallback}>
          <Text style={styles.placeholderText}>Event details not found.</Text>
        </View>
      </KeyboardAvoidingView>
    );
  }

  const priceLabel = formatPrice(event.price);
  const eventDate = (() => {
    if (event?.startsAt) {
      const label = formatDateTime(event.startsAt);
      return label === 'Booked date pending' ? 'Start time to be announced' : label;
    }
    return 'Start time to be announced';
  })();
  const registrationCloseDate = (() => {
    if (event?.registrationClosesAt) {
      const label = formatDateTime(event.registrationClosesAt);
      return label === 'Booked date pending' ? null : label;
    }
    return null;
  })();
  const eventStatus =
    typeof event?.status === 'string' ? event.status.trim().toUpperCase() : 'PUBLISHED';
  const eventStatusLabel =
    eventStatus.charAt(0) + eventStatus.slice(1).toLowerCase();
  const hasMapContent = Boolean(locationPoint || event.trailGeoJson || event.trail?.geoJson);

  return (
    <KeyboardAvoidingView
      style={styles.page}
      behavior={keyboardBehavior}
      keyboardVerticalOffset={keyboardVerticalOffset}
    >
      <ScreenHeader
        navigation={navigation}
        title={event.title ?? 'Event Details'}
        subtitle={locationLabel}
      />
      <ScrollView contentContainerStyle={styles.container}>
        <Image
          source={{ uri: event.imageUrl || 'https://picsum.photos/600/400' }}
          style={styles.banner}
        />

        <View style={styles.contentPadding}>
          <View style={styles.header}>
            <Text style={styles.title}>{event.title}</Text>
            <Text style={styles.date}>{eventDate}</Text>
            <Text style={styles.statusLabel}>{`Status: ${eventStatusLabel}`}</Text>
            {registrationCloseDate ? (
              <Text style={styles.registrationLabel}>
                {`Registration closes ${registrationCloseDate}`}
              </Text>
            ) : null}
            {priceLabel && <Text style={styles.price}>{priceLabel}</Text>}
            <View style={styles.locationChip}>
              <Icon name="map-pin" size={16} color="#166534" style={styles.locationIcon} />
              <Text style={styles.locationChipText} numberOfLines={1}>
                {locationLabel}
              </Text>
            </View>
            {event.mountainTag ? (
              <View style={styles.mountainTagChip}>
                <Text style={styles.mountainTagText}>{event.mountainTag}</Text>
              </View>
            ) : null}
          </View>

          {ageNotice ? (
            <View
              style={[
                styles.ageNotice,
                ageNotice.tone === 'warning'
                  ? styles.ageNoticeWarning
                  : ageNotice.tone === 'success'
                  ? styles.ageNoticeSuccess
                  : styles.ageNoticeInfo,
              ]}
            >
              <Text style={styles.ageNoticeTitle}>Age guidance</Text>
              <Text style={styles.ageNoticeBody}>{ageNotice.message}</Text>
            </View>
          ) : null}

          {physicalReminder ? (
            <View style={styles.readinessNotice}>
              <Text style={styles.readinessTitle}>{physicalReminder.title}</Text>
              <Text style={styles.readinessBody}>{physicalReminder.message}</Text>
            </View>
          ) : null}

          {readinessBlockers.length ? (
            <View style={[styles.readinessGate, styles.readinessGateBlocked]}>
              <Text style={styles.readinessGateTitle}>Booking locked for safety</Text>
              {readinessBlockers.map((message, index) => (
                <Text key={`blocker-${index}`} style={styles.readinessGateItem}>
                  • {message}
                </Text>
              ))}
              <Text style={styles.readinessGateFooter}>
                Update your hiking profile or pick another event to unlock booking.
              </Text>
            </View>
          ) : null}

          {!readinessBlockers.length && readinessWarnings.length ? (
            <View style={[styles.readinessGate, styles.readinessGateWarning]}>
              <Text style={styles.readinessGateTitle}>Review before booking</Text>
              {readinessWarnings.map((message, index) => (
                <Text key={`warning-${index}`} style={styles.readinessGateItem}>
                  • {message}
                </Text>
              ))}
              <Text style={styles.readinessGateFooter}>
                We will remind you about these differences before you confirm a booking.
              </Text>
            </View>
          ) : null}

          {matchInsight && (
            <View
              style={[
                styles.matchCard,
                {
                  backgroundColor: matchInsight.theme.background,
                  borderColor: matchInsight.theme.border,
                },
              ]}
            >
              <View style={styles.matchCardHeader}>
                <Text style={[styles.matchCardTitle, { color: matchInsight.theme.accent }]}>
                  Personalized match
                </Text>
                <Text style={[styles.matchCardPercent, { color: matchInsight.theme.accent }]}>
                  {matchInsight.percent}%
                </Text>
              </View>
              <Text style={[styles.matchCardHeadline, { color: matchInsight.theme.accent }]}>
                {matchInsight.headline}
              </Text>
              <Text style={[styles.matchCardSummary, { color: matchInsight.theme.text }]}>
                {matchInsight.summary}
              </Text>
              {matchInsight.breakdown.length > 0 && (
                <View style={styles.matchBreakdownList}>
                  {matchInsight.breakdown.map((entry) => (
                    <View key={entry.key} style={styles.matchBreakdownItem}>
                      <Text style={[styles.matchBreakdownLabel, { color: matchInsight.theme.accent }]}>
                        {entry.label} · {entry.percent}%
                      </Text>
                      <Text style={styles.matchBreakdownDetail}>{entry.detail}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

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

          <View style={styles.attendeeSummaryCard}>
            <View style={styles.attendeeSummaryHeader}>
              <Text style={styles.attendeeSummaryTitle}>Attendees</Text>
              <Text style={styles.attendeeSummaryMeta}>{attendeeSummaryMetaLabel}</Text>
            </View>
            <View style={styles.attendeeSummaryBar}>
              <View style={[styles.attendeeSummaryProgress, attendeeProgressStyle]} />
            </View>
            <Text style={styles.attendeeSummaryCaption}>{attendeeSummaryCaption}</Text>
          </View>

          <View
            style={[
              styles.capacityNotice,
              capacityLimit === null
                ? styles.capacityNoticeNeutral
            : isEventFull
            ? styles.capacityNoticeFull
            : styles.capacityNoticeOpen,
          ]}
        >
            <View
              style={[
                styles.capacityIconBadge,
                capacityLimit === null
                  ? styles.capacityIconNeutral
                  : isEventFull
                  ? styles.capacityIconFull
                  : styles.capacityIconOpen,
              ]}
            >
              <Icon
                name={capacityLimit === null ? 'infinity' : 'users'}
                size={16}
                color="#ffffff"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.capacityTitle}>{slotsLabel}</Text>
              <Text style={styles.capacitySubtitle}>
                {capacityLimit === null
                  ? 'Organizer has not set a headcount limit.'
                  : slotsLeft > 0
                  ? `${slotsLeft} of ${capacityLimit} slots remaining${
                      isOrganizer ? '. Edit the event to adjust capacity.' : ''
                    }`
                  : `No slots left from ${capacityLimit} seats${
                      isOrganizer ? '. Edit the event to open more slots.' : ''
                    }`}
              </Text>
            </View>
          </View>

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
                {!isOrganizer && (
                  <Text style={styles.attendeeInfo}>
                    Confirmed attendees are visible to everyone once the organizer approves them.
                  </Text>
                )}
                <View style={styles.attendanceCard}>
                  <View style={styles.attendanceHeader}>
                    <Text style={styles.attendanceTitle}>Attendance check-in</Text>
                    {attendancePoll?.summary ? (
                      <Text style={styles.attendanceHeadline}>
                        {attendancePoll.summary.going} going · {attendancePoll.summary.pending} pending
                      </Text>
                    ) : null}
                  </View>
                  {attendanceLoading ? (
                    <View style={styles.attendeeLoading}>
                      <ActivityIndicator size="small" color="#2E7D32" />
                      <Text style={styles.attendeeLoadingText}>Loading attendance...</Text>
                    </View>
                  ) : attendanceError ? (
                    <Text style={styles.attendeeError}>{attendanceError}</Text>
                  ) : (
                    <>
                      <Text style={styles.attendanceCopy}>
                        Quick poll to verify headcount before the hike starts. Responses notify the organizer.
                      </Text>
                      {attendanceWindowCopy ? (
                        <Text style={styles.attendanceMetaText}>{attendanceWindowCopy}</Text>
                      ) : null}
                      {attendancePoll?.viewerEligible ? (
                        <>
                          {attendancePoll?.canRespond ? (
                            <View style={styles.attendanceActions}>
                              {['GOING', 'NOT_GOING', 'UNSURE'].map((status) => {
                                const meta =
                                  ATTENDANCE_STATUS_META[status] ?? ATTENDANCE_STATUS_META.PENDING;
                                const isActive = attendanceViewerStatus === status;
                                const isLoading = attendanceSubmitting === status;
                                return (
                                  <TouchableOpacity
                                    key={status}
                                    style={[
                                      styles.attendanceButton,
                                      isActive ? styles.attendanceButtonActive : null,
                                    ]}
                                    onPress={() => handleAttendanceSubmit(status)}
                                    disabled={Boolean(attendanceSubmitting)}
                                    activeOpacity={0.85}
                                  >
                                    {isLoading ? (
                                      <ActivityIndicator size="small" color="#ffffff" />
                                    ) : (
                                      <Text
                                        style={[
                                          styles.attendanceButtonText,
                                          isActive ? styles.attendanceButtonTextActive : null,
                                        ]}
                                      >
                                        {meta.label}
                                      </Text>
                                    )}
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          ) : null}
                          {attendancePoll?.viewer ? (
                            <View style={styles.attendanceStatusRow}>
                              <View
                                style={[
                                  styles.attendanceBadge,
                                  {
                                    backgroundColor:
                                      ATTENDANCE_STATUS_META[attendanceViewerStatus]?.background ||
                                      '#E5E7EB',
                                    borderColor:
                                      ATTENDANCE_STATUS_META[attendanceViewerStatus]?.color ||
                                      '#374151',
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.attendanceBadgeText,
                                    {
                                      color:
                                        ATTENDANCE_STATUS_META[attendanceViewerStatus]?.color ||
                                        '#374151',
                                    },
                                  ]}
                                >
                                  {formatAttendanceStatus(attendanceViewerStatus)}
                                </Text>
                              </View>
                              {attendancePoll?.viewer?.respondedAt ? (
                                <Text style={styles.attendanceMetaText}>
                                  Updated {formatShortDateTimeLabel(attendancePoll.viewer.respondedAt)}
                                </Text>
                              ) : null}
                            </View>
                          ) : null}
                        </>
                      ) : (
                        <Text style={styles.attendanceMetaText}>
                          Attendance check is available to organizers and approved hikers.
                        </Text>
                      )}
                      {isOrganizer && attendancePoll?.summary ? (
                        <View style={styles.reminderCard}>
                          <View style={styles.attendanceSummaryRow}>
                            <Text style={styles.attendanceSummaryChip}>
                              Going: {attendancePoll.summary.going}
                            </Text>
                            <Text style={styles.attendanceSummaryChip}>
                              Unsure: {attendancePoll.summary.unsure}
                            </Text>
                            <Text style={styles.attendanceSummaryChip}>
                              Not going: {attendancePoll.summary.notGoing}
                            </Text>
                          </View>
                          <TouchableOpacity
                            style={[
                              styles.reminderButton,
                              reminderSending === 'attendance' && styles.reminderButtonDisabled,
                            ]}
                            onPress={() => handleSendReminder('attendance')}
                            disabled={Boolean(reminderSending)}
                            activeOpacity={0.85}
                          >
                            {reminderSending === 'attendance' ? (
                              <ActivityIndicator size="small" color="#ffffff" />
                            ) : (
                              <Text style={styles.reminderButtonText}>Remind via chat</Text>
                            )}
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[
                              styles.reminderGhostButton,
                              reminderSending === 'start' && styles.reminderGhostButtonDisabled,
                            ]}
                            onPress={() => handleSendReminder('start')}
                            disabled={Boolean(reminderSending)}
                            activeOpacity={0.85}
                          >
                            {reminderSending === 'start' ? (
                              <ActivityIndicator size="small" color="#065f46" />
                            ) : (
                              <Text style={styles.reminderGhostButtonText}>Send start reminder</Text>
                            )}
                          </TouchableOpacity>
                          <Text style={styles.attendanceMetaText}>
                            {attendancePromptSentLabel
                              ? `Attendance prompt last sent ${attendancePromptSentLabel}.`
                              : 'No attendance prompt sent to chat yet.'}
                          </Text>
                          {startReminderScheduledLabel ? (
                            <Text style={styles.attendanceMetaText}>
                              Start reminder scheduled for {startReminderScheduledLabel}.
                            </Text>
                          ) : null}
                          {startReminderSentLabel ? (
                            <Text style={styles.attendanceMetaText}>
                              Last start reminder sent {startReminderSentLabel}.
                            </Text>
                          ) : null}
                        </View>
                      ) : null}
                    </>
                  )}
                </View>
                {viewerCanAccessEventChat ? (
                  <TouchableOpacity
                    style={[styles.eventChatButton, (!viewerCanAccessEventChat || eventChatLoading) && styles.eventChatButtonDisabled]}
                    onPress={handleOpenEventChat}
                    disabled={!viewerCanAccessEventChat || eventChatLoading}
                    activeOpacity={0.85}
                  >
                    {eventChatLoading ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text style={styles.eventChatButtonText}>Open event chat</Text>
                    )}
                    <Text style={styles.eventChatButtonSubtext}>
                      Chat with the organizer and confirmed hikers
                    </Text>
                  </TouchableOpacity>
                ) : null}
                {attendeesLoading ? (
                  <View style={styles.attendeeLoading}>
                    <ActivityIndicator size="small" color="#2E7D32" />
                    <Text style={styles.attendeeLoadingText}>Loading attendees...</Text>
                  </View>
                ) : attendeesError ? (
                  <Text style={styles.attendeeError}>{attendeesError}</Text>
                ) : attendees.length ? (
                  attendees.map((booking, index) => (
                  <AttendeeRow
                      key={booking?.id || index}
                      booking={booking}
                      index={index}
                      isCurrentUser={user?.id === booking?.userId}
                      showReceiptLink={Boolean(isOrganizer || user?.id === booking?.userId)}
                      canManage={isOrganizer}
                      onUpdateStatus={handleUpdateBookingStatus}
                      actionInFlight={bookingActionInFlight}
                      onViewProfile={handleNavigateToProfile}
                    />
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
            <TouchableOpacity
              style={[
                styles.organizerInfo,
                !canViewOrganizerProfile ? styles.organizerInfoDisabled : null,
              ]}
              onPress={handleViewOrganizerProfile}
              disabled={!canViewOrganizerProfile}
              activeOpacity={0.75}
            >
              {organizerAvatarUrl ? (
                <Image source={{ uri: organizerAvatarUrl }} style={styles.organizerAvatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarInitials}>{organizerInitials}</Text>
                </View>
              )}
              <View>
                <Text style={styles.organizerName}>{organizerName}</Text>
                <Text style={styles.organizerDate}>Event Organizer</Text>
                {organizerFollowersLabel ? (
                  <Text style={styles.organizerFollowers}>{organizerFollowersLabel}</Text>
                ) : null}
                {canViewOrganizerProfile ? (
                  <Text style={styles.organizerProfileLink}>Go to profile</Text>
                ) : null}
              </View>
            </TouchableOpacity>
            {!isOrganizer ? (
              <View style={styles.actionButtons}>
                <TouchableOpacity
                  style={[
                    styles.followBtn,
                    isFollowingOrganizer ? styles.followingBtn : null,
                    followUpdating || organizerLoading ? styles.followBtnDisabled : null,
                  ]}
                  onPress={handleOrganizerFollowToggle}
                  disabled={!organizerId || followUpdating || organizerLoading}
                  activeOpacity={0.8}
                >
                  {followUpdating ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text
                      style={[
                        styles.followText,
                        isFollowingOrganizer ? styles.followingText : null,
                      ]}
                    >
                      {isFollowingOrganizer ? 'Following' : 'Follow'}
                    </Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.messageBtn,
                    (!organizerId || organizerMessageInFlight || organizerLoading) &&
                      styles.messageBtnDisabled,
                  ]}
                  onPress={() => handleMessageUser(organizerProfile)}
                  disabled={!organizerId || organizerMessageInFlight || organizerLoading}
                  activeOpacity={0.8}
                >
                  {organizerMessageInFlight ? (
                    <ActivityIndicator size="small" color="#2E7D32" />
                  ) : (
                    <Text style={styles.messageText}>Message</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : null}
          </View>

          <View style={styles.commentsSection}>
            <View style={styles.commentsHeader}>
              <Text style={styles.commentsTitle}>Comments</Text>
              {typeof commentCount === 'number' ? (
                <TouchableOpacity
                  onPress={handleOpenComments}
                  disabled={commentsLoading}
                  activeOpacity={0.7}
                >
                  <Text style={styles.commentsCount}>
                    {commentCount} {commentCount === 1 ? 'comment' : 'comments'}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {commentsError ? (
              <Text style={styles.commentError}>{commentsError}</Text>
            ) : commentsLoading && previewComments.length === 0 ? (
              <View style={styles.commentsLoading}>
                <ActivityIndicator size="small" color="#2E7D32" />
                <Text style={styles.commentsLoadingText}>Loading comments...</Text>
              </View>
            ) : previewComments.length === 0 ? (
              <Text style={styles.commentEmpty}>
                Be the first to share a thought about this event.
              </Text>
            ) : (
              previewComments.map((comment) => renderCommentItem(comment))
            )}

            {(previewComments.length > 0 || viewerCanComment) && (
              <TouchableOpacity
                style={[
                  styles.commentPreviewButton,
                  commentsLoading ? styles.commentPreviewButtonDisabled : null,
                ]}
                onPress={handleOpenComments}
                disabled={commentsLoading}
                activeOpacity={0.75}
              >
                <Text style={styles.commentPreviewButtonText}>{commentsCtaLabel}</Text>
              </TouchableOpacity>
            )}

            {!viewerCanComment ? (
              <Text style={styles.commentAuthNote}>
                Sign in to join the discussion and ask the organizer questions.
              </Text>
            ) : null}
          </View>
        </View>
      </ScrollView>

      {viewerCanBook ? (
        <TouchableOpacity
          style={[styles.bookButton, hasReadinessBlockers ? styles.bookButtonDisabled : null]}
          onPress={handleBookPress}
          activeOpacity={0.85}
        >
          <Text style={styles.bookText}>Book Now</Text>
        </TouchableOpacity>
      ) : null}

      <Modal
        visible={commentsVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleCloseComments}
      >
        <View style={styles.commentsModalContainer}>
          <View style={styles.commentsModalHeader}>
            <Text style={styles.commentsModalTitle}>Comments</Text>
            <TouchableOpacity
              onPress={handleCloseComments}
              hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
            >
              <Icon name="x" size={22} color="#475569" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.commentsModalScroll}
            contentContainerStyle={styles.commentsModalList}
            showsVerticalScrollIndicator={false}
          >
            {commentsLoading && comments.length === 0 ? (
              <View style={styles.commentsLoading}>
                <ActivityIndicator size="small" color="#2E7D32" />
                <Text style={styles.commentsLoadingText}>Loading comments...</Text>
              </View>
            ) : commentsError ? (
              <Text style={styles.commentError}>{commentsError}</Text>
            ) : comments.length === 0 ? (
              <Text style={styles.commentEmpty}>Be the first to leave a comment.</Text>
            ) : (
              comments.map((comment) => renderCommentItem(comment))
            )}
          </ScrollView>

          <View style={styles.commentsModalInputWrapper}>
            {viewerCanComment ? (
              <>
                <TextInput
                  style={styles.commentInputField}
                  placeholder="Add a comment..."
                  placeholderTextColor="#94A3B8"
                  value={commentText}
                  onChangeText={setCommentText}
                  editable={!commentSubmitting}
                  multiline
                  maxLength={280}
                />
                <TouchableOpacity
                  onPress={handleSubmitComment}
                  disabled={!canSubmitComment}
                  style={[
                    styles.commentSubmitButton,
                    !canSubmitComment ? styles.commentSubmitButtonDisabled : null,
                  ]}
                  activeOpacity={0.75}
                >
                  <Text style={styles.commentSubmitText}>
                    {commentSubmitting ? 'Posting...' : 'Post'}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <Text style={styles.commentAuthNote}>
                Sign in to join the discussion and ask the organizer questions.
              </Text>
            )}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
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
  statusLabel: { fontSize: 13, color: '#1F2937', fontWeight: '600', marginBottom: 4 },
  registrationLabel: { fontSize: 12, color: '#475569', marginBottom: 12 },
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
  mountainTagChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
    marginTop: 8,
  },
  mountainTagText: { color: '#0f172a', fontSize: 12, fontWeight: '700' },
  ageNotice: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  ageNoticeInfo: { backgroundColor: '#EFF6FF', borderColor: '#93C5FD' },
  ageNoticeWarning: { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' },
  ageNoticeSuccess: { backgroundColor: '#ECFDF3', borderColor: '#86EFAC' },
  ageNoticeTitle: { fontSize: 13, fontWeight: '700', color: '#0F172A', marginBottom: 4 },
  ageNoticeBody: { fontSize: 13, lineHeight: 19, color: '#1F2937' },
  readinessNotice: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  readinessTitle: { fontSize: 13, fontWeight: '700', color: '#0F172A', marginBottom: 4 },
  readinessBody: { fontSize: 13, lineHeight: 19, color: '#1F2937' },
  readinessGate: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  readinessGateWarning: { backgroundColor: '#FEFCE8', borderColor: '#FACC15' },
  readinessGateBlocked: { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' },
  readinessGateTitle: { fontSize: 13, fontWeight: '700', color: '#0F172A', marginBottom: 6 },
  readinessGateItem: { fontSize: 13, lineHeight: 19, color: '#1F2937' },
  readinessGateFooter: { marginTop: 6, fontSize: 12, color: '#6B7280' },
  matchCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  matchCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  matchCardTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  matchCardPercent: {
    fontSize: 22,
    fontWeight: '800',
  },
  matchCardHeadline: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 4,
  },
  matchCardSummary: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
    marginTop: 6,
  },
  matchBreakdownList: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(15, 23, 42, 0.08)',
    paddingTop: 12,
  },
  matchBreakdownItem: { marginBottom: 12 },
  matchBreakdownLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
    letterSpacing: 0.3,
  },
  matchBreakdownDetail: { fontSize: 13, lineHeight: 19, color: '#1F2937' },
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
  attendeeSummaryCard: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: 16,
    marginBottom: 18,
    backgroundColor: '#F8FAFC',
  },
  attendeeSummaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 10,
  },
  attendeeSummaryTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
    textTransform: 'uppercase',
  },
  attendeeSummaryMeta: { fontSize: 13, fontWeight: '600', color: '#0F172A' },
  attendeeSummaryBar: {
    height: 10,
    borderRadius: 999,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
    marginBottom: 8,
  },
  attendeeSummaryProgress: {
    height: '100%',
    backgroundColor: '#2E7D32',
    borderRadius: 999,
  },
  attendeeSummaryCaption: { fontSize: 12, color: '#475569' },
  capacityNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    marginBottom: 18,
    borderWidth: 1,
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  capacityNoticeOpen: { backgroundColor: '#ECFDF3', borderColor: '#C3E7D2' },
  capacityNoticeFull: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  capacityNoticeNeutral: { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' },
  capacityIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    backgroundColor: '#166534',
  },
  capacityIconOpen: { backgroundColor: '#166534' },
  capacityIconFull: { backgroundColor: '#B91C1C' },
  capacityIconNeutral: { backgroundColor: '#0F172A' },
  capacityTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  capacitySubtitle: { fontSize: 12, color: '#475569', marginTop: 2 },
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
  organizerInfoDisabled: { opacity: 0.7 },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#cbd5f5',
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  organizerAvatar: { width: 44, height: 44, borderRadius: 22, marginRight: 12 },
  avatarInitials: { fontSize: 16, fontWeight: '700', color: '#1f2937' },
  organizerName: { fontWeight: '700', fontSize: 14, color: '#1f2937' },
  organizerDate: { fontSize: 12, color: '#64748b' },
  organizerFollowers: { fontSize: 12, color: '#475569', marginTop: 2 },
  organizerProfileLink: { fontSize: 12, color: '#2563eb', fontWeight: '600', marginTop: 4 },
  actionButtons: { flexDirection: 'row' },
  followBtn: {
    backgroundColor: '#2E7D32',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  followingBtn: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#2E7D32',
  },
  followBtnDisabled: { opacity: 0.7 },
  followText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  followingText: { color: '#2E7D32' },
  messageBtn: {
    borderWidth: 1,
    borderColor: '#2E7D32',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    marginLeft: 10,
  },
  messageText: { color: '#2E7D32', fontSize: 12, fontWeight: '600' },
  messageBtnDisabled: { opacity: 0.7 },
  commentsSection: { marginTop: 8 },
  commentsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  commentsTitle: { fontWeight: '700', fontSize: 16, color: '#1F2937' },
  commentsCount: { fontSize: 12, fontWeight: '600', color: '#2E7D32' },
  commentsLoading: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  commentsLoadingText: { marginLeft: 8, color: '#475569', fontSize: 13 },
  commentError: { color: '#b91c1c', fontSize: 13, marginBottom: 8 },
  commentEmpty: { color: '#6b7280', fontSize: 13, marginBottom: 8 },
  commentCard: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    alignItems: 'flex-start',
  },
  commentAvatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12 },
  commentAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  commentAvatarInitials: { fontSize: 14, fontWeight: '700', color: '#1f2937' },
  commentBody: { flex: 1 },
  commentAuthor: { fontWeight: '600', fontSize: 13, marginBottom: 2, color: '#1F2937' },
  commentText: { fontSize: 13, color: '#4B5563', lineHeight: 19 },
  commentMeta: { fontSize: 11, color: '#94A3B8', marginTop: 4 },
  commentPreviewButton: { marginTop: 12, alignSelf: 'flex-start' },
  commentPreviewButtonDisabled: { opacity: 0.6 },
  commentPreviewButtonText: { color: '#1d4ed8', fontSize: 13, fontWeight: '600' },
  commentAuthNote: { marginTop: 8, fontSize: 12, color: '#94A3B8' },
  commentInputField: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0f172a',
    backgroundColor: '#ffffff',
    minHeight: 48,
    textAlignVertical: 'top',
  },
  commentSubmitButton: {
    marginTop: 12,
    alignSelf: 'flex-end',
    backgroundColor: '#16A34A',
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  commentSubmitButtonDisabled: { backgroundColor: '#9CA3AF' },
  commentSubmitText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  commentsModalContainer: { flex: 1, backgroundColor: '#ffffff' },
  commentsModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  commentsModalTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  commentsModalScroll: { flex: 1 },
  commentsModalList: { paddingHorizontal: 20, paddingVertical: 16, paddingBottom: 28 },
  commentsModalInputWrapper: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#F8FAFC',
  },
  bookButton: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#2E7D32',
    padding: 18,
    alignItems: 'center',
  },
  bookButtonDisabled: {
    backgroundColor: '#A3E1AC',
  },
  attendanceCard: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
    backgroundColor: '#F8FAFC',
  },
  attendanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  attendanceTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  attendanceHeadline: { fontSize: 12, color: '#475569', fontWeight: '600' },
  attendanceCopy: { fontSize: 13, color: '#1f2937', lineHeight: 19, marginBottom: 6 },
  attendanceMetaText: { fontSize: 12, color: '#64748b', marginTop: 4 },
  attendanceActions: { flexDirection: 'row', marginTop: 10, marginBottom: 6 },
  attendanceButton: {
    flex: 1,
    marginRight: 8,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  attendanceButtonActive: { backgroundColor: '#166534', borderColor: '#166534' },
  attendanceButtonText: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  attendanceButtonTextActive: { color: '#ffffff' },
  attendanceStatusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  attendanceBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    marginRight: 10,
  },
  attendanceBadgeText: { fontSize: 12, fontWeight: '700' },
  attendanceSummaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  attendanceSummaryChip: {
    marginRight: 8,
    marginBottom: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#EFF6FF',
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '700',
  },
  reminderCard: { marginTop: 10 },
  reminderButton: {
    backgroundColor: '#0F766E',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  reminderButtonDisabled: { opacity: 0.7 },
  reminderButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  reminderGhostButton: {
    borderWidth: 1,
    borderColor: '#065f46',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 6,
  },
  reminderGhostButtonDisabled: { opacity: 0.7 },
  reminderGhostButtonText: { color: '#065f46', fontSize: 13, fontWeight: '700' },
  attendeeInfo: { fontSize: 12, color: '#64748b', marginBottom: 12 },
  attendeeLoading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16 },
  attendeeLoadingText: { marginLeft: 10, color: '#4b5563', fontSize: 14 },
  attendeeError: { color: '#b91c1c', fontSize: 13 },
  attendeeEmpty: { color: '#6b7280', fontSize: 13 },
  attendeeRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  attendeeAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  attendeeAvatarImage: { width: '100%', height: '100%' },
  attendeeAvatarText: { fontSize: 14, fontWeight: '700', color: '#1f2937' },
  attendeeDetails: { flex: 1 },
  attendeeDetailsDisabled: { opacity: 0.75 },
  attendeeName: { fontSize: 14, fontWeight: '600', color: '#1f2937' },
  attendeeEmail: { fontSize: 12, color: '#6b7280' },
  attendeeProfileLink: { marginTop: 4, fontSize: 12, fontWeight: '600', color: '#2563eb' },
  attendeeMeta: { alignItems: 'flex-end' },
  attendeeActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  eventChatButton: {
    marginBottom: 16,
    backgroundColor: '#047857',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  eventChatButtonDisabled: {
    opacity: 0.6,
  },
  eventChatButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  eventChatButtonSubtext: {
    marginTop: 4,
    fontSize: 12,
    color: '#d1fae5',
  },
  attendeeActionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginLeft: 8,
    marginTop: 6,
    backgroundColor: '#e2e8f0',
    borderWidth: 1,
    borderColor: '#cbd5f5',
  },
  attendeeApproveButton: {
    backgroundColor: '#166534',
    borderColor: '#166534',
  },
  attendeePendingButton: {
    backgroundColor: '#f8fafc',
    borderColor: '#cbd5f5',
  },
  attendeeRejectButton: {
    backgroundColor: '#b91c1c',
    borderColor: '#b91c1c',
  },
  attendeeActionDisabled: {
    opacity: 0.7,
  },
  attendeeActionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  attendeeActionTextLight: {
    color: '#ffffff',
  },
  attendeeActionTextDark: {
    color: '#1f2937',
  },
  attendeeActionTextDisabled: {
    opacity: 0.7,
  },
  attendeeAmount: { fontSize: 12, fontWeight: '700', color: '#047857', textAlign: 'right' },
  attendeeStatus: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  attendeeYou: { fontSize: 12, fontWeight: '700', color: '#2563eb', marginTop: 4 },
  receiptLink: { fontSize: 12, fontWeight: '700', color: '#1d4ed8', marginTop: 4 },
  noReceipt: { fontSize: 12, color: '#9ca3af', marginTop: 4 },
  receiptRestricted: { fontSize: 12, color: '#9ca3af', marginTop: 4 },
  bookText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  centerFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
});

