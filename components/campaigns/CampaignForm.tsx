"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { emailHtmlToText, textToEmailHtml } from "@/lib/campaigns/content";
import { getCampaignDetailsFromTemplate } from "@/lib/email-templates/campaign-defaults";
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
  defaultCampaignName?: string | null;
  defaultSubject?: string | null;
  defaultPreviewText?: string | null;
  createdAt: string;
  updatedAt: string;
};
type TemplateCampaignDetails = {
  name: string;
  subject: string;
  previewText: string;
};
type CronSlot = {
  loading: boolean;
  available: boolean;
  batch?: { id: string; name: string; itemCount: number; armedAt: string } | null;
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
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [templateCampaignDetails, setTemplateCampaignDetails] = useState<
    Record<string, TemplateCampaignDetails>
  >({});
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
  const [savedBatchId, setSavedBatchId] = useState<string | null>(null);
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
        setSlot({ loading: false, available: slotData.available, batch: slotData.batch ?? null, campaign: slotData.campaign, error: "" });
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
        const initialTemplateId = campaignTemplateId || loadedTemplates[0]?.id || "";
        setTemplateId(initialTemplateId);
        if (initialTemplateId) {
          setSelectedTemplateIds([initialTemplateId]);
          const initialTemplate = loadedTemplates.find(
            (template) => template.id === initialTemplateId,
          );
          if (campaignResult.data?.message_mode === "template") {
            setTemplateCampaignDetails({
              [initialTemplateId]: {
                name: campaignResult.data.name ?? "",
                subject: campaignResult.data.subject ?? "",
                previewText: campaignResult.data.preview_text ?? "",
              },
            });
          } else if (initialTemplate) {
            setTemplateCampaignDetails({
              [initialTemplateId]: getCampaignDetailsFromTemplate(initialTemplate),
            });
          }
        }
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
  const selectedTemplates = selectedTemplateIds
    .map((id) => templates.find((template) => template.id === id))
    .filter((template): template is SavedEmailTemplate => Boolean(template));
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

  function getTemplateDetails(template: SavedEmailTemplate) {
    const defaults = getCampaignDetailsFromTemplate(template);
    return {
      name: defaults.name,
      subject: defaults.subject,
      previewText: defaults.previewText,
    };
  }

  function applyTemplateDefaults(template: SavedEmailTemplate) {
    const defaults = getTemplateDetails(template);
    setTemplateCampaignDetails((current) => ({
      ...current,
      [template.id]: defaults,
    }));
    setName(defaults.name);
    setSubject(defaults.subject);
    setPreviewText(defaults.previewText);
  }

  function selectMessageMode(nextMode: MessageMode) {
    setMessageMode(nextMode);
    if (nextMode === "template" && activeTemplate) {
      if (!templateCampaignDetails[activeTemplate.id]) {
        applyTemplateDefaults(activeTemplate);
      }
    } else if (nextMode === "manual" && activeTemplate) {
      const details = templateCampaignDetails[activeTemplate.id];
      if (details) {
        setName(details.name);
        setSubject(details.subject);
        setPreviewText(details.previewText);
      }
    }
  }

  function selectSingleTemplate(nextTemplateId: string) {
    setTemplateId(nextTemplateId);
    setSelectedTemplateIds(nextTemplateId ? [nextTemplateId] : []);
    const nextTemplate = templates.find(
      (template) => template.id === nextTemplateId
    );
    if (nextTemplate) applyTemplateDefaults(nextTemplate);
  }

  function toggleTemplate(template: SavedEmailTemplate, selected: boolean) {
    setTemplateError("");
    if (selected) {
      if (selectedTemplateIds.length >= 10) {
        setTemplateError("A delivery batch can contain up to 10 email templates.");
        return;
      }
      setSelectedTemplateIds((current) => [...current, template.id]);
      setTemplateCampaignDetails((current) => ({
        ...current,
        [template.id]: current[template.id] ?? getTemplateDetails(template),
      }));
      setTemplateId(template.id);
      return;
    }

    const remaining = selectedTemplateIds.filter((id) => id !== template.id);
    setSelectedTemplateIds(remaining);
    if (templateId === template.id) setTemplateId(remaining[0] ?? "");
  }

  function updateTemplateDetails(
    id: string,
    field: keyof TemplateCampaignDetails,
    value: string,
  ) {
    setTemplateCampaignDetails((current) => ({
      ...current,
      [id]: {
        ...(current[id] ?? { name: "", subject: "", previewText: "" }),
        [field]: value,
      },
    }));
  }

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
      if (selectedTemplateIds.length < 10) {
        setTemplateId(uploaded.id);
        setSelectedTemplateIds((current) => [...current, uploaded.id]);
        applyTemplateDefaults(uploaded);
      } else {
        setTemplateError(
          "The template was uploaded, but the current delivery batch already has 10 selected templates.",
        );
      }
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
      const remainingSelectedIds = selectedTemplateIds.filter(
        (id) => id !== activeTemplate.id,
      );
      setSelectedTemplateIds(remainingSelectedIds);
      const nextTemplate =
        remaining.find((template) => remainingSelectedIds.includes(template.id)) ??
        remaining[0] ??
        null;
      setTemplateId(nextTemplate?.id ?? "");
      if (nextTemplate && remainingSelectedIds.length === 0) {
        setSelectedTemplateIds([nextTemplate.id]);
        applyTemplateDefaults(nextTemplate);
      }
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
    setSavedBatchId(null);
    setConflictingCampaignId(null);
    if (selectedContactIds.length === 0) {
      setRecipientError("Select at least one subscribed recipient.");
      document.getElementById("campaign-audience")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (messageMode === "template" && selectedTemplateIds.length === 0) {
      setTemplateError("Upload or select an HTML template before saving.");
      document.getElementById("campaign-message")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setSavingMode(mode);
    const singleTemplateDetails =
      messageMode === "template" && selectedTemplateIds.length === 1
        ? templateCampaignDetails[selectedTemplateIds[0]]
        : null;
    const payload = {
      name: singleTemplateDetails?.name ?? name,
      subject: singleTemplateDetails?.subject ?? subject,
      previewText: singleTemplateDetails?.previewText ?? previewText,
      content,
      messageMode,
      templateId:
        messageMode === "template" ? selectedTemplateIds[0] ?? null : null,
      recipientContactIds: selectedContactIds,
      deliveryMode: mode,
    };
    try {
      let response: Response;
      if (
        !campaignId &&
        messageMode === "template" &&
        selectedTemplateIds.length > 1
      ) {
        response = await fetch("/api/campaign-batches/from-templates", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            items: selectedTemplateIds.map((id) => ({
              templateId: id,
              ...templateCampaignDetails[id],
            })),
            recipientContactIds: selectedContactIds,
            deliveryMode: mode,
          }),
        });
      } else if (campaignId) {
        response = await fetch(`/api/campaigns/${campaignId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
        if (response.ok && mode === "cron") response = await fetch(`/api/campaigns/${campaignId}/cron`, { method: "POST" });
      } else {
        response = await fetch("/api/campaigns", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      }

      const result = await response.json();
      if (!response.ok) {
        setError(result.error || "Unable to save this campaign.");
        setSavedDraftId(result.savedAsDraft ? result.campaignId : null);
        setSavedBatchId(result.batchId ?? null);
        setConflictingCampaignId(result.conflictingCampaignId ?? null);
        return;
      }
      router.push(
        result.batchId
          ? `/dashboard/campaign-batches/${result.batchId}`
          : `/dashboard/campaigns/${result.campaignId ?? campaignId}`,
      );
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
      <WorkflowSection id="campaign-message" number="1" title="Email setup" description="Choose an HTML template or write a plain-text email first.">
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="sr-only">Message type</legend>
          <DeliveryOption name="message-mode" checked={messageMode === "template"} onChange={() => selectMessageMode("template")} title="Use HTML template" description="Use a designed campaign and automatically fill its campaign details." />
          <DeliveryOption name="message-mode" checked={messageMode === "manual"} onChange={() => selectMessageMode("manual")} title="Write message" description="Write a plain-text email and enter its details manually." />
        </fieldset>

        {messageMode === "template" ? (
          <div className="mt-5 space-y-4">
            {campaignId ? (
              <Field label="Email template" required>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <select
                    value={templateId}
                    onChange={(event) => selectSingleTemplate(event.target.value)}
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
            ) : (
              <div className="campaign-field">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span>Email templates <b>*</b></span>
                  <strong className="text-sm text-orange-300">
                    {selectedTemplateIds.length} of 10 selected
                  </strong>
                </div>
                <div className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-white/10 bg-white/[0.02]">
                  {templatesLoading ? (
                    <p className="p-4 text-sm text-gray-400">Loading templates…</p>
                  ) : templates.length === 0 ? (
                    <p className="p-4 text-sm text-gray-400">Upload your first template below.</p>
                  ) : templates.map((template) => {
                    const checked = selectedTemplateIds.includes(template.id);
                    return (
                      <label key={template.id} className="flex cursor-pointer items-start gap-3 border-b border-white/10 p-4 last:border-b-0 hover:bg-white/[0.04]">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!checked && selectedTemplateIds.length >= 10}
                          onChange={(event) => toggleTemplate(template, event.target.checked)}
                          className="mt-1 accent-orange-500"
                        />
                        <span className="min-w-0 flex-1">
                          <strong className="block text-sm text-white">{template.name}</strong>
                          <small className="block truncate text-xs text-gray-400">{template.sourceFilename}</small>
                        </span>
                        {checked ? <span className="text-xs font-semibold text-orange-300">Included</span> : null}
                      </label>
                    );
                  })}
                </div>
                <small>Select one template for a normal campaign or several templates for one delivery batch.</small>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
                  <label className="campaign-field flex-1">
                    <span>Template to preview</span>
                    <select
                      value={templateId}
                      onChange={(event) => setTemplateId(event.target.value)}
                      className="campaign-input"
                      disabled={selectedTemplates.length === 0}
                    >
                      {selectedTemplates.length === 0 ? <option value="">Select a template</option> : selectedTemplates.map((template) => (
                        <option key={template.id} value={template.id}>{template.name}</option>
                      ))}
                    </select>
                  </label>
                  <button type="button" className="campaign-secondary-button" disabled={!activeTemplate || archivingTemplate} onClick={() => void archiveTemplate()}>{archivingTemplate ? "Archiving…" : "Archive previewed template"}</button>
                </div>
              </div>
            )}
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

      <WorkflowSection number="2" title="Campaign details" description="Review the campaign name and the Gmail subject and preview text.">
        {messageMode === "template" ? (
          <>
            <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
              Each selected template provides automatic defaults. Every email remains an independent campaign, and all values can be edited before preparation.
            </p>
            <div className="space-y-4">
              {selectedTemplates.map((template, index) => {
                const details = templateCampaignDetails[template.id] ?? getTemplateDetails(template);
                return (
                  <fieldset key={template.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                    <legend className="px-2 text-sm font-semibold text-white">
                      {index + 1}. {template.name}
                    </legend>
                    <div className="mt-2 grid gap-4">
                      <Field label="Campaign name" required><input value={details.name} onChange={(event) => updateTemplateDetails(template.id, "name", event.target.value)} required placeholder="e.g. November Newsletter" className="campaign-input" /></Field>
                      <Field label="Email subject" required><input value={details.subject} onChange={(event) => updateTemplateDetails(template.id, "subject", event.target.value)} required placeholder="e.g. What’s new at XMETA this November" className="campaign-input" /></Field>
                      <Field label="Preview text (optional)" help="A short summary shown in inboxes after the subject."><input value={details.previewText} onChange={(event) => updateTemplateDetails(template.id, "previewText", event.target.value)} placeholder="A quick update on our latest news and upcoming events" className="campaign-input" /></Field>
                    </div>
                  </fieldset>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <Field label="Campaign name" required><input value={name} onChange={(event) => setName(event.target.value)} required placeholder="e.g. November Newsletter" className="campaign-input" /></Field>
            <Field label="Email subject" required><input value={subject} onChange={(event) => setSubject(event.target.value)} required placeholder="e.g. What’s new at XMETA this November" className="campaign-input" /></Field>
            <Field label="Preview text (optional)" help="A short summary shown in inboxes after the subject."><input value={previewText} onChange={(event) => setPreviewText(event.target.value)} placeholder="A quick update on our latest news and upcoming events" className="campaign-input" /></Field>
          </>
        )}
      </WorkflowSection>

      <WorkflowSection id="campaign-audience" number="3" title="Audience" description="Choose the subscribed contacts who should receive this campaign.">
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

      <WorkflowSection number="4" title="Delivery" description="Prepare one campaign or a batch of up to 10 campaigns for your existing cron job.">
        <fieldset className="space-y-3"><legend className="sr-only">Delivery method</legend><DeliveryOption checked={deliveryMode === "draft"} onChange={() => setDeliveryMode("draft")} title="Save as draft" description="Keep editing or review it later." /><DeliveryOption checked={deliveryMode === "cron"} onChange={() => setDeliveryMode("cron")} title="Prepare for cron" description="Prepare every selected email in Brevo, then review the delivery batch before it waits for cron." /></fieldset>
        <div className={`cron-slot-state ${slot.available ? "cron-slot-available" : "cron-slot-occupied"}`}><span aria-hidden="true">{slot.loading ? "…" : slot.available ? "✓" : "!"}</span><div><strong>{slot.loading ? "Checking delivery batch…" : slot.available ? "Delivery batch slot available" : "A delivery batch is already waiting"}</strong>{slot.batch ? <Link href={`/dashboard/campaign-batches/${slot.batch.id}`}>View {slot.batch.name} ({slot.batch.itemCount} campaigns)</Link> : slot.campaign && slot.campaign.id !== campaignId ? <Link href={`/dashboard/campaigns/${slot.campaign.id}`}>View {slot.campaign.name}</Link> : null}{slot.error && <small>{slot.error}</small>}</div></div>
        <div className="cron-steps" aria-label="Cron delivery steps"><span><b>1</b> Prepare campaigns</span><span><b>2</b> Review delivery batch</span><span><b>3</b> Send together at cron</span></div>
      </WorkflowSection>

      {error && <div role="alert" className="campaign-error"><strong>Campaign not ready</strong><p>{error}</p><div className="mt-2 flex flex-wrap gap-3">{savedDraftId && <Link href={`/dashboard/campaigns/${savedDraftId}`}>Open saved draft</Link>}{savedBatchId && <Link href={`/dashboard/campaign-batches/${savedBatchId}`}>Open delivery batch</Link>}{conflictingCampaignId && <Link href={`/dashboard/campaigns/${conflictingCampaignId}`}>View campaign waiting for cron</Link>}</div></div>}

      <div className="campaign-form-actions" aria-live="polite">
        <button type="button" onClick={() => router.push(campaignId ? `/dashboard/campaigns/${campaignId}` : "/dashboard/campaigns")} className="campaign-cancel-button">Cancel</button>
        <button type="button" disabled={Boolean(savingMode)} onClick={() => void saveCampaign("draft")} className="campaign-secondary-button">{savingMode === "draft" ? "Saving…" : "Save draft"}</button>
        <span className="campaign-send-note">ⓘ This does not send the email.</span>
        <button type="submit" disabled={Boolean(savingMode) || slot.loading || (messageMode === "template" && selectedTemplateIds.length === 0) || (deliveryMode === "cron" && !slot.available && slot.campaign?.id !== campaignId)} className="campaign-primary-button">{savingMode === "cron" ? `Preparing ${selectedTemplateIds.length > 1 ? "batch" : "campaign"}…` : deliveryMode === "cron" ? "Prepare for cron" : "Save draft"}</button>
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
