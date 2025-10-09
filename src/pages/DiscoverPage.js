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
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { get } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const EVENT_IMAGE_PLACEHOLDER = "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee";
const STRONG_MATCH_THRESHOLD = 0.65;
const MODERATE_MATCH_THRESHOLD = 0.35;

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

const LEVEL_SCORE_MAP = {
  beginner: 0.2,
  intermediate: 0.6,
  expert: 1,
};

const MAX_DURATION_HOURS = 12;
const MAX_PRICE_PHP = 12000;

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

function deriveEventDifficultyScore(event) {
  const directLabel =
    event?.difficulty ||
    event?.difficultyLevel ||
    event?.trailDifficulty;

  const normalized = normalizeDifficultyValue(directLabel) ?? inferDifficultyFromMetrics(event);
  return levelToScore(normalized);
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
    return { min: 0, max: amount, midpoint: amount };
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

function normalizePrice(amount) {
  if (!Number.isFinite(amount) || amount <= 0) {
    return 0;
  }
  return clamp(amount / MAX_PRICE_PHP);
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
    user.preferredTrailType ? 1 : 0,
  ];
}

function computeEventVector(event, user) {
  const durationScore = normalizeDuration(Number(event?.durationHrs));
  const priceScore = normalizePrice(Number(event?.price));
  const difficultyScore = deriveEventDifficultyScore(event);
  const trailPreference = user?.preferredTrailType;
  const descriptor = trailPreference ? extractTrailDescriptor(event) : null;
  const trailScore = trailPreference && descriptor && textContains(descriptor, trailPreference) ? 1 : 0;

  return [
    difficultyScore,
    difficultyScore,
    durationScore,
    priceScore,
    trailScore,
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

export default function DiscoverPage() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const navigation = useNavigation();
  const { user } = useAuth();

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
        return { event, score, index };
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
      ? "Events are ranked by cosine similarity between your hiking profile and each event."
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
        setEvents(Array.isArray(data) ? data : []);
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
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2E7D32" />
      </View>
    );
  }

  if (!events.length) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>No events yet. Check back later!</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={scoredEvents}
      keyExtractor={(item, index) => item.event?.id?.toString() ?? `event-${index}`}
      contentContainerStyle={styles.listContent}
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
        const { event, score } = item;

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

        const directionText =
          truncate(event.directions) ?? "Directions will be shared soon.";
        const approvedRaw = Number(event.approvedAttendeeCount);
        const totalRaw = Number(event.totalBookingCount);
        const approvedCount =
          Number.isFinite(approvedRaw) && approvedRaw >= 0 ? approvedRaw : 0;
        const totalCountCandidate =
          Number.isFinite(totalRaw) && totalRaw >= 0 ? totalRaw : approvedCount;
        const totalCount = Math.max(totalCountCandidate, approvedCount);
        const attendeeProgress =
          totalCount > 0 ? Math.max(0, Math.min(approvedCount / totalCount, 1)) : 0;
        const attendeeProgressWidth =
          attendeeProgress === 0
            ? "0%"
            : `${Math.min(100, Math.max(attendeeProgress * 100, 8)).toFixed(0)}%`;
        const attendeeCaption =
          totalCount === 0
            ? "No bookings yet"
            : `${approvedCount} approved of ${totalCount} booking${
                totalCount === 1 ? "" : "s"
              }`;

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
              <Text style={styles.location}>{getLocationLabel(event)}</Text>
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
                  <Text style={styles.attendeeBarValue}>
                    {approvedCount}/{totalCount}
                  </Text>
                </View>
                <View style={styles.attendeeBarTrack}>
                  <View style={[styles.attendeeBarFill, { width: attendeeProgressWidth }]} />
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
  );
}

const styles = StyleSheet.create({
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
