export const RECIPIENT_NAME_TOKEN = "{{recipient_name}}";
export const BREVO_RECIPIENT_NAME_TOKEN =
  '{{ contact.RECIPIENT_NAME|default:"Valued Partner" }}';

export function compileRecipientToken(html: string) {
  return html.replaceAll(RECIPIENT_NAME_TOKEN, BREVO_RECIPIENT_NAME_TOKEN);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function renderRecipientPreview(html: string, recipientName: string) {
  const safeName = escapeHtml(recipientName || "Valued Partner");

  return html
    .replaceAll(RECIPIENT_NAME_TOKEN, safeName)
    .replace(
      /{{\s*contact\.RECIPIENT_NAME(?:\|default:"[^"]*")?\s*}}/g,
      safeName
    );
}
