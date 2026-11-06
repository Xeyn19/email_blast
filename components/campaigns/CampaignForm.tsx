
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Contact = {
  id: string;
  full_name: string | null;
  email: string;
};

export function CampaignForm() {
  const router = useRouter();

  // Campaign fields
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [content, setContent] = useState("");

  // Saving state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Recipient selection
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [contactsError, setContactsError] = useState("");

  // Load subscribed contacts
  useEffect(() => {
    let active = true;

    async function loadContacts() {
      const supabase = createClient();

      const { data, error } = await supabase
        .from("contacts")
        .select("id, full_name, email")
        .eq("status", "subscribed")
        .order("created_at", { ascending: false });

      if (!active) return;

      if (error) {
        setContactsError(error.message);
      } else {
        setContacts(data ?? []);
      }

      setLoadingContacts(false);
    }

    loadContacts();

    return () => {
      active = false;
    };
  }, []);

  // Select or deselect all contacts
  function handleSelectAll() {
    if (selectedContactIds.length === contacts.length) {
      setSelectedContactIds([]);
    } else {
      setSelectedContactIds(contacts.map((contact) => contact.id));
    }
  }

  // Save campaign as draft
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

      const { error: saveError } = await supabase
        .from("campaigns")
        .insert({
          user_id: user.id,
          name: name.trim(),
          subject: subject.trim(),
          preview_text: previewText.trim() || null,
          html_content: `<div>${htmlContent}</div>`,
          recipient_contact_ids: selectedContactIds,
          status: "draft",
        });

      if (saveError) {
        setError(saveError.message);
        setSaving(false);
        return;
      }

      router.push("/dashboard/campaigns");
      router.refresh();
    } catch {
      setError("Something went wrong while saving your campaign.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">

      {/* Campaign name */}
      <div>
        <label className="mb-2 block text-sm font-medium">
          Campaign name
        </label>

        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. November Newsletter"
          required
          className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-4 py-3 text-white outline-none focus:border-orange-500"
        />
      </div>

      {/* Email subject */}
      <div>
        <label className="mb-2 block text-sm font-medium">
          Email subject
        </label>

        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="e.g. Our latest updates are here!"
          required
          className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-4 py-3 text-white outline-none focus:border-orange-500"
        />
      </div>

      {/* Preview text */}
      <div>
        <label className="mb-2 block text-sm font-medium">
          Preview text
        </label>

        <input
          type="text"
          value={previewText}
          onChange={(e) => setPreviewText(e.target.value)}
          placeholder="A short summary shown in an inbox"
          className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-4 py-3 text-white outline-none focus:border-orange-500"
        />
      </div>

      {/* Recipient selection */}
      <div>
        <label className="mb-3 block text-sm font-medium">
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
          <p className="rounded-lg border border-white/10 p-4 text-sm text-gray-400">
            No subscribed contacts found. Add contacts and make sure their
            status is subscribed before creating your campaign.
          </p>
        ) : (
          <div className="rounded-lg border border-white/10">

            <div className="flex items-center justify-between border-b border-white/10 p-4">
              <span className="text-sm text-gray-400">
                {selectedContactIds.length} of {contacts.length} selected
              </span>

              <button
                type="button"
                onClick={handleSelectAll}
                className="text-sm text-orange-400 hover:text-orange-300"
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
                  className="flex cursor-pointer items-center gap-3 border-b border-white/5 p-4 last:border-0 hover:bg-white/[0.03]"
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
                    className="accent-orange-500"
                  />

                  <div>
                    <p className="text-sm font-medium">
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

      {/* Email content */}
      <div>
        <label className="mb-2 block text-sm font-medium">
          Email content
        </label>

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write your email message here..."
          required
          rows={12}
          className="w-full resize-y rounded-lg border border-white/10 bg-white/[0.05] px-4 py-3 text-white outline-none focus:border-orange-500"
        />
      </div>

      {/* Error message */}
      {error && (
        <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </p>
      )}

      {/* Form buttons */}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => router.push("/dashboard/campaigns")}
          className="rounded-lg border border-white/10 px-5 py-3 text-white"
        >
          Cancel
        </button>

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-orange-500 px-5 py-3 font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save as Draft"}
        </button>
      </div>

    </form>
  );
}
