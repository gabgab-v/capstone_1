import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { get, post, patch } from '../lib/api';
import { supabase } from '../lib/supabase';
import { useNotifications } from '../context/NotificationContext';
import { useUserTrails } from '../hooks/useUserTrails';
import TrailMapPicker from '../components/TrailMapPicker';
import ScreenHeader from '../components/ScreenHeader';
import { computeLineStringMeta, formatMetersToKm } from '../utils/geo';
import { normalizeDifficultyValue } from '../utils/matchScoring';
import { TRAIL_TYPE_OPTIONS } from '../constants/trailTypes';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'details', label: 'Details' },
  { key: 'itinerary', label: 'Itinerary' },
  { key: 'trail', label: 'Trail & Location' },
];

const DEFAULT_DIFFICULTY = 'BEGINNER';
const DIFFICULTY_LEVELS = [
  {
    value: 'BEGINNER',
    label: 'Beginner',
    description: 'Ideal for newcomers with gentle terrain and low elevation gain.',
  },
  {
    value: 'INTERMEDIATE',
    label: 'Intermediate',
    description: 'Balanced challenge for hikers with some experience and stamina.',
  },
  {
    value: 'TECHNICAL',
    label: 'Technical',
    description: 'Advanced routes requiring technical skills, gear, or exposure readiness.',
  },
  {
    value: 'EXPERT',
    label: 'Expert',
    description: 'Demanding routes suited for seasoned hikers ready for steep ascents.',
  },
];

function resolveDifficultyValue(rawValue) {
  const normalized = normalizeDifficultyValue(typeof rawValue === 'string' ? rawValue : null);
  if (!normalized) {
    return DEFAULT_DIFFICULTY;
  }
  return normalized.toUpperCase();
}

function trimOrNull(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toFloatOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toIntOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : null;
}

