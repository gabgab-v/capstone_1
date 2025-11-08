import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  Image,
  RefreshControl,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { get } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const EVENT_IMAGE_PLACEHOLDER = "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee";
const STRONG_MATCH_THRESHOLD = 0.65;
const MODERATE_MATCH_THRESHOLD = 0.35;
const MIN_BREAKDOWN_SHARE = 0.01;

function truncate(text, limit = 140) {
  if (typeof text !== "string") {
    return null;
  }
  const trimmed = text.trim();
  if (trimmed.length <= limit) {
    return trimmed;
  }
  return `${trimmed.slice(0, limit - 1)}…`;
}

function getLocationLabel(event) {
  if (event?.locationName) {
    return event.locationName;
  }
  const lat = Number(event?.locationLatitude);
  const lng = Number(event?.locationLongitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return `Lat ${lat.toFixed(3)}, Lon ${lng.toFixed(3)}`;
  }
  return "Location to follow";
}

const CLOSING_SOON_THRESHOLD_HOURS = 72;

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

function formatEventDateTime(value) {
  const date = parseDate(value);
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
  const date = parseDate(value);
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

function computeClosingFlags(event) {
  const closesAt = parseDate(event?.registrationClosesAt);
  const startsAt = parseDate(event?.startsAt);
  const status =
    typeof event?.status === "string" ? event.status.trim().toUpperCase() : "PUBLISHED";
  const now = new Date();
  const registrationClosed =
    status !== "PUBLISHED" ||
    (closesAt && closesAt <= now) ||
    (startsAt && startsAt <= now);
  let closingSoon = false;
  if (!registrationClosed && closesAt) {
    const diffHours = (closesAt.getTime() - now.getTime()) / (1000 * 60 * 60);
    closingSoon = diffHours <= CLOSING_SOON_THRESHOLD_HOURS;
  }
  return {
    status,
    registrationClosed,
    closingSoon,
    closesAt,
    startsAt,
  };
}

function isEventDiscoverable(event) {
  const { status, registrationClosed, startsAt } = computeClosingFlags(event);
  if (status !== "PUBLISHED") {
    return false;
  }
  if (registrationClosed) {
    return false;
  }
  if (startsAt && startsAt <= new Date()) {
    return false;
  }
  return true;
}

const LEVEL_SCORE_MAP = {
  beginner: 0.2,
  intermediate: 0.6,
  technical: 1,
  expert: 1,
};

const MAX_DURATION_HOURS = 12;
const MAX_PRICE_PHP = 12000;
const MAX_DISTANCE_KM = 40;
const MAX_ELEVATION_M = 2000;

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function normalizeDifficultyValue(value) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized.includes("beginner") || normalized.includes("easy")) {
    return "Beginner";
  }
  if (normalized.includes("intermediate") || normalized.includes("moderate") || normalized.includes("medium")) {
    return "Intermediate";
  }
  if (normalized.includes("technical")) {
    return "Technical";
  }
  if (
    normalized.includes("expert") ||
    normalized.includes("advanced") ||
    normalized.includes("hard") ||
    normalized.includes("difficult")
  ) {
    return "Expert";
  }
  return null;
}

function levelToScore(label) {
  const normalized = normalizeDifficultyValue(label);
  if (!normalized) {
    return 0;
  }
  return LEVEL_SCORE_MAP[normalized.toLowerCase()] ?? 0;
}

function inferDifficultyFromMetrics(event) {
  const distance = Number(event?.distanceKm);
  const elevation = Number(event?.elevationM);
  const duration = Number(event?.durationHrs);

  let score = 0;
  let hasMetric = false;

  if (Number.isFinite(distance)) {
    hasMetric = true;
    if (distance >= 20) {
      score += 2;
    } else if (distance >= 10) {
      score += 1;
    }
  }

  if (Number.isFinite(elevation)) {
    hasMetric = true;
    if (elevation >= 1500) {
      score += 2;
    } else if (elevation >= 800) {
      score += 1;
    }
  }

  if (Number.isFinite(duration)) {
    hasMetric = true;
    if (duration >= 8) {
      score += 2;
    } else if (duration >= 4) {
      score += 1;
    }
  }

  if (!hasMetric) {
    return null;
  }

  if (score >= 4) {
    return "Expert";
  }
  if (score >= 2) {
    return "Intermediate";
  }
  return "Beginner";
}

function getEventDifficultyLabel(event) {
  const directLabel =
    event?.difficulty ||
    event?.difficultyLevel ||
    event?.trailDifficulty;

  return normalizeDifficultyValue(directLabel) ?? inferDifficultyFromMetrics(event);
}

