const CANCELLATION_POLICY = [
  {
    minHoursBeforeStart: 24,
    refundPercentage: 100,
    policyCode: "FULL_24_HOURS",
    label: "Full refund (24+ hours before start)",
  },
  {
    minHoursBeforeStart: 2,
    refundPercentage: 50,
    policyCode: "PARTIAL_2_HOURS",
    label: "50% refund (2-24 hours before start)",
  },
  {
    minHoursBeforeStart: 0,
    refundPercentage: 0,
    policyCode: "NO_REFUND",
    label: "No refund (under 2 hours before start)",
  },
];

function normalizeDate(value) {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return null;
  }
  return date;
}

function roundCurrency(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return 0;
  }
  return Math.round(amount * 100) / 100;
}

export function buildCancellationOutcome({ startsAt, cancelledAt, totalAmount }) {
  const normalizedStart = normalizeDate(startsAt);
  const normalizedCancel = normalizeDate(cancelledAt) ?? new Date();
  const amount = Number(totalAmount);
  const validAmount = Number.isFinite(amount) && amount > 0 ? amount : 0;

  if (!normalizedStart) {
    return {
      refundPercentage: 100,
      refundAmount: roundCurrency(validAmount),
      policyCode: "FULL_UNSCHEDULED",
      policyLabel: "Full refund (event time pending)",
      hoursBeforeStart: null,
    };
  }

  const hoursBeforeStart = Math.max(
    0,
    (normalizedStart.getTime() - normalizedCancel.getTime()) / (1000 * 60 * 60),
  );
  const tier =
    CANCELLATION_POLICY.find((rule) => hoursBeforeStart >= rule.minHoursBeforeStart) ??
    CANCELLATION_POLICY[CANCELLATION_POLICY.length - 1];
  const refundPercentage = tier.refundPercentage;
  const refundAmount = roundCurrency(validAmount * (refundPercentage / 100));

  return {
    refundPercentage,
    refundAmount,
    policyCode: tier.policyCode,
    policyLabel: tier.label,
    hoursBeforeStart: Number.isFinite(hoursBeforeStart)
      ? Math.round(hoursBeforeStart * 10) / 10
      : null,
  };
}

export const CANCELLATION_POLICY_SUMMARY =
  "Free cancellation 24+ hours before start. 50% refund 2-24 hours. No refund under 2 hours.";
