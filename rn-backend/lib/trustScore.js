import { prisma } from '@/lib/prisma';

const MAX_BUSINESS = 40;
const MAX_IDENTITY = 30;
const MAX_FACEBOOK = 20;
const MAX_ENGAGEMENT = 10;

export function computeOrganizerTrustScore({
  businessScore = 0,
  identityScore = 0,
  facebookScore = 0,
  engagementScore = 0,
}) {
  const clamp = (value, max) => {
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) return 0;
    return Math.min(num, max);
  };

  const business = clamp(businessScore, MAX_BUSINESS);
  const identity = clamp(identityScore, MAX_IDENTITY);
  const facebook = clamp(facebookScore, MAX_FACEBOOK);
  const engagement = clamp(engagementScore, MAX_ENGAGEMENT);

  const total = business + identity + facebook + engagement;
  let tier = 'UNVERIFIED';
  if (total >= 70) {
    tier = 'VERIFIED_ORGANIZER';
  } else if (total >= 50) {
    tier = 'PROVISIONAL';
  }

  return { total, tier };
}

export async function updateOrganizerTrustScore(userId) {
  if (!userId) return null;
  try {
    const [business, identity, facebook] = await Promise.all([
      prisma.businessVerification.findUnique({
        where: { userId },
        select: { score: true },
      }),
      prisma.identityVerification.findUnique({
        where: { userId },
        select: { score: true },
      }),
      prisma.facebookVerification.findUnique({
        where: { userId },
        select: { score: true, engagementScore: true },
      }),
    ]);

    const { total, tier } = computeOrganizerTrustScore({
      businessScore: business?.score ?? 0,
      identityScore: identity?.score ?? 0,
      facebookScore: facebook?.score ?? 0,
      engagementScore: facebook?.engagementScore ?? 0,
    });

    await prisma.user.update({
      where: { id: userId },
      data: {
        organizerTrustScore: total,
        organizerTrustTier: tier,
      },
    });

    return { total, tier };
  } catch (error) {
    console.error('updateOrganizerTrustScore failed:', error);
    return null;
  }
}
