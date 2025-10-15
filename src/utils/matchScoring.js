const LEVEL_SCORE_MAP = {
  beginner: 0.2,
  intermediate: 0.6,
  expert: 1,
};

const MAX_DURATION_HOURS = 12;
const MAX_PRICE_PHP = 12000;
const MIN_BREAKDOWN_SHARE = 0.01;

function clamp(value, min = 0, max = 1) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
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
  ];
}

function computeEventVector(event, user) {
  const durationScore = normalizeDuration(Number(event?.durationHrs));
  const priceScore = normalizePrice(Number(event?.price));
  const difficultyScore = deriveEventDifficultyScore(event);
  const trailPreference = user?.preferredTrailType;
  const descriptor = trailPreference ? extractTrailDescriptor(event) : null;
  const trailScore = trailPreference && descriptor && textContains(descriptor, trailPreference) ? 1 : 0;

  return [difficultyScore, difficultyScore, durationScore, priceScore, trailScore];
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
  preferenceVector,
  eventVector,
  minShare = MIN_BREAKDOWN_SHARE,
}) {
  if (!Array.isArray(preferenceVector) || !Array.isArray(eventVector)) {
    return [];
  }

  const prefMagnitude = magnitude(preferenceVector);
  const eventMagnitude = magnitude(eventVector);
  const denominator = prefMagnitude * eventMagnitude;
  if (denominator <= 0) {
    return [];
  }

  const budgetRange = parseBudgetRange(user?.budgetRange);
  const eventDifficultyLabel = getEventDifficultyLabel(event);
  const userPreferredDifficulty = normalizeDifficultyValue(user?.preferredDifficulty);
  const userExperienceLevel = normalizeDifficultyValue(user?.experienceLevel);
  const preferredDuration = Number(user?.preferredDurationHrs);
  const eventDuration = Number(event?.durationHrs);
  const priceNumber = Number(event?.price);
  const preferredTrailRaw = typeof user?.preferredTrailType === 'string' ? user.preferredTrailType.trim() : '';
  const preferredTrail = preferredTrailRaw || '';
  const descriptor = preferredTrail ? extractTrailDescriptor(event) : null;
  const matchesTrail = Boolean(preferredTrail && descriptor && textContains(descriptor, preferredTrail));

  const context = {
    eventDifficultyLabel,
    userPreferredDifficulty,
    userExperienceLevel,
    preferredDuration,
    eventDuration,
    budgetRange,
    priceNumber,
    preferredTrail,
    matchesTrail,
  };

  const formatRange = (min, max) => {
    const minText = formatPhp(min);
    const maxText = formatPhp(max);
    if (minText && maxText) {
      return `${minText}–${maxText}`;
    }
    return minText || maxText || null;
  };

  const groups = [
    {
      key: 'difficulty',
      label: 'Difficulty alignment',
      indices: [0, 1],
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
      indices: [2],
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
      key: 'budget',
      label: 'Budget fit',
      indices: [3],
      detail: ({ budgetRange: range, priceNumber: price }) => {
        const priceText = formatPhp(price);
        if (!priceText) {
          return 'Pricing has not been announced yet.';
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
      indices: [4],
      detail: ({ preferredTrail, matchesTrail }) => {
        if (!preferredTrail) {
          return null;
        }
        if (matchesTrail) {
          return `Highlights ${preferredTrail} trails, matching what you look for.`;
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
      if (contribution <= 0 || contribution < minShare) {
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
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 3);
}

export {
  LEVEL_SCORE_MAP,
  MAX_DURATION_HOURS,
  MAX_PRICE_PHP,
  MIN_BREAKDOWN_SHARE,
  normalizeDifficultyValue,
  levelToScore,
  inferDifficultyFromMetrics,
  getEventDifficultyLabel,
  deriveEventDifficultyScore,
  parseBudgetRange,
  normalizeDuration,
  normalizePrice,
  textContains,
  extractTrailDescriptor,
  computeUserVector,
  computeEventVector,
  magnitude,
  cosineSimilarity,
  buildMatchBreakdown,
  formatPhp,
};

