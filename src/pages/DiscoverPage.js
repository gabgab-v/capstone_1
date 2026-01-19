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
import { useTheme } from "../context/ThemeContext";

const EVENT_IMAGE_PLACEHOLDER = "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee";
const STRONG_MATCH_THRESHOLD = 0.75;
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
const MAX_MOUNTAIN_MATCH_WEIGHT = 1;

function clamp(value, min = 0, max = 1) {
  if (!Number.isFinite(value)) {
    return min;
  }
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

function buildMountainHaystack(event) {
  const parts = [
    event?.mountainTag,
    event?.title,
    event?.trail?.label,
    event?.locationName,
    event?.overview,
  ].filter((value) => typeof value === "string" && value.trim().length > 0);
  if (!parts.length) {
    return null;
  }
  return parts.join(" | ").toLowerCase();
}

function computeMountainMatchScore(event, mountains, enabled) {
  if (!enabled || !Array.isArray(mountains) || mountains.length === 0) {
    return { score: 0, match: null };
  }

  const haystack = buildMountainHaystack(event);
  if (!haystack) {
    return { score: 0, match: null };
  }

  let bestScore = 0;
  let bestMatch = null;
  mountains.forEach((mountain) => {
    const normalized = typeof mountain === "string" ? mountain.trim().toLowerCase() : "";
    if (!normalized) {
      return;
    }
    if (haystack.includes(normalized)) {
      if (bestScore < 1) {
        bestScore = 1;
        bestMatch = mountain;
      }
      return;
    }
    const tokens = normalized.split(/\s+/).filter((token) => token.length >= 3);
    const partialHit = tokens.some((token) => haystack.includes(token));
    if (partialHit && bestScore < 0.6) {
      bestScore = 0.6;
      bestMatch = mountain;
    }
  });

  return { score: clamp(bestScore, 0, 1), match: bestMatch };
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
  const hasMountains =
    user?.mountainSuggestionsEnabled !== false &&
    Array.isArray(user?.preferredMountains) &&
    user.preferredMountains.length > 0;
  const mountainWeight = hasMountains ? MAX_MOUNTAIN_MATCH_WEIGHT : 0;

  return [
    levelToScore(user.experienceLevel),
    levelToScore(user.preferredDifficulty),
    durationScore,
    budgetScore,
    user?.preferredTrailType ? 1 : 0,
    distanceScore,
    elevationScore,
    mountainWeight,
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
  const mountainsEnabled =
    user?.mountainSuggestionsEnabled !== false &&
    Array.isArray(user?.preferredMountains) &&
    user.preferredMountains.length > 0;
  const { score: mountainScore, match: mountainMatch } = computeMountainMatchScore(
    event,
    user?.preferredMountains,
    mountainsEnabled
  );

  return {
    vector: [
      difficultyScore,
      difficultyScore,
      durationScore,
      priceScore,
      trailScore,
      distanceScore,
      elevationScore,
      mountainsEnabled ? mountainScore : 0,
    ],
    mountainMatch,
    mountainsEnabled,
  };
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

function buildMatchBreakdown({ user, event, preferenceVector, eventVector, mountainMatch, mountainsEnabled }) {
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
  const preferredMountains = Array.isArray(user?.preferredMountains) ? user.preferredMountains : [];
  const mountainsEnabledFlag =
    user?.mountainSuggestionsEnabled !== false && preferredMountains.length > 0;

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
    preferredMountains,
    mountainsEnabled: mountainsEnabledFlag,
    mountainMatch,
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
    {
      key: "mountain",
      label: "Familiar mountains",
      indices: [7],
      detail: ({ preferredMountains: mountains, mountainsEnabled: enabled, mountainMatch: match }) => {
        if (!enabled || !mountains?.length) {
          return null;
        }
        if (match) {
          return `Surfaced because it mentions ${match}, one of your saved mountains/trails.`;
        }
        return "Does not mention your saved mountains/trails yet.";
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
      const detail = group.detail(context);
      if (!detail) {
        return null;
      }

      const includeDespiteShare = group.key === "mountain" && detail;
      if (!includeDespiteShare && (contribution <= 0 || contribution < MIN_BREAKDOWN_SHARE)) {
        return null;
      }

      const effectiveContribution =
        contribution > 0 && contribution >= MIN_BREAKDOWN_SHARE
          ? contribution
          : MIN_BREAKDOWN_SHARE;

      return {
        key: group.key,
        label: group.label,
        detail,
        contribution: effectiveContribution,
        percent: Math.max(1, Math.round(effectiveContribution * 100)),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.contribution - a.contribution);
}

export default function DiscoverPage() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const navigation = useNavigation();
  const { user } = useAuth();
  const [showWeakMatches, setShowWeakMatches] = useState(() => !Boolean(user?.preferencesComplete));
  const { isDarkMode, colors } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDarkMode), [colors, isDarkMode]);
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
    const vector = computeUserVector(user);
    return vector && magnitude(vector) > 0 ? vector : null;
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
        const { vector: eventVector, mountainMatch, mountainsEnabled } = computeEventVector(
          event,
          user
        );
        const score = cosineSimilarity(preferenceVector, eventVector);
        const breakdown = buildMatchBreakdown({
          user,
          event,
          preferenceVector,
          eventVector,
          mountainMatch,
          mountainsEnabled,
        });
        return { event, score, index, breakdown, mountainMatch, mountainsEnabled };
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

  const filteredEvents = useMemo(() => {
    if (!preferenceVector || showWeakMatches) {
      return scoredEvents;
    }
    return scoredEvents.filter(
      ({ score }) => typeof score === "number" && score >= STRONG_MATCH_THRESHOLD
    );
  }, [preferenceVector, scoredEvents, showWeakMatches]);

  const { strongMatchCount, weakMatchCount } = useMemo(() => {
    if (!preferenceVector) {
      return { strongMatchCount: 0, weakMatchCount: 0 };
    }
    return scoredEvents.reduce(
      (acc, { score }) => {
        if (typeof score === "number" && score >= STRONG_MATCH_THRESHOLD) {
          acc.strongMatchCount += 1;
        } else {
          acc.weakMatchCount += 1;
        }
        return acc;
      },
      { strongMatchCount: 0, weakMatchCount: 0 }
    );
  }, [preferenceVector, scoredEvents]);

  const topSimilarity = useMemo(() => {
    if (!preferenceVector) {
      return 0;
    }
    return scoredEvents.reduce(
      (max, { score }) => (typeof score === "number" ? Math.max(max, score) : max),
      0
    );
  }, [scoredEvents, preferenceVector]);

  const preferenceHeader = useMemo(() => {
    if (!preferenceVector) {
      return null;
    }

    const topPercent = Math.round(topSimilarity * 100);
    const title =
      strongMatchCount > 0
        ? `Strong matches (${strongMatchCount})`
        : "No strong matches yet";
    const description =
      strongMatchCount > 0
        ? "Events are ranked by your hiking profile. Strong matches are highlighted."
        : weakMatchCount > 0
        ? "No hikes clear the 75% match bar yet. You can still browse weaker matches."
        : "We ranked all hikes, but none strongly align with your saved preferences yet.";
    const showToggle = strongMatchCount + weakMatchCount > 0;
    const statusLabel = showWeakMatches
      ? "Showing all matches"
      : strongMatchCount > 0
      ? "Showing strong matches only"
      : "Strong matches only (none yet)";
    const actionLabel = showWeakMatches ? "Hide weak matches" : "Show weak matches";
    const disableToggle = weakMatchCount === 0 && !showWeakMatches;

    return (
      <View style={styles.preferenceBanner}>
        <View style={styles.preferenceBannerHeader}>
          <Text style={styles.preferenceBannerTitle}>{title}</Text>
          <Text style={styles.preferenceBannerPercent}>{`Top score ${topPercent}%`}</Text>
        </View>
        <Text style={styles.preferenceBannerText}>{description}</Text>
        {showToggle ? (
          <View style={styles.matchFilterRow}>
            <Text style={styles.matchFilterLabel}>{statusLabel}</Text>
            <TouchableOpacity
              style={[
                styles.matchFilterButton,
                disableToggle && styles.matchFilterButtonDisabled,
              ]}
              disabled={disableToggle}
              onPress={() => setShowWeakMatches((value) => !value)}
            >
              <Text style={styles.matchFilterButtonText}>{actionLabel}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    );
  }, [
    preferenceVector,
    showWeakMatches,
    strongMatchCount,
    weakMatchCount,
    topSimilarity,
  ]);

  const preferenceHeaderStyle = preferenceHeader ? styles.preferenceBannerWrapper : null;

  const fetchEvents = useCallback(
    async ({ showSpinner = false, useRefreshControl = false } = {}) => {
      if (showSpinner) {
        setLoading(true);
      }
      if (useRefreshControl) {
        setRefreshing(true);
      }
      setError(null);

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
        setError(null);
      } catch (err) {
        console.error("Failed to fetch events:", err);
        setError(err?.body?.error || err?.message || "Failed to load events. Please try again.");
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

  const handleRetryFetch = useCallback(() => {
    fetchEvents({ showSpinner: events.length === 0 });
  }, [events.length, fetchEvents]);

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

  if (error && !events.length) {
    return (
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <View style={styles.errorState}>
          <Text style={styles.errorStateTitle}>We couldn't load events</Text>
          <Text style={styles.errorStateMessage}>{error}</Text>
          <TouchableOpacity style={styles.errorStateButton} onPress={handleRetryFetch}>
            <Text style={styles.errorStateButtonText}>Try again</Text>
          </TouchableOpacity>
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
      {error ? (
        <View style={styles.errorBanner}>
          <View style={styles.errorBannerTextGroup}>
            <Text style={styles.errorBannerTitle}>Last refresh failed</Text>
            <Text style={styles.errorBannerText}>{error}</Text>
          </View>
          <TouchableOpacity style={styles.errorBannerButton} onPress={handleRetryFetch}>
            <Text style={styles.errorBannerButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <FlatList
        data={filteredEvents}
        keyExtractor={(item, index) => item.event?.id?.toString() ?? `event-${index}`}
        contentContainerStyle={[styles.listContent, listContentInsets]}
        scrollIndicatorInsets={scrollIndicatorInsets}
        ListHeaderComponent={preferenceHeader}
        ListHeaderComponentStyle={preferenceHeaderStyle}
        ListEmptyComponent={
          preferenceVector && !showWeakMatches ? (
            <View style={styles.emptyStrongMatchContainer}>
              <Text style={styles.emptyStrongMatchTitle}>No strong matches yet</Text>
              <Text style={styles.emptyStrongMatchText}>
                We did not find hikes above the 75% match threshold. You can still browse weaker
                matches for more options.
              </Text>
              {weakMatchCount > 0 ? (
                <TouchableOpacity
                  style={styles.emptyStrongMatchButton}
                  onPress={() => setShowWeakMatches(true)}
                >
                  <Text style={styles.emptyStrongMatchButtonText}>Show weak matches</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null
        }
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
        const isStrongMatch = typeof score === "number" && score >= STRONG_MATCH_THRESHOLD;

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
          matchChipConfig = isStrongMatch
            ? {
                container: styles.matchChipPositive,
                text: styles.matchChipPositiveText,
                label: `Strong match • ${percent}%`,
              }
            : {
                container: styles.matchChipWeak,
                text: styles.matchChipWeakText,
                label: `Weak match • ${percent}%`,
              };
        }

        const priceNumber = Number(event.price);

        return (
          <TouchableOpacity
            style={[styles.card, isStrongMatch && styles.cardStrong]}
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
              <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: matchChipConfig ? 8 : 0 }}>
                {matchChipConfig ? (
                  <View style={[styles.matchChip, matchChipConfig.container]}>
                    <Text style={matchChipConfig.text}>{matchChipConfig.label}</Text>
                  </View>
                ) : null}
                {event.mountainTag ? (
                  <View style={styles.mountainTagChip}>
                    <Text style={styles.mountainTagText}>{event.mountainTag}</Text>
                  </View>
                ) : null}
              </View>
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

function createStyles(theme, isDarkMode) {
  const preferenceBannerBg = theme.accentSurface;
  const preferenceBannerBorder = isDarkMode ? theme.accent : "#C8E6C9";
  const cardShadowOpacity = isDarkMode ? 0.35 : 0.08;
  const cardShadowRadius = isDarkMode ? 12 : 8;
  const matchBreakdownBg = isDarkMode ? "rgba(22, 101, 52, 0.18)" : "#F0FDF4";
  const metricChipBg = isDarkMode ? "rgba(46, 125, 50, 0.15)" : "#F0FDF4";
  const neutralChipBg = isDarkMode ? "rgba(217, 119, 6, 0.18)" : "#FEF3C7";
  const attendeeFillFull = isDarkMode ? theme.dangerText : "#DC2626";

  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: theme.background },
    center: { flex: 1, justifyContent: "center", alignItems: "center" },
    empty: { fontSize: 16, color: theme.textMuted },
    errorState: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 32,
    },
    errorStateTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: theme.textPrimary,
      marginBottom: 8,
      textAlign: "center",
    },
    errorStateMessage: {
      fontSize: 14,
      color: theme.textSecondary,
      textAlign: "center",
      marginBottom: 16,
      lineHeight: 20,
    },
    errorStateButton: {
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 999,
      backgroundColor: theme.accent,
    },
    errorStateButtonText: {
      color: theme.surface,
      fontWeight: "700",
    },
    errorBanner: {
      marginHorizontal: 16,
      marginTop: 16,
      marginBottom: 4,
      padding: 12,
      borderRadius: 12,
      backgroundColor: theme.dangerSurface,
      borderWidth: 1,
      borderColor: theme.dangerText,
      flexDirection: "row",
      alignItems: "center",
    },
    errorBannerTextGroup: { flex: 1, marginRight: 12 },
    errorBannerTitle: {
      fontSize: 13,
      fontWeight: "700",
      color: theme.dangerText,
      marginBottom: 2,
    },
    errorBannerText: {
      fontSize: 12,
      color: theme.textSecondary,
      lineHeight: 16,
    },
    errorBannerButton: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: theme.dangerText,
    },
    errorBannerButtonText: {
      color: theme.surfaceInverse,
      fontWeight: "700",
      fontSize: 12,
    },
    emptyStrongMatchContainer: {
      marginHorizontal: 32,
      marginVertical: 48,
      padding: 16,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surfaceMuted,
    },
    emptyStrongMatchTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: theme.textPrimary,
      marginBottom: 8,
    },
    emptyStrongMatchText: {
      fontSize: 13,
      color: theme.textSecondary,
      lineHeight: 18,
      marginBottom: 12,
    },
    emptyStrongMatchButton: {
      alignSelf: "flex-start",
      backgroundColor: theme.accent,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    emptyStrongMatchButtonText: {
      color: theme.surface,
      fontSize: 13,
      fontWeight: "700",
    },
    listContent: {
      paddingVertical: 18,
    },
    preferenceBannerWrapper: {
      paddingHorizontal: 16,
      paddingBottom: 12,
    },
    preferenceBanner: {
      backgroundColor: preferenceBannerBg,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: preferenceBannerBorder,
    },
    preferenceBannerHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 4,
    },
    preferenceBannerTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: theme.accent,
    },
    preferenceBannerPercent: {
      fontSize: 12,
      fontWeight: "600",
      color: theme.accent,
    },
    preferenceBannerText: {
      fontSize: 13,
      color: theme.textSecondary,
      lineHeight: 18,
    },
    matchFilterRow: {
      marginTop: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    matchFilterLabel: {
      fontSize: 12,
      color: theme.textSecondary,
      flex: 1,
      marginRight: 12,
    },
    matchFilterButton: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.accent,
      backgroundColor: theme.surface,
    },
    matchFilterButtonDisabled: {
      opacity: 0.5,
    },
    matchFilterButtonText: {
      fontSize: 12,
      fontWeight: "700",
      color: theme.accent,
    },
    card: {
      backgroundColor: theme.surface,
      marginHorizontal: 16,
      marginBottom: 18,
      borderRadius: 16,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: theme.border,
      shadowColor: "#000",
      shadowOpacity: cardShadowOpacity,
      shadowRadius: cardShadowRadius,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
    cardStrong: {
      borderColor: theme.accent,
      borderWidth: 2,
      shadowColor: theme.accent,
    },
    banner: {
      width: "100%",
      height: 170,
      backgroundColor: theme.surfaceMuted,
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
      color: theme.textPrimary,
      marginRight: 12,
    },
    priceTag: {
      fontSize: 14,
      fontWeight: "600",
      color: theme.accent,
      backgroundColor: theme.accentSurface,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
    },
    location: {
      fontSize: 14,
      color: theme.textSecondary,
      marginBottom: 10,
    },
    trailTypeChip: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      backgroundColor: theme.surfaceMuted,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      marginBottom: 12,
    },
    trailTypeChipLabel: {
      fontSize: 12,
      fontWeight: "700",
      color: theme.textMuted,
      textTransform: "uppercase",
      marginRight: 6,
    },
    trailTypeChipValue: {
      fontSize: 13,
      fontWeight: "600",
      color: theme.textPrimary,
    },
    scheduleBlock: {
      marginBottom: 12,
    },
    scheduleLabel: {
      fontSize: 12,
      fontWeight: "700",
      color: theme.textMuted,
      textTransform: "uppercase",
      marginBottom: 4,
      letterSpacing: 0.5,
    },
    schedulePrimary: {
      fontSize: 15,
      fontWeight: "700",
      color: theme.textPrimary,
    },
    scheduleSecondary: {
      fontSize: 13,
      color: theme.textSecondary,
      marginTop: 4,
    },
    badgeRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      marginTop: 10,
    },
    badgeClosingSoon: {
      backgroundColor: theme.warningSurface,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      marginRight: 8,
      marginBottom: 6,
    },
    badgeClosingSoonText: {
      color: theme.warningText,
      fontSize: 12,
      fontWeight: "700",
    },
    badgeFull: {
      backgroundColor: theme.dangerSurface,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      marginRight: 8,
      marginBottom: 6,
    },
    badgeFullText: {
      color: theme.dangerText,
      fontSize: 12,
      fontWeight: "700",
    },
    minimumNotice: {
      fontSize: 12,
      color: theme.infoText,
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
      backgroundColor: theme.positiveSurface,
    },
    matchChipPositiveText: {
      color: theme.positiveText,
      fontSize: 11,
      fontWeight: "700",
    },
    matchChipWeak: {
      backgroundColor: neutralChipBg,
    },
    matchChipWeakText: {
      color: theme.warningText,
      fontSize: 11,
      fontWeight: "700",
    },
    mountainTagChip: {
      alignSelf: "flex-start",
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
      backgroundColor: theme.surfaceMuted,
      marginLeft: 8,
      marginBottom: 10,
    },
    mountainTagText: {
      color: theme.textPrimary,
      fontSize: 11,
      fontWeight: "700",
    },
    matchBreakdownContainer: {
      backgroundColor: matchBreakdownBg,
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
      color: theme.accent,
      letterSpacing: 0.5,
    },
    matchBreakdownPercent: {
      fontSize: 12,
      fontWeight: "700",
      color: theme.accent,
    },
    matchBreakdownDetail: {
      fontSize: 13,
      color: theme.textSecondary,
      lineHeight: 18,
      marginTop: 4,
    },
    metricRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      marginBottom: 12,
    },
    metricChip: {
      backgroundColor: metricChipBg,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 6,
      marginRight: 8,
      marginBottom: 8,
    },
    metricText: {
      color: theme.accent,
      fontSize: 12,
      fontWeight: "600",
    },
    attendeeBarContainer: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      padding: 12,
      backgroundColor: theme.surfaceMuted,
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
      color: theme.textMuted,
      textTransform: "uppercase",
    },
    attendeeBarValue: { fontSize: 13, fontWeight: "700", color: theme.textPrimary },
    attendeeBarTrack: {
      height: 8,
      borderRadius: 999,
      backgroundColor: theme.border,
      overflow: "hidden",
      marginBottom: 6,
    },
    attendeeBarFill: {
      height: "100%",
      backgroundColor: theme.accent,
      borderRadius: 999,
    },
    attendeeBarFillFull: {
      backgroundColor: attendeeFillFull,
    },
    attendeeBarCaption: { fontSize: 12, color: theme.textSecondary },
    sectionSpacing: {
      marginBottom: 12,
    },
    sectionLabel: {
      fontSize: 13,
      color: theme.textMuted,
      fontWeight: "600",
      marginBottom: 4,
      textTransform: "uppercase",
    },
    sectionText: {
      fontSize: 14,
      color: theme.textSecondary,
      lineHeight: 20,
    },
    organizer: {
      fontSize: 12,
      color: theme.textMuted,
      fontWeight: "500",
    },
  });
}
