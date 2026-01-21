const RESCHEDULE_POLL_STATUS_PENDING = "PENDING";
const RESCHEDULE_POLL_STATUS_APPROVED = "APPROVED";
const RESCHEDULE_POLL_STATUS_REJECTED = "REJECTED";
const RESCHEDULE_POLL_ELIGIBLE_BOOKING_STATUSES = new Set([
  "PENDING",
  "APPROVED",
  "CONFIRMED",
  "RESCHEDULE_REQUESTED",
]);

function normalizeStatus(value) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  return normalized.length ? normalized : null;
}

function parseDate(value) {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date;
}

function majorityThreshold(total) {
  if (!Number.isFinite(total) || total <= 0) {
    return 1;
  }
  return Math.floor(total / 2) + 1;
}

export async function resolveReschedulePollStatus(db, event, options = {}) {
  if (!event?.id) {
    return null;
  }
  const currentStatus =
    normalizeStatus(event.reschedulePollStatus) ?? RESCHEDULE_POLL_STATUS_PENDING;
  if (currentStatus !== RESCHEDULE_POLL_STATUS_PENDING) {
    return currentStatus;
  }
  if (!event.rescheduledAt) {
    return currentStatus;
  }

  const opensAt = parseDate(event.reschedulePollOpensAt);
  const closesAt = parseDate(event.reschedulePollClosesAt);
  if (!opensAt || !closesAt) {
    return currentStatus;
  }

  const now = options.now instanceof Date ? options.now : new Date();
  const eligibleStatuses = Array.from(RESCHEDULE_POLL_ELIGIBLE_BOOKING_STATUSES);

  const approvalStatuses = [
    RESCHEDULE_POLL_STATUS_PENDING,
    RESCHEDULE_POLL_STATUS_APPROVED,
    RESCHEDULE_POLL_STATUS_REJECTED,
  ];
  const [eligibleCount, approvedCount, rejectedCount] = await Promise.all([
    db.booking.count({
      where: {
        eventId: event.id,
        status: { in: eligibleStatuses },
        rescheduleApprovalStatus: { in: approvalStatuses },
      },
    }),
    db.booking.count({
      where: {
        eventId: event.id,
        status: { in: eligibleStatuses },
        rescheduleApprovalStatus: RESCHEDULE_POLL_STATUS_APPROVED,
      },
    }),
    db.booking.count({
      where: {
        eventId: event.id,
        status: { in: eligibleStatuses },
        rescheduleApprovalStatus: RESCHEDULE_POLL_STATUS_REJECTED,
      },
    }),
  ]);

  const threshold = majorityThreshold(eligibleCount);
  let nextStatus = null;

  if (eligibleCount > 0 && approvedCount >= threshold) {
    nextStatus = RESCHEDULE_POLL_STATUS_APPROVED;
  } else if (eligibleCount > 0 && rejectedCount >= threshold) {
    nextStatus = RESCHEDULE_POLL_STATUS_REJECTED;
  } else if (now >= closesAt) {
    nextStatus = RESCHEDULE_POLL_STATUS_REJECTED;
  }

  if (nextStatus && nextStatus !== currentStatus) {
    await db.event.update({
      where: { id: event.id },
      data: { reschedulePollStatus: nextStatus },
    });
    return nextStatus;
  }

  return currentStatus;
}
