const NON_REFUNDABLE_POLICY = {
  refundPercentage: 0,
  policyCode: "NON_REFUNDABLE",
  label: "Non-refundable booking",
};

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
      refundPercentage: NON_REFUNDABLE_POLICY.refundPercentage,
      refundAmount: 0,
      policyCode: NON_REFUNDABLE_POLICY.policyCode,
      policyLabel: NON_REFUNDABLE_POLICY.label,
      hoursBeforeStart: null,
    };
  }

  const hoursBeforeStart = Math.max(
    0,
    (normalizedStart.getTime() - normalizedCancel.getTime()) / (1000 * 60 * 60),
  );
  const refundPercentage = NON_REFUNDABLE_POLICY.refundPercentage;
  const refundAmount = roundCurrency(validAmount * (refundPercentage / 100));

  return {
    refundPercentage,
    refundAmount,
    policyCode: NON_REFUNDABLE_POLICY.policyCode,
    policyLabel: NON_REFUNDABLE_POLICY.label,
    hoursBeforeStart: Number.isFinite(hoursBeforeStart)
      ? Math.round(hoursBeforeStart * 10) / 10
      : null,
  };
}

export const CANCELLATION_POLICY_SUMMARY =
  "Bookings are non-refundable. Schedule transfers are allowed via reschedule requests. If the organizer moves an event due to weather, your booking stays active for the new schedule.";