function deriveEventDifficultyScore(event) {
  return levelToScore(getEventDifficultyLabel(event));
}

function parseBudgetRange(value) {
  if (typeof value !== "string") {
    return {};
  }

  const numbers = value.match(/\d+(\.\d+)?/g);
  if (!numbers) {
    return {};
  }

  const amounts = numbers
    .map((item) => Number(item))
    .filter((amount) => Number.isFinite(amount));

  if (!amounts.length) {
    return {};
  }

  if (amounts.length === 1) {
    const amount = amounts[0];
    if (/under|below|less/i.test(value)) {
      return { max: amount, midpoint: amount * 0.75 };
    }
    if (/over|above|more|greater/i.test(value)) {
      return { min: amount, midpoint: amount * 1.25 };
    }
    return { min: amount, max: amount, midpoint: amount };
  }

  const min = Math.min(...amounts);
  const max = Math.max(...amounts);
  return { min, max, midpoint: (min + max) / 2 };
}

function normalizeDuration(hours) {
  if (!Number.isFinite(hours) || hours <= 0) {
    return 0;
  }
  return clamp(hours / MAX_DURATION_HOURS);
}

function normalizeDistance(kilometers) {
  if (!Number.isFinite(kilometers) || kilometers <= 0) {
    return 0;
  }
  return clamp(kilometers / MAX_DISTANCE_KM);
}

function normalizeElevation(meters) {
  if (!Number.isFinite(meters) || meters <= 0) {
    return 0;
  }
  return clamp(meters / MAX_ELEVATION_M);
}

function normalizePrice(amount) {
  if (!Number.isFinite(amount) || amount <= 0) {
    return 0;
  }
  return clamp(amount / MAX_PRICE_PHP);
}

function formatPhp(amount) {
  if (!Number.isFinite(amount)) {
    return null;
  }
  const normalized = Math.round(amount * 100) / 100;
  return `PHP ${normalized.toLocaleString()}`;
}

