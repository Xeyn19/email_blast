import { BREVO_RECIPIENT_NAME_TOKEN } from "../email-templates/tokens";

export const BREVO_RECIPIENT_NAME_ATTRIBUTE = "RECIPIENT_NAME";

export type PersonalizableContact = {
  full_name: string | null;
  company: string | null;
  email: string;
};

export function getRecipientName(contact: PersonalizableContact) {
  return (
    contact.full_name?.trim() ||
    contact.company?.trim() ||
    contact.email.trim()
  );
}

export function getBrevoRecipientAttributes(contact: PersonalizableContact) {
  return {
    [BREVO_RECIPIENT_NAME_ATTRIBUTE]: getRecipientName(contact),
  };
}

export function campaignUsesRecipientPersonalization(html: string) {
  return html.includes(BREVO_RECIPIENT_NAME_TOKEN);
}
