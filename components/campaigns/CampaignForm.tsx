"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { emailHtmlToText, textToEmailHtml } from "@/lib/campaigns/content";
import { createClient } from "@/lib/supabase/client";

type Contact = { id: string; full_name: string | null; email: string };
type DeliveryMode = "draft" | "cron";
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
      const [contactsResult, campaignResult, slotResponse] = await Promise.all([
        supabase.from("contacts").select("id, full_name, email").eq("status", "subscribed").order("created_at", { ascending: false }),
        campaignId ? supabase.from("campaigns").select("*").eq("id", campaignId).single() : Promise.resolve({ data: null, error: null }),
        fetch("/api/campaigns/cron-slot", { cache: "no-store" }),
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
          setContent(emailHtmlToText(campaign.html_content ?? ""));
          setSelectedContactIds(campaign.recipient_contact_ids ?? []);
        }
      }

      if (slotResponse.ok) {
        const slotData = await slotResponse.json();
        setSlot({ loading: false, available: slotData.available, campaign: slotData.campaign, error: "" });
      } else setSlot({ loading: false, available: false, campaign: null, error: "Cron slot status is unavailable." });
      setLoading(false);
    }
    load().catch(() => { if (active) { setError("Unable to load the campaign form."); setLoading(false); } });
    return () => { active = false; };
  }, [campaignId]);

  const filteredContacts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? contacts.filter((contact) => `${contact.full_name ?? ""} ${contact.email}`.toLowerCase().includes(query)) : contacts;
  }, [contacts, search]);

  const allFilteredSelected = filteredContacts.length > 0 && filteredContacts.every((contact) => selectedContactIds.includes(contact.id));

  function toggleFilteredContacts() {
    const filteredIds = new Set(filteredContacts.map((contact) => contact.id));
    setSelectedContactIds((current) => allFilteredSelected ? current.filter((id) => !filteredIds.has(id)) : [...new Set([...current, ...filteredIds])]);
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

    setSavingMode(mode);
    const payload = { name, subject, previewText, content, recipientContactIds: selectedContactIds, deliveryMode: mode };
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
              <span><strong>{contact.full_name || "Unnamed contact"}</strong><small>{contact.email}</small></span>
            </label>
          ))}
        </div>
        {recipientError && <p role="alert" className="mt-3 text-sm text-red-300">{recipientError}</p>}
      </WorkflowSection>

      <WorkflowSection number="3" title="Message" description="Write the email content to send to your audience.">
        <div className="flex items-center justify-between gap-4"><label htmlFor="campaign-content" className="text-sm font-semibold text-gray-100">Email content <span className="text-orange-400">*</span></label><button type="button" onClick={() => setShowPreview((current) => !current)} className="campaign-secondary-button">{showPreview ? "Hide preview" : "Preview email"}</button></div>
        <textarea id="campaign-content" value={content} onChange={(event) => setContent(event.target.value)} required rows={10} placeholder="Write your email message here…" className="campaign-input mt-3 resize-y" />
        <p className="mt-2 text-xs text-gray-500">Write the full email in plain text. Line breaks are preserved.</p>
        {showPreview && <iframe title="Campaign email preview" sandbox="" srcDoc={textToEmailHtml(content || "Your email preview will appear here.")} className="mt-4 min-h-72 w-full rounded-xl border border-white/10 bg-white" />}
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
        <button type="submit" disabled={Boolean(savingMode) || slot.loading || (deliveryMode === "cron" && !slot.available && slot.campaign?.id !== campaignId)} className="campaign-primary-button">{savingMode === "cron" ? "Preparing campaign…" : deliveryMode === "cron" ? "Prepare for cron" : "Save draft"}</button>
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

function DeliveryOption({ checked, onChange, title, description }: { checked: boolean; onChange: () => void; title: string; description: string }) {
  return <label className="delivery-option"><input type="radio" name="delivery" checked={checked} onChange={onChange} /><span><strong>{title}</strong><small>{description}</small></span></label>;
}
