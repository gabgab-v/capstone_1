const INACTIVITY_MONTHS = 12;
export const INACTIVITY_REASON = 'INACTIVITY_12_MONTHS';

const DEFAULT_TERMS_VERSION = process.env.CURRENT_TERMS_VERSION || 'latest';

export function getRequiredTermsVersion() {
  return DEFAULT_TERMS_VERSION;
}

export function getLastActiveDate(user) {
  return user?.lastActiveAt || user?.updatedAt || user?.createdAt || null;
}

export function shouldDeactivateForInactivity(user) {
  const lastActiveAt = getLastActiveDate(user);
  if (!lastActiveAt) return false;

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - INACTIVITY_MONTHS);

  return new Date(lastActiveAt) < cutoff;
}

export function buildReactivationChecklist(existingChecklist = {}) {
  const base =
    existingChecklist &&
    typeof existingChecklist === 'object' &&
    !Array.isArray(existingChecklist)
      ? existingChecklist
      : {};

  return {
    verifyEmail: base.verifyEmail ?? true,
    verifyPhone: base.verifyPhone ?? true,
    resetPassword: base.resetPassword ?? true,
    acceptTermsVersion: base.acceptTermsVersion ?? getRequiredTermsVersion(),
  };
}

export function isReactivationComplete(checklist, user) {
  const termsRequirement = checklist.acceptTermsVersion;
  const termsSatisfied =
    !termsRequirement || user?.termsVersionAccepted === termsRequirement;

  return (
    !checklist.verifyEmail &&
    !checklist.verifyPhone &&
    !checklist.resetPassword &&
    termsSatisfied
  );
}

export function publicRecoveryRequirements(checklist, user) {
  return {
    verifyEmail: checklist.verifyEmail,
    verifyPhone: checklist.verifyPhone,
    resetPassword: checklist.resetPassword,
    acceptUpdatedTerms: checklist.acceptTermsVersion
      ? {
          requiredVersion: checklist.acceptTermsVersion,
          acceptedVersion: user?.termsVersionAccepted || null,
        }
      : null,
  };
}
