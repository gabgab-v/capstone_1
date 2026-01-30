const LEVEL_SCORE_MAP = {
  beginner: 0.2,
  intermediate: 0.6,
  technical: 1,
  expert: 1,
};

const DIFFICULTY_ORDER = ['Beginner', 'Intermediate', 'Technical', 'Expert'];

const MAX_DURATION_HOURS = 12;
const MAX_PRICE_PHP = 12000;
const MAX_DISTANCE_KM = 40;
const MAX_ELEVATION_M = 2000;
const MIN_BREAKDOWN_SHARE = 0.01;

function clamp(value, min = 0, max = 1) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function averageMatchPercent(values) {
  if (!Array.isArray(values)) {
    return 0;
  }
  const valid = values.filter((value) => Number.isFinite(value));
  if (!valid.length) {
    return 0;
  }
  const total = valid.reduce((sum, value) => sum + clamp(value, 0, 1), 0);
  return clamp(total / valid.length, 0, 1);
}

function computeNumericMatchPercent(preferred, actual) {
  if (!Number.isFinite(preferred) || preferred <= 0) {
    return null;
  }
  if (!Number.isFinite(actual) || actual <= 0) {
    return 0;
  }
  const diff = Math.abs(actual - preferred);
  const scale = Math.max(preferred, actual);
  if (scale <= 0) {
    return 0;
  }
  return clamp(1 - diff / scale, 0, 1);
}

function deriveUserAgeYears(user) {
  const birthdateValue = user?.birthdate ?? user?.birthDate ?? null;
  if (!birthdateValue) {
    return null;
  }
  const birthdate = new Date(birthdateValue);
  if (Number.isNaN(birthdate.valueOf())) {
    return null;
  }
  const now = new Date();
  let age = now.getFullYear() - birthdate.getFullYear();
  const monthDiff = now.getMonth() - birthdate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthdate.getDate())) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

function normalizeDifficultyValue(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized.includes('beginner') || normalized.includes('easy')) {
    return 'Beginner';
  }
  if (
    normalized.includes('intermediate') ||
    normalized.includes('moderate') ||
    normalized.includes('medium')
  ) {
    return 'Intermediate';
  }
  if (normalized.includes('technical')) {
    return 'Technical';
  }
  if (
    normalized.includes('expert') ||
    normalized.includes('advanced') ||
    normalized.includes('hard') ||
    normalized.includes('difficult')
  ) {
    return 'Expert';
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

function getDifficultyIndex(label) {
  const normalized = normalizeDifficultyValue(label);
  if (!normalized) {
    return -1;
  }
  return DIFFICULTY_ORDER.findIndex((item) => item.toLowerCase() === normalized.toLowerCase());
}

function computeDifficultyMatchPercent(preferredLabel, eventLabel) {
  const preferredIndex = getDifficultyIndex(preferredLabel);
  if (preferredIndex < 0) {
    return null;
  }
  const eventIndex = getDifficultyIndex(eventLabel);
  if (eventIndex < 0) {
    return 0;
  }
  const maxGap = Math.max(DIFFICULTY_ORDER.length - 1, 1);
  const gap = Math.abs(preferredIndex - eventIndex);
  return clamp(1 - gap / maxGap, 0, 1);
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
    return 'Expert';
  }
  if (score >= 2) {
    return 'Intermediate';
  }
  return 'Beginner';
}

function getEventDifficultyLabel(event) {
  const directLabel = event?.difficulty || event?.difficultyLevel || event?.trailDifficulty;
  return normalizeDifficultyValue(directLabel) ?? inferDifficultyFromMetrics(event);
}

function deriveEventDifficultyScore(event) {
  return levelToScore(getEventDifficultyLabel(event));
}

