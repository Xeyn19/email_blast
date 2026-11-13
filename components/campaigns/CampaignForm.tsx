"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { emailHtmlToText, textToEmailHtml } from "@/lib/campaigns/content";
import {
  RECIPIENT_NAME_TOKEN,
  renderRecipientPreview,
} from "@/lib/email-templates/tokens";
import { createClient } from "@/lib/supabase/client";

type Contact = {
  id: string;
  full_name: string | null;
  company: string | null;
  email: string;
};
type DeliveryMode = "draft" | "cron";
type MessageMode = "manual" | "template";
type SavedEmailTemplate = {
  id: string;
  name: string;
  sourceFilename: string;
  htmlContent: string;
  assetUrls: string[];
  createdAt: string;
  updatedAt: string;
};
type CronSlot = {
  loading: boolean;
  available: boolean;
  campaign: { id: string; name: string; armedAt: string } | null;
  error: string;
};

export function CampaignForm({ campaignId }: { campaignId?: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [content, setContent] = useState("");
  const [messageMode, setMessageMode] = useState<MessageMode>("manual");
  const [templates, setTemplates] = useState<SavedEmailTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templateId, setTemplateId] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [templateError, setTemplateError] = useState("");
  const [uploadingTemplate, setUploadingTemplate] = useState(false);
  const [archivingTemplate, setArchivingTemplate] = useState(false);
  const [previewContactId, setPreviewContactId] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>("cron");
  const [showPreview, setShowPreview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingMode, setSavingMode] = useState<DeliveryMode | null>(null);
  const [error, setError] = useState("");
  const [recipientError, setRecipientError] = useState("");
  const [savedDraftId, setSavedDraftId] = useState<string | null>(null);
  const [conflictingCampaignId, setConflictingCampaignId] = useState<string | null>(null);
  const [slot, setSlot] = useState<CronSlot>({ loading: true, available: false, campaign: null, error: "" });

  useEffect(() => {
    let active = true;
    async function load() {
      const supabase = createClient();
      const [contactsResult, campaignResult, slotResponse, templatesResponse] = await Promise.all([
        supabase.from("contacts").select("id, full_name, company, email").eq("status", "subscribed").order("created_at", { ascending: false }),
        campaignId ? supabase.from("campaigns").select("*").eq("id", campaignId).single() : Promise.resolve({ data: null, error: null }),
        fetch("/api/campaigns/cron-slot", { cache: "no-store" }),
        fetch("/api/email-templates", { cache: "no-store" }),
      ]);
      if (!active) return;

      if (contactsResult.error) setError("Unable to load subscribed contacts.");
      else setContacts(contactsResult.data ?? []);

      if (campaignId) {
        const campaign = campaignResult.data;
        if (campaignResult.error || !campaign) setError("Unable to load this campaign.");
        else {
          setName(campaign.name ?? "");
          setSubject(campaign.subject ?? "");
          setPreviewText(campaign.preview_text ?? "");
          const loadedMessageMode =
            campaign.message_mode === "template" ? "template" : "manual";
          setMessageMode(loadedMessageMode);
          setTemplateId(campaign.template_id ?? "");
          setContent(
            loadedMessageMode === "manual"
              ? emailHtmlToText(campaign.html_content ?? "")
              : ""
          );
          setSelectedContactIds(campaign.recipient_contact_ids ?? []);
        }
      }

      if (slotResponse.ok) {
        const slotData = await slotResponse.json();
        setSlot({ loading: false, available: slotData.available, campaign: slotData.campaign, error: "" });
      } else setSlot({ loading: false, available: false, campaign: null, error: "Cron slot status is unavailable." });
      if (templatesResponse.ok) {
        const templateData = await templatesResponse.json();
        let loadedTemplates = (templateData.templates ?? []) as SavedEmailTemplate[];
        const campaignTemplateId = campaignResult.data?.template_id as string | undefined;
        if (
          campaignTemplateId &&
          !loadedTemplates.some((template) => template.id === campaignTemplateId)
        ) {
          const templateResponse = await fetch(
            `/api/email-templates/${campaignTemplateId}`,
            { cache: "no-store" }
          );
          if (templateResponse.ok) {
            const templateDetail = await templateResponse.json();
            loadedTemplates = [templateDetail.template, ...loadedTemplates];
          }
        }
        setTemplates(loadedTemplates);
        setTemplateId(campaignTemplateId || loadedTemplates[0]?.id || "");
      } else {
        setTemplateError("Unable to load saved email templates.");
      }
      setTemplatesLoading(false);
      setLoading(false);
    }
    load().catch(() => { if (active) { setError("Unable to load the campaign form."); setTemplatesLoading(false); setLoading(false); } });
    return () => { active = false; };
  }, [campaignId]);

  const filteredContacts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? contacts.filter((contact) => `${contact.full_name ?? ""} ${contact.company ?? ""} ${contact.email}`.toLowerCase().includes(query)) : contacts;
  }, [contacts, search]);

  const allFilteredSelected = filteredContacts.length > 0 && filteredContacts.every((contact) => selectedContactIds.includes(contact.id));

  const selectedContacts = useMemo(() => {
    const selectedIds = new Set(selectedContactIds);
    return contacts.filter((contact) => selectedIds.has(contact.id));
  }, [contacts, selectedContactIds]);

  const previewContact =
    selectedContacts.find((contact) => contact.id === previewContactId) ??
    selectedContacts[0] ??
    null;
  const activeTemplate = templates.find((template) => template.id === templateId) ?? null;
  const activeTemplateHasPersonalization =
    activeTemplate?.htmlContent.includes(RECIPIENT_NAME_TOKEN) ?? false;
  const previewRecipientName =
    previewContact?.full_name?.trim() ||
    previewContact?.company?.trim() ||
    previewContact?.email ||
    "Valued Partner";
  const emailPreviewHtml =
    messageMode === "template" && activeTemplate
      ? activeTemplateHasPersonalization
        ? renderRecipientPreview(activeTemplate.htmlContent, previewRecipientName)
        : activeTemplate.htmlContent
      : textToEmailHtml(content || "Your email preview will appear here.");

  function toggleFilteredContacts() {
    const filteredIds = new Set(filteredContacts.map((contact) => contact.id));
    setSelectedContactIds((current) => allFilteredSelected ? current.filter((id) => !filteredIds.has(id)) : [...new Set([...current, ...filteredIds])]);
  }

  async function uploadTemplate() {
    setTemplateError("");
    if (!templateFile) {
      setTemplateError("Choose an HTML template file.");
      return;
    }
    if (!templateName.trim()) {
      setTemplateError("Enter a template name.");
      return;
    }

    setUploadingTemplate(true);
    try {
      const body = new FormData();
      body.set("name", templateName.trim());
      body.set("file", templateFile);
      const response = await fetch("/api/email-templates", { method: "POST", body });
      const result = await response.json();
      if (!response.ok) {
        setTemplateError(result.error || "Unable to upload the email template.");
        return;
      }

      const uploaded = result.template as SavedEmailTemplate;
      setTemplates((current) => [uploaded, ...current]);
      setTemplateId(uploaded.id);
      setTemplateName("");
      setTemplateFile(null);
    } catch {
      setTemplateError("Unable to upload the email template. Try again.");
    } finally {
      setUploadingTemplate(false);
    }
  }

  async function archiveTemplate() {
    if (!activeTemplate) return;
    setTemplateError("");
    setArchivingTemplate(true);
    try {
      const response = await fetch(`/api/email-templates/${activeTemplate.id}`, {
        method: "DELETE",
      });
      const result = await response.json();
      if (!response.ok) {
        setTemplateError(result.error || "Unable to archive the template.");
        return;
      }

      const remaining = templates.filter(
        (template) => template.id !== activeTemplate.id
      );
      setTemplates(remaining);
      setTemplateId(remaining[0]?.id ?? "");
    } catch {
      setTemplateError("Unable to archive the template. Try again.");
    } finally {
      setArchivingTemplate(false);
    }
  }

  async function saveCampaign(mode: DeliveryMode) {
    setError("");
    setRecipientError("");
    setSavedDraftId(null);
    setConflictingCampaignId(null);
    if (selectedContactIds.length === 0) {
      setRecipientError("Select at least one subscribed recipient.");
      document.getElementById("campaign-audience")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (messageMode === "template" && !templateId) {
      setTemplateError("Upload or select an HTML template before saving.");
      document.getElementById("campaign-message")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setSavingMode(mode);
    const payload = {
      name,
      subject,
      previewText,
      content,
      messageMode,
      templateId: messageMode === "template" ? templateId : null,
      recipientContactIds: selectedContactIds,
      deliveryMode: mode,
    };
    try {
      let response: Response;
      if (campaignId) {
        response = await fetch(`/api/campaigns/${campaignId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
        if (response.ok && mode === "cron") response = await fetch(`/api/campaigns/${campaignId}/cron`, { method: "POST" });
      } else {
        response = await fetch("/api/campaigns", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      }

      const result = await response.json();
      if (!response.ok) {
        setError(result.error || "Unable to save this campaign.");
        setSavedDraftId(result.savedAsDraft ? result.campaignId : null);
        setConflictingCampaignId(result.conflictingCampaignId ?? null);
        return;
      }
      router.push(`/dashboard/campaigns/${result.campaignId ?? campaignId}`);
      router.refresh();
    } catch {
      setError("The campaign could not be saved. Check your connection and try again.");
    } finally {
      setSavingMode(null);
    }
  }

  if (loading) return <p className="py-12 text-sm text-gray-400">Loading campaign details…</p>;

  return (
    <form className="campaign-workflow" onSubmit={(event) => { event.preventDefault(); void saveCampaign(deliveryMode); }}>
      <WorkflowSection number="1" title="Campaign details" description="Give your campaign a clear name and set the email subject and preview text.">
        <Field label="Campaign name" required><input value={name} onChange={(event) => setName(event.target.value)} required placeholder="e.g. November Newsletter" className="campaign-input" /></Field>
        <Field label="Email subject" required><input value={subject} onChange={(event) => setSubject(event.target.value)} required placeholder="e.g. What’s new at XMETA this November" className="campaign-input" /></Field>
        <Field label="Preview text (optional)" help="A short summary shown in inboxes after the subject."><input value={previewText} onChange={(event) => setPreviewText(event.target.value)} placeholder="A quick update on our latest news and upcoming events" className="campaign-input" /></Field>
      </WorkflowSection>

      <WorkflowSection id="campaign-audience" number="2" title="Audience" description="Choose the subscribed contacts who should receive this campaign.">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search contacts by name or email" aria-label="Search contacts by name or email" className="campaign-input" />
        <div className="audience-toolbar"><button type="button" onClick={toggleFilteredContacts}>{allFilteredSelected ? "Deselect all results" : "Select all results"}</button><strong>{selectedContactIds.length} recipients selected</strong></div>
        <div className="audience-list">
          {filteredContacts.length === 0 ? <p className="p-5 text-sm text-gray-400">No subscribed contacts match this search.</p> : filteredContacts.map((contact) => (
            <label key={contact.id} className="audience-row">
              <input type="checkbox" checked={selectedContactIds.includes(contact.id)} onChange={(event) => setSelectedContactIds((current) => event.target.checked ? [...new Set([...current, contact.id])] : current.filter((id) => id !== contact.id))} />
              <span>
                <strong>{contact.full_name || contact.company || "Unnamed contact"}</strong>
                <small>{contact.email}{contact.full_name && contact.company ? ` · ${contact.company}` : ""}</small>
              </span>
            </label>
          ))}
        </div>
        {recipientError && <p role="alert" className="mt-3 text-sm text-red-300">{recipientError}</p>}
      </WorkflowSection>

      <WorkflowSection id="campaign-message" number="3" title="Message" description="Choose a saved HTML template or write a plain-text email.">
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="sr-only">Message type</legend>
          <DeliveryOption name="message-mode" checked={messageMode === "template"} onChange={() => setMessageMode("template")} title="Use HTML template" description="Use a designed campaign, with optional recipient-name personalization." />
          <DeliveryOption name="message-mode" checked={messageMode === "manual"} onChange={() => setMessageMode("manual")} title="Write message" description="Write a plain-text email using the existing editor." />
        </fieldset>

        {messageMode === "template" ? (
          <div className="mt-5 space-y-4">
            <Field label="Email template" required>
              <div className="flex flex-col gap-3 sm:flex-row">
                <select
                  value={templateId}
                  onChange={(event) => setTemplateId(event.target.value)}
                  className="campaign-input flex-1"
                  disabled={templatesLoading || templates.length === 0}
                >
                  {templatesLoading ? <option value="">Loading templates…</option> : templates.length === 0 ? <option value="">Upload your first template below</option> : templates.map((template) => (
                    <option key={template.id} value={template.id}>{template.name}</option>
                  ))}
                </select>
                <button type="button" className="campaign-secondary-button" disabled={!activeTemplate || archivingTemplate} onClick={() => void archiveTemplate()}>{archivingTemplate ? "Archiving…" : "Archive"}</button>
              </div>
            </Field>
            {activeTemplate && <p className="text-sm text-gray-400">Uploaded from {activeTemplate.sourceFilename} · {activeTemplate.assetUrls.length} hosted image{activeTemplate.assetUrls.length === 1 ? "" : "s"}</p>}
            <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 p-4 text-sm text-orange-100">
              Recipient-name personalization is optional. Add <code>{"{{recipient_name}}"}</code> where the selected recipient&apos;s name should appear. If omitted, the template is sent unchanged. The fallback order is Full name, Company, then Email.
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <h3 className="text-sm font-semibold text-white">Upload and save a new template</h3>
              <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1.25fr_auto] lg:items-end">
                <Field label="Template name">
                  <input value={templateName} onChange={(event) => setTemplateName(event.target.value)} className="campaign-input" placeholder="e.g. E-Jeep Advertising" maxLength={120} />
                </Field>
                <Field label="HTML file" help=".html or .htm, maximum 5 MB">
                  <input key={templateFile?.name ?? "empty-template-file"} type="file" accept=".html,.htm,text/html" onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    setTemplateFile(file);
                    if (file && !templateName.trim()) setTemplateName(file.name.replace(/\.html?$/i, ""));
                  }} className="campaign-input file:mr-3 file:rounded-md file:border-0 file:bg-orange-500 file:px-3 file:py-2 file:font-semibold file:text-white" />
                </Field>
                <button type="button" className="campaign-primary-button" disabled={uploadingTemplate} onClick={() => void uploadTemplate()}>{uploadingTemplate ? "Uploading…" : "Upload template"}</button>
              </div>
              {templateError && <p role="alert" className="mt-3 text-sm text-red-300">{templateError}</p>}
            </div>
            {activeTemplate && activeTemplateHasPersonalization ? (
              <Field label="Preview greeting as" help="This changes only the preview. Brevo personalizes every recipient separately when sending.">
                <select
                  value={previewContact?.id ?? ""}
                  onChange={(event) => setPreviewContactId(event.target.value)}
                  className="campaign-input"
                  disabled={selectedContacts.length === 0}
                >
                  {selectedContacts.length === 0 ? (
                    <option value="">Select recipients first</option>
                  ) : selectedContacts.map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contact.full_name || contact.company || contact.email}
                    </option>
                  ))}
                </select>
              </Field>
            ) : activeTemplate ? (
              <p className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-gray-300">
                This template does not include recipient-name personalization. Its HTML will be previewed and sent unchanged.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="mt-5">
            <label htmlFor="campaign-content" className="text-sm font-semibold text-gray-100">Email content <span className="text-orange-400">*</span></label>
            <textarea id="campaign-content" value={content} onChange={(event) => setContent(event.target.value)} required rows={10} placeholder="Write your email message here…" className="campaign-input mt-3 resize-y" />
            <p className="mt-2 text-xs text-gray-500">Write the full email in plain text. Line breaks are preserved.</p>
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <button type="button" onClick={() => setShowPreview((current) => !current)} className="campaign-secondary-button">{showPreview ? "Hide preview" : "Preview email"}</button>
        </div>
        {showPreview && <iframe title="Campaign email preview" sandbox="" srcDoc={emailPreviewHtml} className="mt-4 min-h-[36rem] w-full rounded-xl border border-white/10 bg-white" />}
      </WorkflowSection>

      <WorkflowSection number="4" title="Delivery" description="Prepare this campaign for your existing cron job. Only one campaign can wait at a time.">
        <fieldset className="space-y-3"><legend className="sr-only">Delivery method</legend><DeliveryOption checked={deliveryMode === "draft"} onChange={() => setDeliveryMode("draft")} title="Save as draft" description="Keep editing or review it later." /><DeliveryOption checked={deliveryMode === "cron"} onChange={() => setDeliveryMode("cron")} title="Prepare for cron" description="Prepare the recipients and email in Brevo, then arm this campaign for the next cron run." /></fieldset>
        <div className={`cron-slot-state ${slot.available ? "cron-slot-available" : "cron-slot-occupied"}`}><span aria-hidden="true">{slot.loading ? "…" : slot.available ? "✓" : "!"}</span><div><strong>{slot.loading ? "Checking cron slot…" : slot.available ? "Cron slot available" : "Cron slot occupied"}</strong>{slot.campaign && slot.campaign.id !== campaignId && <Link href={`/dashboard/campaigns/${slot.campaign.id}`}>View {slot.campaign.name}</Link>}{slot.error && <small>{slot.error}</small>}</div></div>
        <div className="cron-steps" aria-label="Cron delivery steps"><span><b>1</b> Prepare campaign</span><span><b>2</b> Wait for cron-job.org</span><span><b>3</b> Send once automatically</span></div>
      </WorkflowSection>

      {error && <div role="alert" className="campaign-error"><strong>Campaign not ready</strong><p>{error}</p><div className="mt-2 flex flex-wrap gap-3">{savedDraftId && <Link href={`/dashboard/campaigns/${savedDraftId}`}>Open saved draft</Link>}{conflictingCampaignId && <Link href={`/dashboard/campaigns/${conflictingCampaignId}`}>View campaign waiting for cron</Link>}</div></div>}

      <div className="campaign-form-actions" aria-live="polite">
        <button type="button" onClick={() => router.push(campaignId ? `/dashboard/campaigns/${campaignId}` : "/dashboard/campaigns")} className="campaign-cancel-button">Cancel</button>
        <button type="button" disabled={Boolean(savingMode)} onClick={() => void saveCampaign("draft")} className="campaign-secondary-button">{savingMode === "draft" ? "Saving…" : "Save draft"}</button>
        <span className="campaign-send-note">ⓘ This does not send the email.</span>
        <button type="submit" disabled={Boolean(savingMode) || slot.loading || (messageMode === "template" && !templateId) || (deliveryMode === "cron" && !slot.available && slot.campaign?.id !== campaignId)} className="campaign-primary-button">{savingMode === "cron" ? "Preparing campaign…" : deliveryMode === "cron" ? "Prepare for cron" : "Save draft"}</button>
      </div>
    </form>
  );
}

function WorkflowSection({ id, number, title, description, children }: { id?: string; number: string; title: string; description: string; children: React.ReactNode }) {
  return <section id={id} className="workflow-section"><div className="workflow-heading"><span>{number}</span><div><h2>{title}</h2><p>{description}</p></div></div><div className="workflow-content">{children}</div></section>;
}

function Field({ label, help, required, children }: { label: string; help?: string; required?: boolean; children: React.ReactNode }) {
  return <label className="campaign-field"><span>{label} {required && <b>*</b>}</span>{children}{help && <small>{help}</small>}</label>;
}

function DeliveryOption({ name = "delivery", checked, onChange, title, description }: { name?: string; checked: boolean; onChange: () => void; title: string; description: string }) {
  return <label className="delivery-option"><input type="radio" name={name} checked={checked} onChange={onChange} /><span><strong>{title}</strong><small>{description}</small></span></label>;
}
