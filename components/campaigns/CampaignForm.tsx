
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Contact = {
  id: string;
  full_name: string | null;
  email: string;
};

type CampaignFormProps = {
  campaignId?: string;
};

export function CampaignForm({ campaignId }: CampaignFormProps) {
  const router = useRouter();

  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [content, setContent] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loadingCampaign, setLoadingCampaign] = useState(
    Boolean(campaignId)
  );

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [contactsError, setContactsError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadFormData() {
      const supabase = createClient();

      const contactsRequest = supabase
        .from("contacts")
        .select("id, full_name, email")
        .eq("status", "subscribed")
        .order("created_at", { ascending: false });

      const campaignRequest = campaignId
        ? supabase
            .from("campaigns")
            .select("*")
            .eq("id", campaignId)
            .single()
        : null;

      const { data: contactsData, error: contactsLoadError } =
        await contactsRequest;

      if (!active) return;

      if (contactsLoadError) {
        setContactsError(contactsLoadError.message);
      } else {
        setContacts(contactsData ?? []);
      }

      setLoadingContacts(false);

      if (campaignRequest) {
        const { data: campaign, error: campaignError } =
          await campaignRequest;

        if (!active) return;

        if (campaignError || !campaign) {
          setError("Unable to load this campaign.");
        } else if (campaign.status !== "draft") {
          setError("Only draft campaigns can be edited.");
        } else {
          setName(campaign.name ?? "");
          setSubject(campaign.subject ?? "");
          setPreviewText(campaign.preview_text ?? "");
          setSelectedContactIds(
            campaign.recipient_contact_ids ?? []
          );

          const plainContent = (campaign.html_content ?? "")
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<\/div>/gi, "\n")
            .replace(/<[^>]*>/g, "");

          const decoder = document.createElement("textarea");
          decoder.innerHTML = plainContent;
          setContent(decoder.value.trimEnd());
        }

        setLoadingCampaign(false);
      }
    }

    loadFormData();

    return () => {
      active = false;
    };
  }, [campaignId]);

  function handleSelectAll() {
    if (selectedContactIds.length === contacts.length) {
      setSelectedContactIds([]);
    } else {
      setSelectedContactIds(contacts.map((contact) => contact.id));
    }
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setSaving(true);
    setError("");

    try {
      const supabase = createClient();

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setError("Your session has expired. Please log in again.");
        setSaving(false);
        return;
      }

      const htmlContent = content
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, "<br>");

      const campaignData = {
        name: name.trim(),
        subject: subject.trim(),
        preview_text: previewText.trim() || null,
        html_content: `<div>${htmlContent}</div>`,
        recipient_contact_ids: selectedContactIds,
      };

      if (campaignId) {
        const { error: updateError } = await supabase
          .from("campaigns")
          .update({
            ...campaignData,
            brevo_list_id: null,
            brevo_campaign_id: null,
            brevo_synced_at: null,
          })
          .eq("id", campaignId)
          .eq("user_id", user.id)
          .eq("status", "draft");

        if (updateError) {
          setError(updateError.message);
          setSaving(false);
          return;
        }

        router.push(`/dashboard/campaigns/${campaignId}`);
      } else {
        const { data: newCampaign, error: saveError } =
          await supabase
            .from("campaigns")
            .insert({
              ...campaignData,
              user_id: user.id,
              status: "draft",
            })
            .select("id")
            .single();

        if (saveError || !newCampaign) {
          setError(saveError?.message || "Unable to save campaign.");
          setSaving(false);
          return;
        }

        router.push(`/dashboard/campaigns/${newCampaign.id}`);
      }

      router.refresh();
    } catch {
      setError("Something went wrong while saving your campaign.");
      setSaving(false);
    }
  }

  if (loadingCampaign) {
    return (
      <p className="text-sm text-gray-400">
        Loading campaign details...
      </p>
    );
  }

  return (
    <form
      onSubmit={handleSave}
      className="space-y-6 text-white"
    >
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-200">
          Campaign name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. November Newsletter"
          required
          className="w-full rounded-lg border border-white/10 bg-[#171717] px-4 py-3 text-white placeholder:text-gray-500 outline-none transition focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-gray-200">
          Email subject
        </label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="e.g. Our latest updates are here!"
          required
          className="w-full rounded-lg border border-white/10 bg-[#171717] px-4 py-3 text-white placeholder:text-gray-500 outline-none transition focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-gray-200">
          Preview text
        </label>
        <input
          type="text"
          value={previewText}
          onChange={(e) => setPreviewText(e.target.value)}
          placeholder="A short summary shown in an inbox"
          className="w-full rounded-lg border border-white/10 bg-[#171717] px-4 py-3 text-white placeholder:text-gray-500 outline-none transition focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
        />
      </div>

      <div>
        <label className="mb-3 block text-sm font-medium text-gray-200">
          Select Recipients
        </label>

        {loadingContacts ? (
          <p className="text-sm text-gray-400">
            Loading subscribed contacts...
          </p>
        ) : contactsError ? (
          <p className="text-sm text-red-400">
            Unable to load contacts: {contactsError}
          </p>
        ) : contacts.length === 0 ? (
          <p className="rounded-lg border border-white/10 bg-[#171717] p-4 text-sm text-gray-400">
            No subscribed contacts found. Add contacts and make sure
            their status is subscribed before creating your campaign.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-white/10 bg-[#171717]">
            <div className="flex items-center justify-between border-b border-white/10 bg-[#1d1d1d] p-4">
              <span className="text-sm text-gray-400">
                {selectedContactIds.length} of {contacts.length} selected
              </span>

              <button
                type="button"
                onClick={handleSelectAll}
                className="text-sm font-medium text-orange-400 transition hover:text-orange-300"
              >
                {selectedContactIds.length === contacts.length
                  ? "Deselect All"
                  : "Select All"}
              </button>
            </div>

            <div className="max-h-64 overflow-y-auto">
              {contacts.map((contact) => (
                <label
                  key={contact.id}
                  className="flex cursor-pointer items-center gap-3 border-b border-white/5 p-4 last:border-0 transition hover:bg-white/[0.04]"
                >
                  <input
                    type="checkbox"
                    checked={selectedContactIds.includes(contact.id)}
                    onChange={(e) => {
                      setSelectedContactIds((current) =>
                        e.target.checked
                          ? [...current, contact.id]
                          : current.filter((id) => id !== contact.id)
                      );
                    }}
                    className="h-4 w-4 accent-orange-500"
                  />

                  <div>
                    <p className="text-sm font-medium text-white">
                      {contact.full_name || "Unnamed Contact"}
                    </p>
                    <p className="text-xs text-gray-400">
                      {contact.email}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-gray-200">
          Email content
        </label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write your email message here..."
          required
          rows={12}
          className="w-full resize-y rounded-lg border border-white/10 bg-[#171717] px-4 py-3 text-white placeholder:text-gray-500 outline-none transition focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
        />
      </div>

      {error && (
        <p className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() =>
            router.push(
              campaignId
                ? `/dashboard/campaigns/${campaignId}`
                : "/dashboard/campaigns"
            )
          }
          className="rounded-lg border border-white/15 px-5 py-3 text-gray-300 transition hover:bg-white/5 hover:text-white"
        >
          Cancel
        </button>

        <button
          type="submit"
          disabled={
            saving ||
            loadingContacts ||
            Boolean(contactsError) ||
            selectedContactIds.length === 0
          }
          className="rounded-lg bg-orange-500 px-5 py-3 font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving
            ? "Saving..."
            : campaignId
              ? "Save Changes"
              : "Save as Draft"}
        </button>
      </div>
    </form>
  );
}