function parseBudgetRange(value) {
  if (typeof value !== 'string') {
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

function computeBudgetMatchPercent(range, price) {
  const hasPreference =
    Number.isFinite(range?.min) || Number.isFinite(range?.max) || Number.isFinite(range?.midpoint);
  if (!hasPreference) {
    return null;
  }
  if (!Number.isFinite(price) || price <= 0) {
    return 0;
  }

  const min = Number.isFinite(range?.min) ? range.min : null;
  const max = Number.isFinite(range?.max) ? range.max : null;
  const midpoint = Number.isFinite(range?.midpoint) ? range.midpoint : null;
  const cap =
    max !== null
      ? max
      : min !== null
      ? min
      : midpoint !== null
      ? midpoint
      : null;

  if (!Number.isFinite(cap) || cap <= 0) {
    return 0;
  }
  if (price <= cap) {
    return 1;
  }
  return clamp(cap / price, 0, 1);
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

function textContains(haystack, needle) {
  if (typeof haystack !== 'string' || typeof needle !== 'string') {
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
  ].filter((value) => typeof value === 'string' && value.trim().length > 0);

  if (!parts.length) {
    return null;
  }

  return parts.join(' | ');
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
    typeof budgetRange.midpoint === 'number'
      ? budgetRange.midpoint
      : typeof budgetRange.max === 'number'
      ? budgetRange.max
      : typeof budgetRange.min === 'number'
      ? budgetRange.min
      : 0,
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
    typeof user?.preferredTrailType === 'string' ? user.preferredTrailType.trim() : '';
  const descriptor = trailPreferenceRaw ? extractTrailDescriptor(event) : null;
  const eventTrailType = typeof event?.trailType === 'string' ? event.trailType.trim() : '';
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

function collectPreferenceMatchPercents(user, event) {
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
    typeof user?.preferredTrailType === 'string' ? user.preferredTrailType.trim() : '';
  const preferredTrail = preferredTrailRaw || '';
  const descriptor = preferredTrail ? extractTrailDescriptor(event) : null;
  const eventTrailType = typeof event?.trailType === 'string' ? event.trailType.trim() : '';
  const hasDirectTrailMatch =
    preferredTrail &&
    eventTrailType &&
    eventTrailType.toLowerCase() === preferredTrail.toLowerCase();
  const matchesTrail =
    Boolean(preferredTrail) &&
    (hasDirectTrailMatch || (descriptor && textContains(descriptor, preferredTrail)));

  return {
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
    percents: {
      experience: computeDifficultyMatchPercent(userExperienceLevel, eventDifficultyLabel),
      preferredDifficulty: computeDifficultyMatchPercent(userPreferredDifficulty, eventDifficultyLabel),
      duration: computeNumericMatchPercent(preferredDuration, eventDuration),
      budget: computeBudgetMatchPercent(budgetRange, priceNumber),
      trailType: preferredTrail ? (matchesTrail ? 1 : 0) : null,
      distance: computeNumericMatchPercent(preferredDistance, eventDistance),
      elevation: computeNumericMatchPercent(preferredElevation, eventElevation),
    },
  };
}

function computeMatchScore(user, event) {
  if (!user || !event) {
    return 0;
  }
  const { percents } = collectPreferenceMatchPercents(user, event);
  return averageMatchPercent(Object.values(percents));
}

function dotProduct(vectorA, vectorB) {
  if (!Array.isArray(vectorA) || !Array.isArray(vectorB)) {
    return 0;
  }
  return vectorA.reduce((sum, value, index) => sum + value * (vectorB[index] ?? 0), 0);
}

function magnitude(vector) {
  if (!Array.isArray(vector) || !vector.length) {
    return 0;
  }
  return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
}

function cosineSimilarity(vectorA, vectorB) {
  if (!Array.isArray(vectorA) || !Array.isArray(vectorB)) {
    return 0;
  }

  const magA = magnitude(vectorA);
  const magB = magnitude(vectorB);
  if (magA === 0 || magB === 0) {
    return 0;
  }

  return clamp(dotProduct(vectorA, vectorB) / (magA * magB), 0, 1);
}

function formatPhp(amount) {
  if (!Number.isFinite(amount)) {
    return null;
  }
  const normalized = Math.round(amount * 100) / 100;
  return `PHP ${normalized.toLocaleString()}`;
}

function buildMatchBreakdown({
  user,
  event,
  minShare = MIN_BREAKDOWN_SHARE,
}) {
  if (!user || !event) {
    return [];
  }

  const {
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
    percents,
  } = collectPreferenceMatchPercents(user, event);

  const difficultyParts = [percents.preferredDifficulty, percents.experience].filter((value) =>
    Number.isFinite(value),
  );
  const difficultyPercent = difficultyParts.length ? averageMatchPercent(difficultyParts) : null;

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
      key: 'difficulty',
      label: 'Difficulty alignment',
      percent: difficultyPercent,
      detail: ({
        eventDifficultyLabel: difficulty,
        userPreferredDifficulty: preferred,
        userExperienceLevel: experience,
      }) => {
        const normalizedDifficulty = difficulty ? difficulty.toLowerCase() : null;
        if (!normalizedDifficulty) {
          return 'We estimated the route difficulty from its metrics.';
        }

        const parts = [];
        if (preferred) {
          const normalizedPreferred = preferred.toLowerCase();
          if (preferred === difficulty) {
            parts.push(`Matches your preferred ${normalizedPreferred} hikes.`);
          } else {
            parts.push(
              `You prefer ${normalizedPreferred} hikes, while this one is ${normalizedDifficulty}.`,
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
                `Designed for ${normalizedDifficulty} hikers; you rate your experience as ${normalizedExperience}.`,
              );
            }
          }
        }

        if (!parts.length) {
          parts.push(`Rated ${normalizedDifficulty} difficulty.`);
        }

        return parts.join(' ');
      },
    },
    {
      key: 'duration',
      label: 'Duration fit',
      percent: percents.duration,
      detail: ({ preferredDuration: preferred, eventDuration: duration }) => {
        if (!Number.isFinite(duration)) {
          return 'Organizer has not shared the expected duration yet.';
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
      key: 'distance',
      label: 'Distance fit',
      percent: percents.distance,
      detail: ({ preferredDistance: preferred, eventDistance: distance }) => {
        if (!Number.isFinite(distance)) {
          return 'Organizer has not shared the total distance yet.';
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
      key: 'elevation',
      label: 'Elevation fit',
      percent: percents.elevation,
      detail: ({ preferredElevation: preferred, eventElevation: elevation }) => {
        if (!Number.isFinite(elevation)) {
          return 'Organizer has not shared the elevation gain yet.';
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
      key: 'budget',
      label: 'Budget fit',
      percent: percents.budget,
      detail: ({ budgetRange: range, priceNumber: price }) => {
        const priceText = formatPhp(price);
        if (!priceText) {
          return 'Pricing has not been announced yet.';
        }

        if (Number.isFinite(range.max) && price > range.max) {
          return `${priceText} is above your ${formatPhp(range.max)} budget cap.`;
        }

        const withinMin =
          typeof range.min === 'number' && Number.isFinite(range.min) ? price >= range.min : true;
        const withinMax =
          typeof range.max === 'number' && Number.isFinite(range.max) ? price <= range.max : true;

        if (withinMin && withinMax && (range.min !== undefined || range.max !== undefined)) {
          const rangeText = formatRange(range.min, range.max);
          if (rangeText) {
            return `${priceText} sits inside your ${rangeText} target range.`;
          }
        }

        if (withinMax && typeof range.max === 'number' && Number.isFinite(range.max)) {
          return `${priceText} stays below your ${formatPhp(range.max)} spending limit.`;
        }

        if (withinMin && typeof range.min === 'number' && Number.isFinite(range.min)) {
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
      key: 'trailType',
      label: 'Trail style',
      percent: percents.trailType,
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
      const detail = group.detail(context);
      if (!detail) {
        return null;
      }

      const percentValue = group.percent;
      if (!Number.isFinite(percentValue) || percentValue < minShare) {
        return null;
      }

      return {
        key: group.key,
        label: group.label,
        detail,
        contribution: percentValue,
        percent: Math.round(percentValue * 100),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.contribution - a.contribution);
}

function evaluateEventReadiness(user, event) {
  const warnings = [];
  const blockers = [];
  const eventDifficulty = getEventDifficultyLabel(event);
  const experienceLevel = normalizeDifficultyValue(user?.experienceLevel);
  const preferredDifficulty = normalizeDifficultyValue(user?.preferredDifficulty);
  const readinessLevel = experienceLevel || preferredDifficulty || null;

  const eventDifficultyIndex = getDifficultyIndex(eventDifficulty);
  const readinessDifficultyIndex = getDifficultyIndex(readinessLevel);

  if (eventDifficultyIndex >= 0 && readinessDifficultyIndex >= 0) {
    const gap = eventDifficultyIndex - readinessDifficultyIndex;
    if (gap >= 2) {
      blockers.push(
        `Organizer marked this as ${eventDifficulty}. Your profile is ${readinessLevel}, which is below the required readiness.`,
      );
    } else if (gap === 1) {
      warnings.push(
        `This hike is ${eventDifficulty.toLowerCase()}, one level above your ${readinessLevel.toLowerCase()} profile.`,
      );
    }
  } else if (eventDifficultyIndex >= 0 && readinessDifficultyIndex === -1) {
    const message =
      eventDifficultyIndex >= 2
        ? 'Set your experience level before booking technical or expert events so we can confirm readiness.'
        : 'Set your experience level so we can confirm you meet the difficulty.';
    warnings.push(message);
  }

  if (!user?.preferencesComplete) {
    warnings.push('Complete your hiking preferences so we can check if this event fits you.');
  }

  const minAge = Number(event?.minAge);
  const userAge = deriveUserAgeYears(user);
  if (Number.isFinite(minAge) && minAge > 0) {
    if (Number.isFinite(userAge)) {
      const roundedAge = Math.floor(userAge);
      if (roundedAge < minAge) {
        blockers.push(
          `Minimum age is ${minAge}. Your profile age is ${roundedAge}, which is below the requirement.`,
        );
      } else if (roundedAge - minAge <= 1) {
        warnings.push(
          `Minimum age is ${minAge}. You're ${roundedAge}, so plan accordingly and bring guardian clearance if needed.`,
        );
      }
    } else {
      warnings.push(`Minimum age is ${minAge}. Add your birthdate to confirm you're eligible.`);
    }
  }

  const preferredDuration = Number(user?.preferredDurationHrs);
  const eventDuration = Number(event?.durationHrs);
  if (Number.isFinite(eventDuration) && Number.isFinite(preferredDuration) && preferredDuration > 0) {
    const diff = eventDuration - preferredDuration;
    if (Math.abs(diff) >= 0.5) {
      const direction = diff > 0 ? 'longer' : 'shorter';
      warnings.push(
        `Runs ${eventDuration.toFixed(1)} hrs, about ${Math.abs(diff).toFixed(1)} hrs ${direction} than your ${preferredDuration.toFixed(1)}-hr preference.`,
      );
    }
  }

  const preferredDistance = Number(user?.preferredDistanceKm);
  const eventDistance = Number(event?.distanceKm);
  if (Number.isFinite(eventDistance) && Number.isFinite(preferredDistance) && preferredDistance > 0) {
    const diff = eventDistance - preferredDistance;
    if (Math.abs(diff) >= 1) {
      const direction = diff > 0 ? 'more' : 'less';
      warnings.push(
        `Distance is ${eventDistance.toFixed(1)} km, around ${Math.abs(diff).toFixed(1)} km ${direction} than your usual ${preferredDistance.toFixed(1)} km.`,
      );
    }
  }

  const preferredElevation = Number(user?.preferredElevationM);
  const eventElevation = Number(event?.elevationM);
  if (Number.isFinite(eventElevation) && Number.isFinite(preferredElevation) && preferredElevation > 0) {
    const diff = eventElevation - preferredElevation;
    if (Math.abs(diff) >= 100) {
      const direction = diff > 0 ? 'more' : 'less';
      warnings.push(
        `Elevation gain is ${Math.round(eventElevation)} m, roughly ${Math.round(Math.abs(diff))} m ${direction} than your preferred ${Math.round(preferredElevation)} m.`,
      );
    }
  }

  return {
    warnings,
    blockers,
    eventDifficulty,
    readinessLevel,
  };
}

export {
  LEVEL_SCORE_MAP,
  DIFFICULTY_ORDER,
  MAX_DURATION_HOURS,
  MAX_PRICE_PHP,
  MAX_DISTANCE_KM,
  MAX_ELEVATION_M,
  MIN_BREAKDOWN_SHARE,
  normalizeDifficultyValue,
  levelToScore,
  getDifficultyIndex,
  inferDifficultyFromMetrics,
  getEventDifficultyLabel,
  deriveEventDifficultyScore,
  parseBudgetRange,
  normalizeDuration,
  normalizeDistance,
  normalizeElevation,
  normalizePrice,
  textContains,
  extractTrailDescriptor,
  computeUserVector,
  computeEventVector,
  computeMatchScore,
  magnitude,
  cosineSimilarity,
  buildMatchBreakdown,
  evaluateEventReadiness,
  formatPhp,
  deriveUserAgeYears,
};
