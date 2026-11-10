export function getDeliverabilityError(
  expectedRecipientCount: number,
  deliverableRecipientCount: number
) {
  if (deliverableRecipientCount >= expectedRecipientCount) return null;

  if (deliverableRecipientCount === 0) {
    return "None of the selected recipients can receive marketing email. They may be unsubscribed, bounced, or blocked in Brevo.";
  }

  return `Only ${deliverableRecipientCount} of ${expectedRecipientCount} selected recipients can receive marketing email. Review the suppressed contacts in Brevo and try again.`;
}