const EVENT_STATUS_OPTIONS = [
  { value: 'PUBLISHED', label: 'Published (visible)' },
  { value: 'DRAFT', label: 'Draft (hidden)' },
  { value: 'CLOSED', label: 'Closed (no new bookings)' },
  { value: 'COMPLETED', label: 'Completed (archived)' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const EVENT_STATUS_SET = new Set(EVENT_STATUS_OPTIONS.map((option) => option.value));
const DEFAULT_EVENT_STATUS = 'PUBLISHED';

function parseDate(value) {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.valueOf()) ? null : value;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

function clampDateToRange(value, minimumDate, maximumDate) {
  const date = parseDate(value);
  if (!date) {
    return null;
  }
  const min = parseDate(minimumDate);
  const max = parseDate(maximumDate);
  let timestamp = date.getTime();
  if (min && min instanceof Date && !Number.isNaN(min.valueOf())) {
    timestamp = Math.max(timestamp, min.getTime());
  }
  if (max && max instanceof Date && !Number.isNaN(max.valueOf())) {
    timestamp = Math.min(timestamp, max.getTime());
  }
  return new Date(timestamp);
}

function formatDateTimeLabel(value) {
  const date = parseDate(value);
  if (!date) {
    return null;
  }
  const dateLabel = date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const timeLabel = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${dateLabel} at ${timeLabel}`;
}

function DateTimeInputField({
  label,
  value,
  onChange,
  placeholder = 'Select date & time',
  helperText,
  minimumDate,
  maximumDate,
  allowClear = false,
}) {
  const [iosVisible, setIosVisible] = useState(false);
  const [iosDraftDate, setIosDraftDate] = useState(
    () => clampDateToRange(value, minimumDate, maximumDate) ?? new Date(),
  );

  useEffect(() => {
    if (!iosVisible) {
      return;
    }
    setIosDraftDate(clampDateToRange(value, minimumDate, maximumDate) ?? new Date());
  }, [iosVisible, value, minimumDate, maximumDate]);

  const handleAndroidPickers = useCallback(() => {
    const initialDate = clampDateToRange(value, minimumDate, maximumDate) ?? new Date();
    const minDate = parseDate(minimumDate);
    const maxDate = parseDate(maximumDate);

    const openTimePicker = (baseDate) => {
      DateTimePickerAndroid.open({
        value: baseDate,
        mode: 'time',
        is24Hour: false,
        onChange: (event, selectedTime) => {
          if (event.type !== 'set' || !selectedTime) {
            return;
          }
          const combined = new Date(baseDate);
          combined.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0);
          onChange(combined);
        },
      });
    };

    DateTimePickerAndroid.open({
      value: initialDate,
      mode: 'date',
      minimumDate: minDate ?? undefined,
      maximumDate: maxDate ?? undefined,
      onChange: (event, selectedDate) => {
        if (event.type !== 'set' || !selectedDate) {
          return;
        }
        openTimePicker(new Date(selectedDate));
      },
    });
  }, [value, minimumDate, maximumDate, onChange]);

  const handleOpenPicker = useCallback(() => {
    if (Platform.OS === 'android') {
      handleAndroidPickers();
    } else {
      setIosVisible(true);
    }
  }, [handleAndroidPickers]);

  const handleIosCancel = useCallback(() => {
    setIosVisible(false);
  }, []);

  const handleIosSave = useCallback(() => {
    setIosVisible(false);
    onChange(iosDraftDate);
  }, [iosDraftDate, onChange]);

  const handleIosChange = useCallback((_, selectedDate) => {
    if (selectedDate) {
      setIosDraftDate(selectedDate);
    }
  }, []);

  const formattedValue = formatDateTimeLabel(value);
  const displayValue = formattedValue ?? placeholder;

  return (
    <View style={styles.datetimeField}>
      <View style={styles.datetimeHeader}>
        <Text style={styles.infoLabel}>{label}</Text>
        {allowClear && value ? (
          <TouchableOpacity onPress={() => onChange(null)}>
            <Text style={styles.clearButtonText}>Clear</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <TouchableOpacity
        style={styles.datetimeValue}
        onPress={handleOpenPicker}
        activeOpacity={0.85}
      >
        <Icon name="calendar" size={18} color="#1d4ed8" style={styles.datetimeIcon} />
        <Text
          style={[
            styles.datetimeValueText,
            !formattedValue && styles.datetimeValuePlaceholder,
          ]}
        >
          {displayValue}
        </Text>
      </TouchableOpacity>
      {helperText ? <Text style={styles.helperText}>{helperText}</Text> : null}

      {Platform.OS === 'ios' && iosVisible ? (
        <Modal
          transparent
          animationType="slide"
          visible={iosVisible}
          onRequestClose={handleIosCancel}
        >
          <View style={styles.iosModalBackdrop}>
            <View style={styles.iosModalContainer}>
              <View style={styles.iosModalToolbar}>
                <TouchableOpacity onPress={handleIosCancel}>
                  <Text style={styles.iosModalToolbarButton}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleIosSave}>
                  <Text
                    style={[
                      styles.iosModalToolbarButton,
                      styles.iosModalToolbarButtonPrimary,
                    ]}
                  >
                    Save
                  </Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={iosDraftDate}
                mode="datetime"
                display="spinner"
                minimumDate={parseDate(minimumDate) ?? undefined}
                maximumDate={parseDate(maximumDate) ?? undefined}
                onChange={handleIosChange}
                style={styles.iosPicker}
              />
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

export default function CreateEventPage({ route, navigation }) {
  const isEditMode = route?.params?.mode === 'edit';
  const eventFromParams = route?.params?.event ?? null;
  const eventIdFromParams = route?.params?.eventId ?? eventFromParams?.id ?? null;
  const onEventUpdated = route?.params?.onEventUpdated;

  const [editingEvent, setEditingEvent] = useState(eventFromParams ?? null);
  const [loadingExisting, setLoadingExisting] = useState(Boolean(isEditMode && !eventFromParams));
  const hasPrefilledRef = useRef(false);

  const [activeTab, setActiveTab] = useState('overview');

  const [title, setTitle] = useState(() => eventFromParams?.title ?? '');
  const [overview, setOverview] = useState(() => eventFromParams?.overview ?? '');
  const [itinerary, setItinerary] = useState(() => eventFromParams?.itinerary ?? '');
  const [directions, setDirections] = useState(() => eventFromParams?.directions ?? '');
  const [distanceKm, setDistanceKm] = useState(() =>
    Number.isFinite(Number(eventFromParams?.distanceKm)) ? String(eventFromParams.distanceKm) : '',
  );
  const [durationHrs, setDurationHrs] = useState(() =>
    Number.isFinite(Number(eventFromParams?.durationHrs)) ? String(eventFromParams.durationHrs) : '',
  );
  const [steps, setSteps] = useState(() =>
    Number.isFinite(Number(eventFromParams?.steps)) ? String(eventFromParams.steps) : '',
  );
  const [elevationM, setElevationM] = useState(() =>
    Number.isFinite(Number(eventFromParams?.elevationM)) ? String(eventFromParams.elevationM) : '',
  );
  const [price, setPrice] = useState(() =>
    Number.isFinite(Number(eventFromParams?.price)) ? String(eventFromParams.price) : '',
  );
  const [difficulty, setDifficulty] = useState(() =>
    resolveDifficultyValue(eventFromParams?.difficulty),
  );
  const [gcashNumber, setGcashNumber] = useState(() => eventFromParams?.gcashNumber ?? '');
  const { scheduleNotification } = useNotifications();
  const [selectedImage, setSelectedImage] = useState(() =>
    eventFromParams?.imageUrl ? { uri: eventFromParams.imageUrl } : null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [selectedTrailId, setSelectedTrailId] = useState(() => eventFromParams?.trailId ?? null);
  const [trailType, setTrailType] = useState(() => eventFromParams?.trailType ?? '');
  const [locationName, setLocationName] = useState(() => eventFromParams?.locationName ?? '');

  const initialLatitude = Number(eventFromParams?.locationLatitude);
  const initialLongitude = Number(eventFromParams?.locationLongitude);
  const [selectedLocation, setSelectedLocation] = useState(() =>
    Number.isFinite(initialLatitude) && Number.isFinite(initialLongitude)
      ? { lat: initialLatitude, lng: initialLongitude }
      : null,
  );
  const [startsAt, setStartsAt] = useState(() => parseDate(eventFromParams?.startsAt));
  const [endsAt, setEndsAt] = useState(() => parseDate(eventFromParams?.endsAt));
  const [registrationOpensAt, setRegistrationOpensAt] = useState(() =>
    parseDate(eventFromParams?.registrationOpensAt),
  );
  const [registrationClosesAt, setRegistrationClosesAt] = useState(() =>
    parseDate(eventFromParams?.registrationClosesAt),
  );
  const [announceAt, setAnnounceAt] = useState(() => parseDate(eventFromParams?.announceAt));
  const [minParticipants, setMinParticipants] = useState(() =>
    Number.isFinite(Number(eventFromParams?.minParticipants))
      ? String(eventFromParams.minParticipants)
      : '0',
  );
  const [maxParticipants, setMaxParticipants] = useState(() =>
    Number.isFinite(Number(eventFromParams?.maxParticipants)) &&
    Number(eventFromParams?.maxParticipants) > 0
      ? String(eventFromParams.maxParticipants)
      : '',
  );
  const [status, setStatus] = useState(() => {
    const raw =
      typeof eventFromParams?.status === 'string'
        ? eventFromParams.status.toUpperCase()
        : null;
    return raw && EVENT_STATUS_SET.has(raw) ? raw : DEFAULT_EVENT_STATUS;
  });
  const trailTypePickerOptions = useMemo(
    () => [{ label: 'Select...', value: '' }, ...TRAIL_TYPE_OPTIONS],
    [],
  );

  const initialZoom = Number(eventFromParams?.locationZoomLevel);
  const [locationZoomLevel, setLocationZoomLevel] = useState(() =>
    Number.isFinite(initialZoom) ? initialZoom : null,
  );
  const [locationBounds, setLocationBounds] = useState(() => {
    const bounds = eventFromParams?.locationBounds;
    if (
      bounds &&
      Array.isArray(bounds.northEast) &&
      bounds.northEast.length === 2 &&
      Array.isArray(bounds.southWest) &&
      bounds.southWest.length === 2
    ) {
      return bounds;
    }
    return null;
  });

  const {
    trails,
    loading: trailsLoading,
    error: trailsError,
    refresh: refreshTrails,
  } = useUserTrails();

  const selectedTrail = useMemo(() => {
    if (selectedTrailId) {
      const matched = trails.find((trail) => trail.id === selectedTrailId);
      if (matched) {
        return matched;
      }
    }
    if (isEditMode) {
      return editingEvent?.trail ?? eventFromParams?.trail ?? null;
    }
    return null;
  }, [trails, selectedTrailId, isEditMode, editingEvent, eventFromParams]);

  const activeEvent = editingEvent ?? eventFromParams ?? null;

  useEffect(() => {
    if (!isEditMode || !activeEvent || hasPrefilledRef.current) {
      return;
    }

    setTitle(activeEvent.title ?? '');
    setOverview(activeEvent.overview ?? '');
    setItinerary(activeEvent.itinerary ?? '');
    setDirections(activeEvent.directions ?? '');

    setDistanceKm(
      Number.isFinite(Number(activeEvent.distanceKm)) ? String(activeEvent.distanceKm) : '',
    );
    setDurationHrs(
      Number.isFinite(Number(activeEvent.durationHrs)) ? String(activeEvent.durationHrs) : '',
    );
    setSteps(Number.isFinite(Number(activeEvent.steps)) ? String(activeEvent.steps) : '');
    setElevationM(
      Number.isFinite(Number(activeEvent.elevationM)) ? String(activeEvent.elevationM) : '',
    );
    setPrice(Number.isFinite(Number(activeEvent.price)) ? String(activeEvent.price) : '');
    setDifficulty(resolveDifficultyValue(activeEvent.difficulty));
    setGcashNumber(activeEvent.gcashNumber ?? '');
    setTrailType(activeEvent.trailType ?? '');

    setSelectedImage(activeEvent.imageUrl ? { uri: activeEvent.imageUrl } : null);
    setSelectedTrailId(activeEvent.trailId ?? null);
    setLocationName(activeEvent.locationName ?? '');

    const lat = Number(activeEvent.locationLatitude);
    const lng = Number(activeEvent.locationLongitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      setSelectedLocation({ lat, lng });
    } else {
      setSelectedLocation(null);
    }

    const zoom = Number(activeEvent.locationZoomLevel);
    setLocationZoomLevel(Number.isFinite(zoom) ? zoom : null);

    const bounds = activeEvent.locationBounds;
    if (
      bounds &&
      Array.isArray(bounds.northEast) &&
      bounds.northEast.length === 2 &&
      Array.isArray(bounds.southWest) &&
      bounds.southWest.length === 2
    ) {
      setLocationBounds(bounds);
    } else {
      setLocationBounds(null);
    }

    setStartsAt(parseDate(activeEvent.startsAt));
    setEndsAt(parseDate(activeEvent.endsAt));
    setRegistrationOpensAt(parseDate(activeEvent.registrationOpensAt));
    setRegistrationClosesAt(parseDate(activeEvent.registrationClosesAt));
    setAnnounceAt(parseDate(activeEvent.announceAt));
    setMinParticipants(
      Number.isFinite(Number(activeEvent.minParticipants))
        ? String(activeEvent.minParticipants)
        : '0',
    );
    setMaxParticipants(
      Number.isFinite(Number(activeEvent.maxParticipants)) &&
      Number(activeEvent.maxParticipants) > 0
        ? String(activeEvent.maxParticipants)
        : '',
    );
    setStatus(
      typeof activeEvent.status === 'string' &&
        EVENT_STATUS_SET.has(activeEvent.status.toUpperCase())
        ? activeEvent.status.toUpperCase()
        : DEFAULT_EVENT_STATUS,
    );

    hasPrefilledRef.current = true;
  }, [isEditMode, activeEvent]);

  useEffect(() => {
    if (!isEditMode || editingEvent || !eventIdFromParams) {
      return undefined;
    }

    let cancelled = false;

    const loadEvent = async () => {
      try {
        setLoadingExisting(true);
        const response = await get(`/api/events/${eventIdFromParams}`);
        if (!cancelled) {
          setEditingEvent(response ?? null);
        }
      } catch (error) {
        console.error(`Failed to load event ${eventIdFromParams}:`, error);
        if (!cancelled) {
          Alert.alert('Unable to load event', 'Please try again later.');
        }
      } finally {
        if (!cancelled) {
          setLoadingExisting(false);
        }
      }
    };

    loadEvent();

    return () => {
      cancelled = true;
    };
  }, [isEditMode, editingEvent, eventIdFromParams]);

  const handleSelectTrail = useCallback((trail) => {
    if (!trail) {
      return;
    }

    setSelectedTrailId(trail.id);

    const meta = computeLineStringMeta(trail.geoJson);
    if (meta?.start && Array.isArray(meta.start)) {
      setSelectedLocation({ lng: meta.start[0], lat: meta.start[1] });
    } else if (meta?.center && Array.isArray(meta.center)) {
      setSelectedLocation({ lng: meta.center[0], lat: meta.center[1] });
    } else {
      setSelectedLocation(null);
    }

    setLocationBounds(meta?.bounds ?? null);
    setLocationZoomLevel(meta?.approxZoom ?? null);

    setLocationName((prev) => {
      if (prev && prev.trim().length > 0) {
        return prev;
      }
      return trimOrNull(trail.label) ?? '';
    });
  }, []);

  useEffect(() => {
    if (!selectedTrailId && trails.length > 0) {
      handleSelectTrail(trails[0]);
    }
  }, [trails, selectedTrailId, handleSelectTrail]);

  const handleLocationSelect = useCallback((coordinate) => {
    setSelectedLocation(coordinate);
  }, []);

  const handleCameraChanged = useCallback((event) => {
    const zoom = event?.properties?.zoom;
    if (Number.isFinite(zoom)) {
      setLocationZoomLevel(zoom);
    }

    const bounds = event?.properties?.bounds;
    if (bounds) {
      const parseCoord = (coord) => {
        if (Array.isArray(coord) && coord.length >= 2) {
          const lng = Number(coord[0]);
          const lat = Number(coord[1]);
          if (Number.isFinite(lng) && Number.isFinite(lat)) {
            return [lng, lat];
          }
        }
        if (coord && typeof coord === 'object') {
          const lng = Number(coord.longitude ?? coord.lng);
          const lat = Number(coord.latitude ?? coord.lat);
          if (Number.isFinite(lng) && Number.isFinite(lat)) {
            return [lng, lat];
          }
        }
        return null;
      };

      const northEast = parseCoord(bounds.ne ?? bounds.northEast);
      const southWest = parseCoord(bounds.sw ?? bounds.southWest);
      if (northEast && southWest) {
        setLocationBounds({ northEast, southWest });
      }
    }
  }, []);

  const pickImage = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'We need access to your photos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
      base64: true,
    });

    if (!result.canceled) {
      const asset = result.assets[0];
      setSelectedImage({ uri: asset.uri, base64: asset.base64 });
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmedTitle = trimOrNull(title);
    const trimmedGcash = trimOrNull(gcashNumber);
    const normalizedTrailType = trimOrNull(trailType);
    if (!trimmedTitle) {
      Alert.alert('Missing Information', 'Please add a title for your event.');
      setActiveTab('overview');
      return;
    }
    if (!normalizedTrailType) {
      Alert.alert('Missing Information', 'Select the trail style that best describes this event.');
      setActiveTab('details');
      return;
    }
    if (!trimmedGcash) {
      Alert.alert('Missing Information', 'Please provide a GCash number.');
      setActiveTab('details');
      return;
    }

    const priceValue = toIntOrNull(price);
    if (priceValue === null) {
      Alert.alert('Missing Information', 'Please add a valid price.');
      setActiveTab('details');
      return;
    }

    const effectiveTrail = selectedTrail;
    if (!effectiveTrail) {
      Alert.alert('Trail Required', 'Select one of your recorded trails for this event.');
      setActiveTab('trail');
      return;
    }

    if (!selectedLocation) {
      Alert.alert('Location Required', 'Tap the map to set the meeting point.');
      setActiveTab('trail');
      return;
    }

    const normalizedStartsAt = parseDate(startsAt);
    if (!normalizedStartsAt) {
      Alert.alert('Missing Information', 'Set when the event starts.');
      setActiveTab('details');
      return;
    }

    const normalizedRegistrationClosesAt = parseDate(registrationClosesAt);
    if (!normalizedRegistrationClosesAt) {
      Alert.alert('Missing Information', 'Set when registration will close.');
      setActiveTab('details');
      return;
    }

    const normalizedEndsAt = parseDate(endsAt);
    if (normalizedEndsAt && normalizedEndsAt <= normalizedStartsAt) {
      Alert.alert('Check Schedule', 'The end time must be later than the start time.');
      setActiveTab('details');
      return;
    }

    const normalizedRegistrationOpensAt = parseDate(registrationOpensAt);
    if (
      normalizedRegistrationOpensAt &&
      normalizedRegistrationClosesAt &&
      normalizedRegistrationClosesAt <= normalizedRegistrationOpensAt
    ) {
      Alert.alert(
        'Check Schedule',
        'Registration closing must be scheduled after it opens.',
      );
      setActiveTab('details');
      return;
    }

    if (normalizedRegistrationClosesAt >= normalizedStartsAt) {
      Alert.alert(
        'Check Schedule',
        'Registration must close before the event starts.',
      );
      setActiveTab('details');
      return;
    }

    const normalizedAnnounceAt = parseDate(announceAt);
    if (normalizedAnnounceAt && normalizedAnnounceAt >= normalizedStartsAt) {
      Alert.alert(
        'Check Schedule',
        'Announcement time must be scheduled before the event starts.',
      );
      setActiveTab('details');
      return;
    }

    const minParticipantsTrimmed = (minParticipants ?? '').trim();
    const minParticipantsValueRaw =
      minParticipantsTrimmed.length > 0 ? toIntOrNull(minParticipantsTrimmed) : 0;
    if (minParticipantsTrimmed.length > 0 && minParticipantsValueRaw === null) {
      Alert.alert('Invalid Capacity', 'Enter a valid number for minimum hikers.');
      setActiveTab('details');
      return;
    }
    const minParticipantsValue = Math.max(0, minParticipantsValueRaw ?? 0);

    const maxParticipantsTrimmed = (maxParticipants ?? '').trim();
    let normalizedMaxParticipants = null;
    if (maxParticipantsTrimmed.length > 0) {
      const maxCandidate = toIntOrNull(maxParticipantsTrimmed);
      if (maxCandidate === null || maxCandidate <= 0) {
        Alert.alert('Invalid Capacity', 'Maximum hikers must be a positive whole number.');
        setActiveTab('details');
        return;
      }
      normalizedMaxParticipants = maxCandidate;
    }

    if (
      normalizedMaxParticipants !== null &&
      minParticipantsValue > normalizedMaxParticipants
    ) {
      Alert.alert(
        'Invalid Capacity',
        'Maximum hikers must be greater than or equal to the minimum required.',
      );
      setActiveTab('details');
      return;
    }

    const normalizedStatus = EVENT_STATUS_SET.has(status) ? status : DEFAULT_EVENT_STATUS;

    const targetEventId = activeEvent?.id ?? eventIdFromParams ?? null;
    if (isEditMode && !targetEventId) {
      Alert.alert('Missing Event', 'We could not determine which event to update. Please reopen the editor.');
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      Alert.alert('Authentication', 'Sign in again to continue.');
      return;
    }

    setIsSubmitting(true);

    let imageUrl = isEditMode ? activeEvent?.imageUrl ?? null : null;
    try {
      if (selectedImage?.base64) {
        const fileName = `${Date.now()}-${user.id}.jpg`;
        const { data, error } = await supabase.storage
          .from('Capstone')
          .upload(fileName, decode(selectedImage.base64), {
            contentType: 'image/jpeg',
          });

        if (error) {
          throw error;
        }

        const { data: urlData } = supabase.storage
          .from('Capstone')
          .getPublicUrl(data.path);

        imageUrl = urlData.publicUrl;
      } else if (isEditMode && selectedImage?.uri) {
        imageUrl = selectedImage.uri;
      }
    } catch (uploadError) {
      console.error('Image Upload Error:', uploadError);
      Alert.alert('Upload Failed', 'Failed to upload the event image.');
      setIsSubmitting(false);
      return;
    }

    try {
      const trailGeoJson = effectiveTrail?.geoJson ?? activeEvent?.trailGeoJson ?? null;
      const trailDistanceMeters =
        Number.isFinite(Number(effectiveTrail?.totalDistanceMeters))
          ? Number(effectiveTrail.totalDistanceMeters)
          : Number.isFinite(Number(activeEvent?.trailDistanceMeters))
            ? Number(activeEvent.trailDistanceMeters)
            : null;

      const eventPayload = {
        title: trimmedTitle,
        overview: trimOrNull(overview),
        itinerary: trimOrNull(itinerary),
        directions: trimOrNull(directions),
        distanceKm: toFloatOrNull(distanceKm),
        durationHrs: toFloatOrNull(durationHrs),
        steps: toIntOrNull(steps),
        elevationM: toFloatOrNull(elevationM),
        price: priceValue,
        difficulty,
        gcashNumber: trimmedGcash,
        imageUrl,
        trailId: effectiveTrail.id,
        trailGeoJson,
        trailDistanceMeters: trailDistanceMeters ?? 0,
        locationName: trimOrNull(locationName),
        locationLatitude: selectedLocation.lat,
        locationLongitude: selectedLocation.lng,
        locationZoomLevel,
        locationBounds,
        startsAt: normalizedStartsAt.toISOString(),
        endsAt: normalizedEndsAt ? normalizedEndsAt.toISOString() : null,
        registrationOpensAt: normalizedRegistrationOpensAt
          ? normalizedRegistrationOpensAt.toISOString()
          : null,
        registrationClosesAt: normalizedRegistrationClosesAt.toISOString(),
        announceAt: normalizedAnnounceAt ? normalizedAnnounceAt.toISOString() : null,
        minParticipants: minParticipantsValue,
        maxParticipants: normalizedMaxParticipants,
        status: normalizedStatus,
        trailType: normalizedTrailType,
      };

      let savedEvent;
      if (isEditMode && targetEventId) {
        savedEvent = await patch(`/api/events/${targetEventId}`, eventPayload);
        Alert.alert('Success', 'Event updated successfully!');
        onEventUpdated?.(savedEvent);
        navigation?.goBack?.();
      } else {
        savedEvent = await post('/api/events', eventPayload);
        if (normalizedStatus === 'PUBLISHED') {
          await scheduleNotification({
            title: 'Event published',
            body: `${trimmedTitle} is now live and ready for bookings.`,
            data: {
              type: 'event',
              eventId: savedEvent?.id ?? null,
            },
          });
        }
        if (
          normalizedStatus === 'PUBLISHED' &&
          normalizedAnnounceAt &&
          normalizedAnnounceAt > new Date()
        ) {
          await scheduleNotification({
            title: 'Event starting soon',
            body: `${trimmedTitle} starts ${formatDateTimeLabel(normalizedStartsAt)}.`,
            data: {
              type: 'event-start',
              eventId: savedEvent?.id ?? null,
            },
            trigger: normalizedAnnounceAt,
          });
        }
        Alert.alert('Success', 'Event created successfully!');
        console.log('Event created:', savedEvent);
      }
    } catch (err) {
      const action = isEditMode ? 'Update' : 'Create';
      console.error(`${action} event error:`, err);
      Alert.alert('Error', err.message || 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  }, [
    title,
    overview,
    itinerary,
    directions,
    distanceKm,
    durationHrs,
    steps,
    elevationM,
    price,
    gcashNumber,
    selectedTrail,
    selectedImage,
    selectedLocation,
    locationName,
    trailType,
    locationBounds,
    locationZoomLevel,
    startsAt,
    endsAt,
    registrationOpensAt,
    registrationClosesAt,
    announceAt,
    minParticipants,
    maxParticipants,
    status,
    scheduleNotification,
    isEditMode,
    activeEvent,
    eventIdFromParams,
    onEventUpdated,
    navigation,
  ]);

  const selectedLocationText =
    selectedLocation &&
    `Lat ${selectedLocation.lat.toFixed(5)}, Lng ${selectedLocation.lng.toFixed(5)}`;

  const headerTitle = isEditMode ? 'Edit Event' : 'Create Event';
  const headerSubtitle = isEditMode
    ? activeEvent?.title ?? 'Update your event details'
    : 'Plan a new adventure for hikers';

  if (isEditMode && loadingExisting && !activeEvent) {
    return (
      <View style={styles.screen}>
        <ScreenHeader navigation={navigation} title={headerTitle} subtitle={headerSubtitle} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2E7D32" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader navigation={navigation} title={headerTitle} subtitle={headerSubtitle} />
      <ScrollView style={styles.container}>
      <TouchableOpacity style={styles.headerImageContainer} onPress={pickImage}>
        {selectedImage ? (
          <Image source={{ uri: selectedImage.uri }} style={styles.selectedImage} />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Icon name="image" size={80} color="#999999" />
            <TouchableOpacity style={styles.galleryIconContainer}>
              <Icon name="plus-circle" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.titleContainer}>
          <TextInput
            placeholder="Add Title"
            value={title}
            onChangeText={setTitle}
            style={styles.titleInput}
            placeholderTextColor="#FFFFFF"
          />
          <Icon name="edit-2" size={20} color="#FFFFFF" style={styles.titleIcon} />
        </View>
      </TouchableOpacity>

      <View style={styles.tabBar}>
        {TABS.map(({ key, label }) => (
          <TouchableOpacity key={key} onPress={() => setActiveTab(key)}>
            <Text
              style={[
                styles.tabItem,
                activeTab === key && styles.tabItemActive,
              ]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.contentContainer}>
        {activeTab === 'overview' && (
          <View>
            <Text style={styles.infoLabel}>Overview</Text>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              multiline
              value={overview}
              onChangeText={setOverview}
              placeholder="Write an overview of the event..."
            />
          </View>
        )}

        {activeTab === 'details' && (
          <View>
            <View style={styles.detailsGrid}>
              <View style={styles.infoFieldFull}>
                <Text style={styles.infoLabel}>Difficulty</Text>
                <View>
                  {DIFFICULTY_LEVELS.map((option) => {
                    const isSelected = difficulty === option.value;
                    return (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          styles.difficultyOption,
                          isSelected && styles.difficultyOptionActive,
                        ]}
                        onPress={() => setDifficulty(option.value)}
                      >
                        <Text
                          style={[
                            styles.difficultyOptionLabel,
                            isSelected && styles.difficultyOptionLabelActive,
                          ]}
                        >
                          {option.label}
                        </Text>
                        <Text
                          style={[
                            styles.difficultyOptionDescription,
                            isSelected && styles.difficultyOptionDescriptionActive,
                          ]}
                        >
                          {option.description}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={styles.infoField}>
                <Text style={styles.infoLabel}>Distance (km)</Text>
                <TextInput
                  style={styles.input}
                  value={distanceKm}
                  onChangeText={setDistanceKm}
                  keyboardType="numeric"
                  placeholder="0"
                />
              </View>

              <View style={styles.infoField}>
                <Text style={styles.infoLabel}>Estimated Time (hrs)</Text>
                <TextInput
                  style={styles.input}
                  value={durationHrs}
                  onChangeText={setDurationHrs}
                  keyboardType="numeric"
                  placeholder="0"
                />
              </View>

              <View style={styles.infoField}>
                <Text style={styles.infoLabel}>Steps</Text>
                <TextInput
                  style={styles.input}
                  value={steps}
                  onChangeText={setSteps}
                  keyboardType="numeric"
                  placeholder="0"
                />
              </View>

              <View style={styles.infoField}>
                <Text style={styles.infoLabel}>Elevation Gain (m)</Text>
                <TextInput
                  style={styles.input}
                  value={elevationM}
                  onChangeText={setElevationM}
                  keyboardType="numeric"
                  placeholder="0"
                />
              </View>

              <View style={styles.infoField}>
                <Text style={styles.infoLabel}>Price</Text>
                <TextInput
                  style={styles.input}
                  value={price}
                  onChangeText={setPrice}
                  keyboardType="numeric"
                  placeholder="0"
                />
              </View>

              <View style={styles.infoField}>
                <Text style={styles.infoLabel}>GCash Number</Text>
                <TextInput
                  style={styles.input}
                  value={gcashNumber}
                  onChangeText={setGcashNumber}
                  placeholder="09XXXXXXXXX"
                />
              </View>

              <View style={styles.infoFieldFull}>
                <Text style={styles.infoLabel}>Trail Style</Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={trailType}
                    onValueChange={(value) => setTrailType(value)}
                    style={styles.picker}
                    dropdownIconColor="#1d4ed8"
                  >
                    {trailTypePickerOptions.map((option) => (
                      <Picker.Item key={option.value} label={option.label} value={option.value} />
                    ))}
                  </Picker>
                </View>
                <Text style={styles.helperText}>
                  This helps us match the event to hikers who prefer that terrain.
                </Text>
              </View>
            </View>

            <View style={styles.subSection}>
              <Text style={styles.subSectionTitle}>Schedule</Text>
              <DateTimeInputField
                label="Event starts"
                value={startsAt}
                onChange={setStartsAt}
                helperText="Attendees will see this as the official start time."
              />
              <DateTimeInputField
                label="Event ends"
                value={endsAt}
                onChange={setEndsAt}
                allowClear
                minimumDate={startsAt}
                helperText="Optional. Helps hikers plan the total time commitment."
              />
              <DateTimeInputField
                label="Registration opens"
                value={registrationOpensAt}
                onChange={setRegistrationOpensAt}
                allowClear
                maximumDate={registrationClosesAt}
                helperText="Optional. Leave blank to accept bookings immediately."
              />
              <DateTimeInputField
                label="Registration closes"
                value={registrationClosesAt}
                onChange={setRegistrationClosesAt}
                minimumDate={registrationOpensAt}
                maximumDate={startsAt}
                helperText="Bookings close at this time. We flag the event as “closing soon” within 72 hours."
              />
              <DateTimeInputField
                label="Send start reminder"
                value={announceAt}
                onChange={setAnnounceAt}
                allowClear
                maximumDate={startsAt}
                helperText="Optional notification to remind confirmed hikers before the event."
              />
            </View>

            <View style={styles.subSection}>
              <Text style={styles.subSectionTitle}>Capacity & Visibility</Text>
              <View style={styles.capacityRow}>
                <View style={styles.capacityField}>
                  <Text style={styles.infoLabel}>Minimum hikers</Text>
                  <TextInput
                    style={styles.input}
                    value={minParticipants}
                    onChangeText={setMinParticipants}
                    keyboardType="numeric"
                    placeholder="0"
                  />
                </View>
                <View style={styles.capacityField}>
                  <Text style={styles.infoLabel}>Maximum hikers</Text>
                  <TextInput
                    style={styles.input}
                    value={maxParticipants}
                    onChangeText={setMaxParticipants}
                    keyboardType="numeric"
                    placeholder="Unlimited"
                  />
                </View>
              </View>
              <View style={styles.pickerGroup}>
                <Text style={styles.infoLabel}>Event status</Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={status}
                    onValueChange={(value) => setStatus(value)}
                    style={styles.picker}
                    dropdownIconColor="#1d4ed8"
                  >
                    {EVENT_STATUS_OPTIONS.map((option) => (
                      <Picker.Item
                        key={option.value}
                        label={option.label}
                        value={option.value}
                      />
                    ))}
                  </Picker>
                </View>
                <Text style={styles.helperText}>
                  Completed or cancelled events stay hidden from the Discover page.
                </Text>
              </View>
            </View>
          </View>
        )}

        {activeTab === 'itinerary' && (
          <View>
            <Text style={styles.infoLabel}>Itinerary</Text>
            <TextInput
              style={[styles.input, styles.largeMultilineInput]}
              multiline
              value={itinerary}
              onChangeText={setItinerary}
              placeholder="Day 1: ...&#10;Day 2: ...&#10;etc."
            />
          </View>
        )}

        {activeTab === 'trail' && (
          <View>
            <View style={styles.sectionHeader}>
              <Text style={styles.infoLabel}>Recorded Trails</Text>
              <TouchableOpacity style={styles.refreshButton} onPress={refreshTrails}>
                <Icon name="refresh-ccw" size={16} color="#1d4ed8" />
                <Text style={styles.refreshLabel}>Reload</Text>
              </TouchableOpacity>
            </View>

            {trailsLoading && (
              <ActivityIndicator color="#2563eb" style={styles.trailLoading} />
            )}

            {!trailsLoading && trailsError && (
              <Text style={styles.errorText}>
                Unable to load trails. Try refreshing.
              </Text>
            )}

            {!trailsLoading && !trailsError && trails.length === 0 && (
              <Text style={styles.helperText}>
                Record a trail first so you can attach it to your event.
              </Text>
            )}

            {!trailsLoading && !trailsError && trails.length > 0 && (
              <View style={styles.trailList}>
                {trails.map((trail) => (
                  <TouchableOpacity
                    key={trail.id}
                    style={[
                      styles.trailCard,
                      selectedTrailId === trail.id && styles.trailCardActive,
                    ]}
                    onPress={() => handleSelectTrail(trail)}
                  >
                    <Text style={styles.trailCardTitle}>
                      {trimOrNull(trail.label) ?? 'Untitled trail'}
                    </Text>
                    <Text style={styles.trailCardMeta}>
                      {formatMetersToKm(trail.totalDistanceMeters)} - {new Date(trail.startedAt).toLocaleDateString()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {selectedTrail && (
              <View style={styles.trailMapSection}>
                <TrailMapPicker
                  trail={selectedTrail}
                  selectedLocation={selectedLocation}
                  onSelectLocation={handleLocationSelect}
                  onCameraChanged={handleCameraChanged}
                  style={styles.trailMap}
                />

                <View style={styles.locationSummary}>
                  <Icon name="map-pin" size={18} color="#ef4444" style={styles.locationIcon} />
                  <Text style={styles.locationSummaryText}>
                    {selectedLocationText ||
                      'Tap the map to drop the meeting point for attendees.'}
                  </Text>
                </View>

                <Text style={styles.helperText}>
                  The selected trail path will be copied into the event preview for your guests.
                </Text>

                <Text style={styles.infoLabel}>Location Name</Text>
                <TextInput
                  style={styles.input}
                  value={locationName}
                  onChangeText={setLocationName}
                  placeholder="Trailhead or meeting spot name"
                />

                <Text style={styles.infoLabel}>Directions / Notes</Text>
                <TextInput
                  style={[styles.input, styles.largeMultilineInput]}
                  multiline
                  value={directions}
                  onChangeText={setDirections}
                  placeholder="Parking details, meetup instructions, terrain notes..."
                />
              </View>
            )}

            {!selectedTrail && trails.length > 0 && (
              <Text style={styles.helperText}>
                Choose a trail above to preview it on the map and drop your meeting point.
              </Text>
            )}
          </View>
        )}

        <TouchableOpacity
          style={[
            styles.createButton,
            (isSubmitting || loadingExisting) && styles.buttonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={isSubmitting || loadingExisting}
        >
          <Text style={styles.createButtonText}>
            {isSubmitting
              ? 'Saving...'
              : isEditMode
                ? 'Update Event'
                : 'Create Event'}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  headerImageContainer: {
    height: 250,
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  imagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0.5,
    width: '100%',
    height: '100%',
  },
  galleryIconContainer: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 15,
    padding: 2,
  },
  titleContainer: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  titleInput: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    minWidth: 200,
  },
  titleIcon: { marginLeft: 8 },
  tabBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
    backgroundColor: '#FFFFFF',
  },
  tabItem: { fontSize: 16, color: '#999999' },
  tabItemActive: {
    fontSize: 16,
    color: '#2E7D32',
    fontWeight: 'bold',
    borderBottomWidth: 2,
    borderBottomColor: '#2E7D32',
    paddingBottom: 4,
  },
  contentContainer: { padding: 20 },
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  infoFieldFull: { width: '100%', marginBottom: 16 },
  infoField: { width: '48%', marginBottom: 16 },
  infoLabel: { fontSize: 14, color: '#555555', marginBottom: 6, fontWeight: '600' },
  input: {
    backgroundColor: '#F5F5F5',
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
    color: '#333333',
    height: 45,
  },
  multilineInput: {
    height: 120,
    textAlignVertical: 'top',
  },
  largeMultilineInput: {
    height: 150,
    textAlignVertical: 'top',
  },
  difficultyOption: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#F9FAFB',
  },
  difficultyOptionActive: {
    borderColor: '#2563eb',
    backgroundColor: '#EFF6FF',
  },
  difficultyOptionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
  },
  difficultyOptionLabelActive: {
    color: '#1d4ed8',
  },
  difficultyOptionDescription: {
    marginTop: 4,
    fontSize: 13,
    color: '#4b5563',
    lineHeight: 18,
  },
  difficultyOptionDescriptionActive: {
    color: '#1e3a8a',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  refreshLabel: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: '600',
    color: '#1d4ed8',
  },
  helperText: {
    color: '#64748b',
    fontSize: 13,
    marginBottom: 12,
  },
  subSection: {
    marginTop: 24,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  subSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 14,
  },
  datetimeField: {
    marginBottom: 16,
  },
  datetimeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  clearButtonText: {
    color: '#1d4ed8',
    fontSize: 13,
    fontWeight: '600',
  },
  datetimeValue: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  datetimeIcon: {
    marginRight: 12,
  },
  datetimeValueText: {
    fontSize: 15,
    color: '#1F2937',
    fontWeight: '500',
  },
  datetimeValuePlaceholder: {
    color: '#94A3B8',
    fontWeight: '500',
  },
  iosModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  iosModalContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingBottom: 24,
    paddingTop: 12,
  },
  iosModalToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  iosModalToolbarButton: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1d4ed8',
  },
  iosModalToolbarButtonPrimary: {
    color: '#2563EB',
  },
  iosPicker: {
    backgroundColor: '#fff',
  },
  capacityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  capacityField: {
    width: '48%',
  },
  pickerGroup: {
    marginTop: 18,
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#F5F5F5',
  },
  picker: {
    width: '100%',
    height: 44,
    color: '#1F2937',
  },
  trailLoading: { marginVertical: 12 },
  trailList: {
    marginBottom: 12,
  },
  trailCard: {
    backgroundColor: '#f1f5f9',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12,
  },
  trailCardActive: {
    borderColor: '#2563eb',
    backgroundColor: '#dbeafe',
  },
  trailCardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
  },
  trailCardMeta: {
    fontSize: 12,
    color: '#475569',
    marginTop: 6,
  },
  trailMapSection: {
    marginTop: 8,
  },
  trailMap: {
    marginBottom: 12,
  },
  locationSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  locationIcon: {
    marginRight: 8,
  },
  locationSummaryText: {
    color: '#1e293b',
    fontSize: 14,
    flexShrink: 1,
  },
  createButton: {
    backgroundColor: '#2E7D32',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 30,
  },
  createButtonText: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold' },
  buttonDisabled: { opacity: 0.6 },
  selectedImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  errorText: {
    color: '#b91c1c',
    marginBottom: 12,
    fontSize: 14,
  },
});