function textContains(haystack, needle) {
  if (typeof haystack !== "string" || typeof needle !== "string") {
    return false;
  }
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function extractTrailDescriptor(event) {
  const parts = [
    event?.trailType,
    event?.trail?.label,
    event?.locationName,
    event?.overview,
  ].filter((value) => typeof value === "string" && value.trim().length > 0);

  if (!parts.length) {
    return null;
  }

  return parts.join(" | ");
}

function computeUserVector(user) {
  if (!user) {
    return null;
  }

  const durationScore = normalizeDuration(Number(user.preferredDurationHrs));
  const distanceScore = normalizeDistance(Number(user.preferredDistanceKm));
  const elevationScore = normalizeElevation(Number(user.preferredElevationM));
  const budgetRange = parseBudgetRange(user.budgetRange);
  const budgetScore = normalizePrice(
    typeof budgetRange.midpoint === "number"
      ? budgetRange.midpoint
      : typeof budgetRange.max === "number"
      ? budgetRange.max
      : typeof budgetRange.min === "number"
      ? budgetRange.min
      : 0
  );

  return [
    levelToScore(user.experienceLevel),
    levelToScore(user.preferredDifficulty),
    durationScore,
    budgetScore,
    user?.preferredTrailType ? 1 : 0,
    distanceScore,
    elevationScore,
  ];
}

function computeEventVector(event, user) {
  const durationScore = normalizeDuration(Number(event?.durationHrs));
  const priceScore = normalizePrice(Number(event?.price));
  const difficultyScore = deriveEventDifficultyScore(event);
  const trailPreferenceRaw =
    typeof user?.preferredTrailType === "string" ? user.preferredTrailType.trim() : "";
  const descriptor = trailPreferenceRaw ? extractTrailDescriptor(event) : null;
  const eventTrailType = typeof event?.trailType === "string" ? event.trailType.trim() : "";
  const hasDirectTrailMatch =
    trailPreferenceRaw &&
    eventTrailType &&
    eventTrailType.toLowerCase() === trailPreferenceRaw.toLowerCase();
  const trailScore =
    trailPreferenceRaw &&
    (hasDirectTrailMatch || (descriptor && textContains(descriptor, trailPreferenceRaw)))
      ? 1
      : 0;
  const distanceScore = normalizeDistance(Number(event?.distanceKm));
  const elevationScore = normalizeElevation(Number(event?.elevationM));

  return [
    difficultyScore,
    difficultyScore,
    durationScore,
    priceScore,
    trailScore,
    distanceScore,
    elevationScore,
  ];
}

function dotProduct(vectorA, vectorB) {
  return vectorA.reduce((sum, value, index) => sum + value * (vectorB[index] ?? 0), 0);
}

function magnitude(vector) {
  return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
}

function cosineSimilarity(vectorA, vectorB) {
  if (!vectorA || !vectorB) {
    return 0;
  }

  const magA = magnitude(vectorA);
  const magB = magnitude(vectorB);
  if (magA === 0 || magB === 0) {
    return 0;
  }

  return clamp(dotProduct(vectorA, vectorB) / (magA * magB), 0, 1);
}

function buildMatchBreakdown({ user, event, preferenceVector, eventVector }) {
  if (!Array.isArray(preferenceVector) || !Array.isArray(eventVector)) {
    return [];
  }

  const prefMagnitude = magnitude(preferenceVector);
  const eventMagnitude = magnitude(eventVector);
  const denominator = prefMagnitude * eventMagnitude;
  if (denominator <= 0) {
    return [];
  }

  const eventDifficultyLabel = getEventDifficultyLabel(event);
  const userPreferredDifficulty = normalizeDifficultyValue(user?.preferredDifficulty);
  const userExperienceLevel = normalizeDifficultyValue(user?.experienceLevel);
  const preferredDuration = Number(user?.preferredDurationHrs);
  const eventDuration = Number(event?.durationHrs);
  const budgetRange = parseBudgetRange(user?.budgetRange);
  const priceNumber = Number(event?.price);
  const preferredDistance = Number(user?.preferredDistanceKm);
  const eventDistance = Number(event?.distanceKm);
  const preferredElevation = Number(user?.preferredElevationM);
  const eventElevation = Number(event?.elevationM);
  const preferredTrailRaw =
    typeof user?.preferredTrailType === "string" ? user.preferredTrailType.trim() : "";
  const preferredTrail = preferredTrailRaw || "";
  const descriptor = preferredTrail ? extractTrailDescriptor(event) : null;
  const eventTrailType = typeof event?.trailType === "string" ? event.trailType.trim() : "";
  const hasDirectTrailMatch =
    preferredTrail &&
    eventTrailType &&
    eventTrailType.toLowerCase() === preferredTrail.toLowerCase();
  const matchesTrail =
    Boolean(preferredTrail) &&
    (hasDirectTrailMatch || (descriptor && textContains(descriptor, preferredTrail)));

  const context = {
    eventDifficultyLabel,
    userPreferredDifficulty,
    userExperienceLevel,
    preferredDuration,
    eventDuration,
    budgetRange,
    priceNumber,
    preferredDistance,
    eventDistance,
    preferredElevation,
    eventElevation,
    preferredTrail,
    eventTrailType,
    matchesTrail,
  };

  const formatRange = (min, max) => {
    const minText = formatPhp(min);
    const maxText = formatPhp(max);
    if (minText && maxText) {
      return `${minText}-${maxText}`;
    }
    return minText || maxText || null;
  };

  const groups = [
    {
      key: "difficulty",
      label: "Difficulty alignment",
      indices: [0, 1],
      detail: ({
        eventDifficultyLabel: difficulty,
        userPreferredDifficulty: preferred,
        userExperienceLevel: experience,
      }) => {
        const normalizedDifficulty = difficulty ? difficulty.toLowerCase() : null;
        if (!normalizedDifficulty) {
          return "We estimated the route difficulty from its metrics.";
        }

        const parts = [];
        if (preferred) {
          const normalizedPreferred = preferred.toLowerCase();
          if (preferred === difficulty) {
            parts.push(`Matches your preferred ${normalizedPreferred} hikes.`);
          } else {
            parts.push(
              `You prefer ${normalizedPreferred} hikes, while this one is ${normalizedDifficulty}.`
            );
          }
        }

        if (experience) {
          const normalizedExperience = experience.toLowerCase();
          if (!preferred || preferred !== experience) {
            if (experience === difficulty) {
              parts.push(`Fits your ${normalizedExperience} experience level.`);
            } else {
              parts.push(
                `Designed for ${normalizedDifficulty} hikers; you rate your experience as ${normalizedExperience}.`
              );
            }
          }
        }

        if (!parts.length) {
          parts.push(`Rated ${normalizedDifficulty} difficulty.`);
        }

        return parts.join(" ");
      },
    },
    {
      key: "duration",
      label: "Duration fit",
      indices: [2],
      detail: ({ preferredDuration: preferred, eventDuration: duration }) => {
        if (!Number.isFinite(duration)) {
          return "Organizer has not shared the expected duration yet.";
        }
        const durationText = `${duration.toFixed(1)} hrs`;
        if (!Number.isFinite(preferred) || preferred <= 0) {
          return `Runs for ${durationText}.`;
        }
        const diff = Math.abs(duration - preferred);
        const preferredText = `${preferred.toFixed(1)} hrs`;
        if (diff < 0.5) {
          return `Runs for ${durationText}, almost exactly your preferred ${preferredText}.`;
        }
        if (diff <= 2) {
          return `Runs for ${durationText}, close to your preferred ${preferredText}.`;
        }
        if (duration > preferred) {
          return `Runs for ${durationText}, a bit longer than your preferred ${preferredText}.`;
        }
        return `Runs for ${durationText}, a bit shorter than your preferred ${preferredText}.`;
      },
    },
    {
      key: "distance",
      label: "Distance fit",
      indices: [5],
      detail: ({ preferredDistance: preferred, eventDistance: distance }) => {
        if (!Number.isFinite(distance)) {
          return "Organizer has not shared the total distance yet.";
        }
        if (!Number.isFinite(preferred) || preferred <= 0) {
          return `Covers ${distance.toFixed(1)} km.`;
        }
        const diff = distance - preferred;
        const diffAbs = Math.abs(diff);
        const distanceText = `${distance.toFixed(1)} km`;
        const preferredText = `${preferred.toFixed(1)} km`;
        const diffText = `${diffAbs.toFixed(1)} km`;
        if (diffAbs < 0.5) {
          return `${distanceText}, right on your ${preferredText} target.`;
        }
        if (diffAbs <= 2) {
          return `${distanceText}, within ${diffText} of your ${preferredText} goal.`;
        }
        if (diff > 0) {
          return `${distanceText}, about ${diffText} longer than your ${preferredText} preference.`;
        }
        return `${distanceText}, about ${diffText} shorter than your ${preferredText} preference.`;
      },
    },
    {
      key: "elevation",
      label: "Elevation fit",
      indices: [6],
      detail: ({ preferredElevation: preferred, eventElevation: elevation }) => {
        if (!Number.isFinite(elevation)) {
          return "Organizer has not shared the elevation gain yet.";
        }
        if (!Number.isFinite(preferred) || preferred <= 0) {
          return `Climbs ${Math.round(elevation)} m in total.`;
        }
        const diff = elevation - preferred;
        const diffAbs = Math.abs(diff);
        const elevationText = `${Math.round(elevation)} m gain`;
        const preferredText = `${Math.round(preferred)} m gain`;
        const diffText = `${Math.round(diffAbs)} m`;
        if (diffAbs < 50) {
          return `${elevationText}, essentially matching your ${preferredText} target.`;
        }
        if (diffAbs <= 200) {
          return `${elevationText}, within ${diffText} of your ${preferredText} target.`;
        }
        if (diff > 0) {
          return `${elevationText}, about ${diffText} more climbing than you usually prefer.`;
        }
        return `${elevationText}, about ${diffText} less climbing than you usually look for.`;
      },
    },
    {
      key: "budget",
      label: "Budget fit",
      indices: [3],
      detail: ({ budgetRange: range, priceNumber: price }) => {
        const priceText = formatPhp(price);
        if (!priceText) {
          return "Pricing has not been announced yet.";
        }

        const withinMin =
          typeof range.min === "number" && Number.isFinite(range.min) ? price >= range.min : true;
        const withinMax =
          typeof range.max === "number" && Number.isFinite(range.max) ? price <= range.max : true;

        if (withinMin && withinMax && (range.min !== undefined || range.max !== undefined)) {
          const rangeText = formatRange(range.min, range.max);
          if (rangeText) {
            return `${priceText} sits inside your ${rangeText} target range.`;
          }
        }

        if (withinMax && typeof range.max === "number" && Number.isFinite(range.max)) {
          return `${priceText} stays below your ${formatPhp(range.max)} spending limit.`;
        }

        if (withinMin && typeof range.min === "number" && Number.isFinite(range.min)) {
          return `${priceText} meets your minimum spend of ${formatPhp(range.min)}.`;
        }

        if (Number.isFinite(range.midpoint)) {
          if (price > range.midpoint) {
            return `${priceText} is above your usual spend of ${formatPhp(range.midpoint)}.`;
          }
          if (price < range.midpoint) {
            return `${priceText} comes in under your usual spend of ${formatPhp(range.midpoint)}.`;
          }
        }

        return `${priceText} is the listed price for this event.`;
      },
    },
    {
      key: "trailType",
      label: "Trail style",
      indices: [4],
      detail: ({ preferredTrail, matchesTrail, eventTrailType }) => {
        if (!preferredTrail) {
          return null;
        }
        if (matchesTrail) {
          return `Highlights ${preferredTrail} trails, matching what you look for.`;
        }
        if (eventTrailType) {
          return `Spotlights ${eventTrailType} trails, which differs from your ${preferredTrail} preference.`;
        }
        return `Trail description has not mentioned ${preferredTrail} yet.`;
      },
    },
  ];

  return groups
    .map((group) => {
      const raw = group.indices.reduce((sum, index) => {
        const pref = preferenceVector[index] ?? 0;
        const ev = eventVector[index] ?? 0;
        return sum + pref * ev;
      }, 0);

      const contribution = raw / denominator;
      if (contribution <= 0 || contribution < MIN_BREAKDOWN_SHARE) {
        return null;
      }

      const detail = group.detail(context);
      if (!detail) {
        return null;
      }

      return {
        key: group.key,
        label: group.label,
        detail,
        contribution,
        percent: Math.max(1, Math.round(contribution * 100)),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.contribution - a.contribution);
}

export default function DiscoverPage() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const navigation = useNavigation();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const listContentInsets = useMemo(
    () => ({
      paddingTop: Math.max(18, insets.top + 12),
      paddingBottom: Math.max(24, insets.bottom + 24),
    }),
    [insets.bottom, insets.top]
  );
  const scrollIndicatorInsets = useMemo(
    () => ({
      top: Math.max(12, insets.top + 8),
      bottom: Math.max(16, insets.bottom + 8),
    }),
    [insets.bottom, insets.top]
  );

  const preferenceVector = useMemo(() => {
    if (!user?.preferencesComplete) {
      return null;
    }
    const vector = computeUserVector(user);
    return magnitude(vector) > 0 ? vector : null;
  }, [user]);

  const scoredEvents = useMemo(() => {
    if (!Array.isArray(events)) {
      return [];
    }

    const baseline = events.map((event, index) => ({
      event,
      score: null,
      index,
    }));

    if (!preferenceVector) {
      return baseline;
    }

    return baseline
      .map(({ event, index }) => {
        const eventVector = computeEventVector(event, user);
        const score = cosineSimilarity(preferenceVector, eventVector);
        const breakdown = buildMatchBreakdown({
          user,
          event,
          preferenceVector,
          eventVector,
        });
        return { event, score, index, breakdown };
      })
      .sort((a, b) => {
        if (a.score === null && b.score === null) {
          return a.index - b.index;
        }
        if (a.score === null) {
          return 1;
        }
        if (b.score === null) {
          return -1;
        }
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        return a.index - b.index;
      });
  }, [events, preferenceVector, user]);

  const topSimilarity = useMemo(() => {
    if (!preferenceVector) {
      return 0;
    }
    return scoredEvents.reduce(
      (max, { score }) => (typeof score === "number" ? Math.max(max, score) : max),
      0
    );
  }, [scoredEvents, preferenceVector]);

  const hasPreferenceMatch = Boolean(preferenceVector && topSimilarity >= MODERATE_MATCH_THRESHOLD);

  const preferenceHeader = useMemo(() => {
    if (!preferenceVector) {
      return null;
    }

    const topPercent = Math.round(topSimilarity * 100);
    const title = hasPreferenceMatch
      ? `Personalized matches (top score ${topPercent}%)`
      : "No strong matches yet";
    const description = hasPreferenceMatch
      ? "Events are ranked by your hiking profile and each event."
      : "We ranked all hikes, but none strongly align with your saved preferences yet.";

    return (
      <View style={styles.preferenceBanner}>
        <Text style={styles.preferenceBannerTitle}>{title}</Text>
        <Text style={styles.preferenceBannerText}>{description}</Text>
      </View>
    );
  }, [preferenceVector, hasPreferenceMatch, topSimilarity]);

  const preferenceHeaderStyle = preferenceHeader ? styles.preferenceBannerWrapper : null;

  const fetchEvents = useCallback(
    async ({ showSpinner = false, useRefreshControl = false } = {}) => {
      if (showSpinner) {
        setLoading(true);
      }
      if (useRefreshControl) {
        setRefreshing(true);
      }

      try {
        const data = await get("/api/events");
        const processed = Array.isArray(data)
          ? data
              .map((event) => {
                const flags = computeClosingFlags(event);
                return {
                  ...event,
                  ...(Object.prototype.hasOwnProperty.call(event, "registrationClosed")
                    ? {}
                    : { registrationClosed: flags.registrationClosed }),
                  ...(Object.prototype.hasOwnProperty.call(event, "isClosingSoon")
                    ? {}
                    : { isClosingSoon: flags.closingSoon }),
                };
              })
              .filter(isEventDiscoverable)
          : [];
        setEvents(processed);
      } catch (err) {
        console.error("Failed to fetch events:", err);
      } finally {
        if (showSpinner) {
          setLoading(false);
        }
        if (useRefreshControl) {
          setRefreshing(false);
        }
      }
    },
    []
  );

  useFocusEffect(
    useCallback(() => {
      fetchEvents({ showSpinner: events.length === 0 });
    }, [fetchEvents, events.length])
  );

  if (loading) {
    return (
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2E7D32" />
        </View>
      </SafeAreaView>
    );
  }

  if (!events.length) {
    return (
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <View style={styles.center}>
          <Text style={styles.empty}>No events yet. Check back later!</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <FlatList
        data={scoredEvents}
        keyExtractor={(item, index) => item.event?.id?.toString() ?? `event-${index}`}
        contentContainerStyle={[styles.listContent, listContentInsets]}
        scrollIndicatorInsets={scrollIndicatorInsets}
        ListHeaderComponent={preferenceHeader}
        ListHeaderComponentStyle={preferenceHeaderStyle}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchEvents({ useRefreshControl: true })}
            colors={["#2E7D32"]}
          />
        }
        renderItem={({ item }) => {
        const { event, score, breakdown } = item;
        const breakdownEntries = Array.isArray(breakdown) ? breakdown : [];

        const metrics = [
          Number.isFinite(Number(event.distanceKm))
            ? `${Number(event.distanceKm).toFixed(1)} km`
            : null,
          Number.isFinite(Number(event.durationHrs))
            ? `${Number(event.durationHrs).toFixed(1)} hrs`
            : null,
          Number.isFinite(Number(event.elevationM))
            ? `${Number(event.elevationM).toFixed(0)} m elevation`
            : null,
          Number.isFinite(Number(event.steps)) ? `${event.steps} steps` : null,
        ].filter(Boolean);
        const eventTrailType =
          typeof event.trailType === "string" ? event.trailType.trim() : "";

        const directionText =
          truncate(event.directions) ?? "Directions will be shared soon.";
        const approvedRaw = Number(event.approvedAttendeeCount);
        const totalRaw = Number(event.totalBookingCount);
        const approvedCount =
          Number.isFinite(approvedRaw) && approvedRaw >= 0 ? approvedRaw : 0;
        const totalCountCandidate =
          Number.isFinite(totalRaw) && totalRaw >= 0 ? totalRaw : approvedCount;
        const totalCount = Math.max(totalCountCandidate, approvedCount);

        const flags = computeClosingFlags(event);
        const closingSoon =
          (event.isClosingSoon ?? flags.closingSoon) && !flags.registrationClosed;
        const startLabel = formatEventDateTime(flags.startsAt);
        const closeRelative = flags.closesAt ? formatRelativeToNow(flags.closesAt) : null;
        const closeAbsolute = flags.closesAt ? formatEventDateTime(flags.closesAt) : null;
        const closingLine = closeRelative
          ? `Registration closes ${closeRelative}`
          : closeAbsolute
          ? `Registration closes on ${closeAbsolute}`
          : null;

        const capacityLimit =
          Number.isFinite(Number(event.maxParticipants)) && Number(event.maxParticipants) > 0
            ? Number(event.maxParticipants)
            : null;
        const attendeeTarget = capacityLimit ?? Math.max(totalCount, approvedCount, 1);
        const attendeeProgress =
          attendeeTarget > 0 ? Math.max(0, Math.min(approvedCount / attendeeTarget, 1)) : 0;
        const attendeeProgressWidth =
          attendeeProgress <= 0
            ? "0%"
            : `${Math.min(100, Math.max(attendeeProgress * 100, 8)).toFixed(0)}%`;
        let attendeeCaption;
        if (capacityLimit) {
          const spotsLeft = Math.max(0, capacityLimit - approvedCount);
          attendeeCaption =
            spotsLeft > 0
              ? `${spotsLeft} spot${spotsLeft === 1 ? "" : "s"} left`
              : "All slots filled";
          if (totalCount > capacityLimit) {
            attendeeCaption = `${attendeeCaption} • ${totalCount} total request${
              totalCount === 1 ? "" : "s"
            }`;
          }
        } else {
          attendeeCaption =
            totalCount === 0
              ? "No bookings yet"
              : `${approvedCount} approved of ${totalCount} booking${
                  totalCount === 1 ? "" : "s"
                }`;
        }
        const attendeeValueLabel = capacityLimit
          ? `${approvedCount}/${capacityLimit}`
          : totalCount > 0
          ? `${approvedCount}/${totalCount}`
          : `${approvedCount} approved`;

        const minParticipantsCount =
          Number.isFinite(Number(event.minParticipants)) && Number(event.minParticipants) > 0
            ? Number(event.minParticipants)
            : 0;
        const minShortfall = Math.max(0, minParticipantsCount - approvedCount);
        const isFull =
          event.isFull ??
          (capacityLimit !== null ? approvedCount >= capacityLimit : false);

        let matchChipConfig = null;
        if (typeof score === "number") {
          const percent = Math.round(score * 100);
          if (score >= STRONG_MATCH_THRESHOLD) {
            matchChipConfig = {
              container: styles.matchChipPositive,
              text: styles.matchChipPositiveText,
              label: `Strong match • ${percent}%`,
            };
          } else if (score >= MODERATE_MATCH_THRESHOLD) {
            matchChipConfig = {
              container: styles.matchChipNeutral,
              text: styles.matchChipNeutralText,
              label: `Close match • ${percent}%`,
            };
          } else {
            matchChipConfig = {
              container: styles.matchChipNegative,
              text: styles.matchChipNegativeText,
              label: `Low match • ${percent}%`,
            };
          }
        }

        const priceNumber = Number(event.price);

        return (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.85}
            onPress={() => navigation.navigate("EventDetails", { event })}
          >
            <Image
              source={{ uri: event.imageUrl || EVENT_IMAGE_PLACEHOLDER }}
              style={styles.banner}
            />
            <View style={styles.cardBody}>
              <View style={styles.cardHeader}>
                <Text style={styles.title}>{event.title}</Text>
                {Number.isFinite(priceNumber) && (
                  <Text style={styles.priceTag}>
                    {`PHP ${priceNumber.toLocaleString()}`}
                  </Text>
                )}
              </View>
              {matchChipConfig && (
                <View style={[styles.matchChip, matchChipConfig.container]}>
                  <Text style={matchChipConfig.text}>{matchChipConfig.label}</Text>
                </View>
              )}
              {breakdownEntries.length > 0 && (
                <View style={styles.matchBreakdownContainer}>
                  {breakdownEntries.map((entry, index) => (
                    <View
                      key={entry.key}
                      style={[
                        styles.matchBreakdownItem,
                        index === breakdownEntries.length - 1 && styles.matchBreakdownItemLast,
                      ]}
                    >
                      <View style={styles.matchBreakdownRow}>
                        <Text style={styles.matchBreakdownLabel}>{entry.label}</Text>
                        <Text style={styles.matchBreakdownPercent}>{`${entry.percent}%`}</Text>
                      </View>
                      <Text style={styles.matchBreakdownDetail}>{entry.detail}</Text>
                    </View>
                  ))}
                </View>
              )}
              <Text style={styles.location}>{getLocationLabel(event)}</Text>
              {eventTrailType ? (
                <View style={styles.trailTypeChip}>
                  <Text style={styles.trailTypeChipLabel}>Trail style</Text>
                  <Text style={styles.trailTypeChipValue}>{eventTrailType}</Text>
                </View>
              ) : null}
              <View style={styles.scheduleBlock}>
                <Text style={styles.scheduleLabel}>Starts</Text>
                <Text style={styles.schedulePrimary}>
                  {startLabel ?? "Schedule coming soon"}
                </Text>
                {closingLine ? (
                  <Text style={styles.scheduleSecondary}>{closingLine}</Text>
                ) : null}
                <View style={styles.badgeRow}>
                  {closingSoon ? (
                    <View style={styles.badgeClosingSoon}>
                      <Text style={styles.badgeClosingSoonText}>Closing soon</Text>
                    </View>
                  ) : null}
                  {isFull ? (
                    <View style={styles.badgeFull}>
                      <Text style={styles.badgeFullText}>Fully booked</Text>
                    </View>
                  ) : null}
                </View>
              </View>
              {minParticipantsCount > 0 && minShortfall > 0 && (
                <Text style={styles.minimumNotice}>
                  Needs {minShortfall} more approved hiker{minShortfall === 1 ? "" : "s"} to reach
                  the minimum of {minParticipantsCount}.
                </Text>
              )}
              {metrics.length > 0 && (
                <View style={styles.metricRow}>
                  {metrics.map((metric) => (
                    <View key={metric} style={styles.metricChip}>
                      <Text style={styles.metricText}>{metric}</Text>
                    </View>
                  ))}
                </View>
              )}
              <View style={styles.attendeeBarContainer}>
                <View style={styles.attendeeBarHeader}>
                  <Text style={styles.attendeeBarLabel}>Attendees</Text>
                  <Text style={styles.attendeeBarValue}>{attendeeValueLabel}</Text>
                </View>
                <View style={styles.attendeeBarTrack}>
                  <View
                    style={[
                      styles.attendeeBarFill,
                      isFull && styles.attendeeBarFillFull,
                      { width: attendeeProgressWidth },
                    ]}
                  />
                </View>
                <Text style={styles.attendeeBarCaption}>{attendeeCaption}</Text>
              </View>
              <View style={styles.sectionSpacing}>
                <Text style={styles.sectionLabel}>Directions</Text>
                <Text style={styles.sectionText}>{directionText}</Text>
              </View>
              <Text style={styles.organizer}>
                Hosted by {event.organizer?.name || "Unknown organizer"}
              </Text>
            </View>
          </TouchableOpacity>
        );
      }}
    />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F8FAFC" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  empty: { fontSize: 16, color: "#666" },
  listContent: {
    paddingVertical: 18,
  },
  preferenceBannerWrapper: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  preferenceBanner: {
    backgroundColor: "#ECF6ED",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#C8E6C9",
  },
  preferenceBannerTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1A3620",
    marginBottom: 4,
  },
  preferenceBannerText: {
    fontSize: 13,
    color: "#3F6246",
    lineHeight: 18,
  },
  card: {
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginBottom: 18,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E6EAD4",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  banner: {
    width: "100%",
    height: 170,
    backgroundColor: "#F1F5F9",
  },
  cardBody: {
    padding: 16,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    color: "#1A3620",
    marginRight: 12,
  },
  priceTag: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2E7D32",
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  location: {
    fontSize: 14,
    color: "#4B5563",
    marginBottom: 10,
  },
  trailTypeChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 12,
  },
  trailTypeChipLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
    textTransform: "uppercase",
    marginRight: 6,
  },
  trailTypeChipValue: {
    fontSize: 13,
    fontWeight: "600",
    color: "#111827",
  },
  scheduleBlock: {
    marginBottom: 12,
  },
  scheduleLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748B",
    textTransform: "uppercase",
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  schedulePrimary: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1F2937",
  },
  scheduleSecondary: {
    fontSize: 13,
    color: "#475569",
    marginTop: 4,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 10,
  },
  badgeClosingSoon: {
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginRight: 8,
    marginBottom: 6,
  },
  badgeClosingSoonText: {
    color: "#92400E",
    fontSize: 12,
    fontWeight: "700",
  },
  badgeFull: {
    backgroundColor: "#FEE2E2",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginRight: 8,
    marginBottom: 6,
  },
  badgeFullText: {
    color: "#B91C1C",
    fontSize: 12,
    fontWeight: "700",
  },
  minimumNotice: {
    fontSize: 12,
    color: "#2563EB",
    fontWeight: "600",
    marginBottom: 12,
  },
  matchChip: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 10,
  },
  matchChipPositive: {
    backgroundColor: "#DCFCE7",
  },
  matchChipPositiveText: {
    color: "#166534",
    fontSize: 11,
    fontWeight: "700",
  },
  matchChipNeutral: {
    backgroundColor: "#FEF3C7",
  },
  matchChipNeutralText: {
    color: "#92400E",
    fontSize: 11,
    fontWeight: "700",
  },
  matchChipNegative: {
    backgroundColor: "#FEE2E2",
  },
  matchChipNegativeText: {
    color: "#B91C1C",
    fontSize: 11,
    fontWeight: "700",
  },
  matchBreakdownContainer: {
    backgroundColor: "#F0FDF4",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  matchBreakdownItem: { marginBottom: 10 },
  matchBreakdownItemLast: { marginBottom: 0 },
  matchBreakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  matchBreakdownLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#166534",
    letterSpacing: 0.5,
  },
  matchBreakdownPercent: {
    fontSize: 12,
    fontWeight: "700",
    color: "#166534",
  },
  matchBreakdownDetail: {
    fontSize: 13,
    color: "#1F2937",
    lineHeight: 18,
    marginTop: 4,
  },
  metricRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 12,
  },
  metricChip: {
    backgroundColor: "#F0FDF4",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    marginBottom: 8,
  },
  metricText: {
    color: "#166534",
    fontSize: 12,
    fontWeight: "600",
  },
  attendeeBarContainer: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#F8FAFC",
    marginBottom: 12,
  },
  attendeeBarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 6,
  },
  attendeeBarLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1F2937",
    textTransform: "uppercase",
  },
  attendeeBarValue: { fontSize: 13, fontWeight: "700", color: "#0F172A" },
  attendeeBarTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: "#E2E8F0",
    overflow: "hidden",
    marginBottom: 6,
  },
  attendeeBarFill: {
    height: "100%",
    backgroundColor: "#2E7D32",
    borderRadius: 999,
  },
  attendeeBarFillFull: {
    backgroundColor: "#DC2626",
  },
  attendeeBarCaption: { fontSize: 12, color: "#475569" },
  sectionSpacing: {
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "600",
    marginBottom: 4,
    textTransform: "uppercase",
  },
  sectionText: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 20,
  },
  organizer: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "500",
  },
});
