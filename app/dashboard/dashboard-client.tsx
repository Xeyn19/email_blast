
"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Contact = {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string;
  company: string | null;
  designation?: string | null;
  contact_number?: string | null;
  industry?: string | null;
  outreach_status?: string;
  remarks?: string | null;
  status: "pending" | "subscribed" | "unsubscribed";
  consent_source: string | null;
  consented_at: string | null;
  unsubscribed_at: string | null;
  created_at: string;
  updated_at: string;
};

type CsvContact = {
  full_name: string;
  designation: string;
  email: string;
  contact_number: string;
  company: string;
  industry: string;
  outreach_status: "Not yet emailed" | "Emailed" | "Replied back";
  remarks: string;
};

type Campaign = {
  id: string;
  name: string;
  subject: string | null;
  status: "draft" | "scheduled" | "sending" | "sent" | "failed";
  created_at: string;
  recipient_contact_ids: string[] | null;
};

type DashboardClientProps = {
  user: {
    name: string;
    email: string;
  };
  initialView: "Overview" | "Contacts";
};

export default function DashboardClient({
  user,
  initialView,
}: DashboardClientProps) {
  const [activeView, setActiveView] = useState<
    "Overview" | "Contacts"
  >(initialView);

  const [search, setSearch] = useState("");

  // Campaign states
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(true);
  const [campaignsError, setCampaignsError] = useState("");

  // Contact states
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsError, setContactsError] = useState("");

  // Add contact modal states
  const [showContactForm, setShowContactForm] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactCompany, setContactCompany] = useState("");
  const [savingContact, setSavingContact] = useState(false);

  // CSV import states
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<CsvContact[]>([]);
  const [importingCsv, setImportingCsv] = useState(false);
  const [csvImportResult, setCsvImportResult] = useState("");
  const [csvPermissionConfirmed, setCsvPermissionConfirmed] =
    useState(false);

  // Keep the displayed view synchronized with the current route.
  useEffect(() => {
    setActiveView(initialView);
  }, [initialView]);

  // Load campaigns belonging to the logged-in user.
  const loadCampaigns = useCallback(async () => {
    setCampaignsLoading(true);
    setCampaignsError("");

    const supabase = createClient();

    const { data, error } = await supabase
      .from("campaigns")
      .select(
        "id, name, subject, status, created_at, recipient_contact_ids"
      )
      .order("created_at", { ascending: false });

    if (error) {
      setCampaignsError(error.message);
      setCampaigns([]);
    } else {
      setCampaigns((data ?? []) as Campaign[]);
    }

    setCampaignsLoading(false);
  }, []);

  // Load contacts belonging to the logged-in user.
  const loadContacts = useCallback(async () => {
    setContactsLoading(true);
    setContactsError("");

    const supabase = createClient();

    const { data, error } = await supabase
      .from("contacts")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setContactsError(error.message);
      setContacts([]);
    } else {
      setContacts((data ?? []) as Contact[]);
    }

    setContactsLoading(false);
  }, []);

  useEffect(() => {
    if (activeView === "Overview") {
      loadCampaigns();
    }
  }, [activeView, loadCampaigns]);

  useEffect(() => {
    if (activeView === "Contacts") {
      loadContacts();
    }
  }, [activeView, loadContacts]);

  // Add a single contact.
  async function handleAddContact(
    e: FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    setSavingContact(true);
    setContactsError("");

    const supabase = createClient();

    const {
      data: { user: currentUser },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !currentUser) {
      setContactsError(
        "Your session has expired. Please log in again."
      );
      setSavingContact(false);
      return;
    }

    const { error } = await supabase.from("contacts").insert({
      user_id: currentUser.id,
      full_name: contactName.trim() || null,
      email: contactEmail.trim().toLowerCase(),
      company: contactCompany.trim() || null,
      status: "pending",
    });

    if (error) {
      setContactsError(
        error.code === "23505"
          ? "This email address is already in your contacts."
          : error.message
      );
      setSavingContact(false);
      return;
    }

    setContactName("");
    setContactEmail("");
    setContactCompany("");
    setShowContactForm(false);
    setSavingContact(false);

    await loadContacts();
  }

  // Parse and preview an uploaded CSV file.
  async function handleCsvUpload(file: File) {
    setContactsError("");
    setCsvPreview([]);
    setCsvImportResult("");
    setCsvPermissionConfirmed(false);

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setContactsError("Please upload a CSV file.");
      return;
    }

    try {
      const text = (await file.text()).replace(/^\uFEFF/, "");

      function parseCsv(input: string): string[][] {
        const rows: string[][] = [];
        let row: string[] = [];
        let value = "";
        let insideQuotes = false;

        for (let i = 0; i < input.length; i++) {
          const char = input[i];

          if (char === '"') {
            if (insideQuotes && input[i + 1] === '"') {
              value += '"';
              i++;
            } else {
              insideQuotes = !insideQuotes;
            }
          } else if (char === "," && !insideQuotes) {
            row.push(value.trim());
            value = "";
          } else if (
            (char === "\n" || char === "\r") &&
            !insideQuotes
          ) {
            if (char === "\r" && input[i + 1] === "\n") {
              i++;
            }

            row.push(value.trim());

            if (row.some((cell) => cell !== "")) {
              rows.push(row);
            }

            row = [];
            value = "";
          } else {
            value += char;
          }
        }

        row.push(value.trim());

        if (row.some((cell) => cell !== "")) {
          rows.push(row);
        }

        return rows;
      }

      const rows = parseCsv(text);

      if (rows.length < 2) {
        setContactsError(
          "The CSV file is empty or has no contact records."
        );
        return;
      }

      const headers = rows[0].map((header) =>
        header.toLowerCase().trim()
      );

      const getIndex = (header: string) =>
        headers.indexOf(header);

      const nameIndex = getIndex("name");
      const designationIndex = getIndex("designation");
      const emailIndex = getIndex("email");
      const contactIndex = getIndex("contact #");
      const companyIndex = getIndex("company");
      const industryIndex = getIndex("industry");
      const statusIndex = getIndex("status");
      const remarksIndex = getIndex("remarks");

      if (emailIndex === -1) {
        setContactsError(
          "Your CSV file must contain a column named Email."
        );
        return;
      }

      const parsedContacts: CsvContact[] = rows
        .slice(1)
        .map((values) => {
          const rawStatus =
            statusIndex === -1
              ? ""
              : (values[statusIndex] || "")
                  .toLowerCase()
                  .trim();

          let outreachStatus: CsvContact["outreach_status"] =
            "Not yet emailed";

          if (rawStatus === "emailed") {
            outreachStatus = "Emailed";
          } else if (
            rawStatus === "replied back" ||
            rawStatus === "replied"
          ) {
            outreachStatus = "Replied back";
          }

          return {
            full_name:
              nameIndex === -1 ? "" : values[nameIndex] || "",
            designation:
              designationIndex === -1
                ? ""
                : values[designationIndex] || "",
            email:
              values[emailIndex]?.toLowerCase().trim() || "",
            contact_number:
              contactIndex === -1
                ? ""
                : values[contactIndex] || "",
            company:
              companyIndex === -1
                ? ""
                : values[companyIndex] || "",
            industry:
              industryIndex === -1
                ? ""
                : values[industryIndex] || "",
            outreach_status: outreachStatus,
            remarks:
              remarksIndex === -1
                ? ""
                : values[remarksIndex] || "",
          };
        })
        .filter((contact) => contact.email !== "");

      if (parsedContacts.length === 0) {
        setContactsError(
          "No contacts with email addresses were found."
        );
        return;
      }

      setCsvPreview(parsedContacts);
    } catch {
      setContactsError(
        "Unable to read this CSV file. Please check its format."
      );
    }
  }

  // Import contacts after permission confirmation.
  async function handleImportCsv() {
    if (csvPreview.length === 0) {
      setContactsError("Please upload a CSV file first.");
      return;
    }

    if (!csvPermissionConfirmed) {
      setContactsError(
        "Please confirm that these contacts have permission to receive marketing emails."
      );
      return;
    }

    setImportingCsv(true);
    setContactsError("");
    setCsvImportResult("");

    try {
      const supabase = createClient();

      const {
        data: { user: currentUser },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !currentUser) {
        throw new Error(
          "Your session has expired. Please log in again."
        );
      }

      const { data: existingContacts, error: existingError } =
        await supabase
          .from("contacts")
          .select("email");

      if (existingError) {
        throw new Error(existingError.message);
      }

      const seenEmails = new Set(
        (existingContacts || []).map((contact) =>
          contact.email.toLowerCase().trim()
        )
      );

      const contactsToImport = [];
      let duplicateCount = 0;
      let invalidCount = 0;

      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      for (const contact of csvPreview) {
        const email = contact.email.toLowerCase().trim();

        if (!emailPattern.test(email)) {
          invalidCount++;
          continue;
        }

        if (seenEmails.has(email)) {
          duplicateCount++;
          continue;
        }

        seenEmails.add(email);

        contactsToImport.push({
          user_id: currentUser.id,
          full_name: contact.full_name.trim() || null,
          designation: contact.designation.trim() || null,
          email,
          contact_number:
            contact.contact_number.trim() || null,
          company: contact.company.trim() || null,
          industry: contact.industry.trim() || null,
          outreach_status: contact.outreach_status,
          remarks: contact.remarks.trim() || null,
          status: "subscribed" as const,
          consent_source:
            "CSV import - permission confirmed",
          consented_at: new Date().toISOString(),
        });
      }

      if (contactsToImport.length === 0) {
        setCsvImportResult(
          `No contacts imported. ${duplicateCount} duplicate(s) skipped and ${invalidCount} invalid email(s) rejected.`
        );
        return;
      }

      const { error: insertError } = await supabase
        .from("contacts")
        .insert(contactsToImport);

      if (insertError) {
        throw new Error(insertError.message);
      }

      await loadContacts();

      setCsvImportResult(
        `Successfully imported ${contactsToImport.length} contact(s). ${duplicateCount} duplicate(s) skipped and ${invalidCount} invalid email(s) rejected.`
      );

      setCsvPreview([]);
      setCsvFile(null);
      setCsvPermissionConfirmed(false);
    } catch (error) {
      setContactsError(
        error instanceof Error
          ? error.message
          : "Unable to import contacts. Please try again."
      );
    } finally {
      setImportingCsv(false);
    }
  }

  // Change a contact's subscription status.
  async function handleUpdateContactStatus(
    contactId: string,
    nextStatus: Contact["status"]
  ) {
    setContactsError("");

    const supabase = createClient();

    const updateData: {
      status: Contact["status"];
      consent_source?: string;
      consented_at?: string;
      unsubscribed_at?: string | null;
    } = {
      status: nextStatus,
    };

    if (nextStatus === "subscribed") {
      updateData.consent_source =
        "User-confirmed permission";
      updateData.consented_at = new Date().toISOString();
      updateData.unsubscribed_at = null;
    } else if (nextStatus === "unsubscribed") {
      updateData.unsubscribed_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from("contacts")
      .update(updateData)
      .eq("id", contactId);

    if (error) {
      setContactsError(error.message);
      return;
    }

    await loadContacts();
  }

  const filteredCampaigns = campaigns.filter((campaign) =>
    campaign.name.toLowerCase().includes(search.toLowerCase())
  );

  const totalCampaigns = campaigns.length;
  const sentCampaigns = campaigns.filter(
    (campaign) => campaign.status === "sent"
  ).length;
  const draftCampaigns = campaigns.filter(
    (campaign) => campaign.status === "draft"
  ).length;
  const failedCampaigns = campaigns.filter(
    (campaign) => campaign.status === "failed"
  ).length;

  return (
    <>
      <section className="w-full" id="overview">
        <header className="dashboard-header">
          <div>
            <p className="breadcrumb">
              Workspace / {activeView}
            </p>

            <h1>
              {activeView === "Contacts"
                ? "Contacts"
                : "Dashboard"}
            </h1>
          </div>

{activeView === "Overview" && (
  <Link
    href="/dashboard/campaigns/new"
    className="create-btn"
  >
    + Create campaign
  </Link>
)}
        </header>

        {activeView === "Contacts" ? (
          <section id="contacts">
            <div className="section-heading">
              <div>
                <h2>Manage your contacts</h2>
                <p>
                  View and manage your saved email contacts.
                </p>
              </div>

              <button
                type="button"
                className="create-btn"
                onClick={() => {
                  setContactsError("");
                  setShowContactForm(true);
                }}
              >
                + Add Contact
              </button>
            </div>

            {contactsError && (
              <div className="dashboard-notice" role="alert">
                {contactsError}
              </div>
            )}

            {/* CSV Upload */}
            <section
              className="campaign-section"
              style={{ marginBottom: "24px" }}
            >
              <div className="campaign-heading">
                <div>
                  <h2>Import Contacts</h2>
                  <p>
                    Upload a CSV file to preview multiple
                    contacts at once.
                  </p>
                </div>
              </div>

              <div style={{ marginTop: "16px" }}>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;

                    setCsvFile(file);
                    setCsvPreview([]);
                    setCsvImportResult("");
                    setCsvPermissionConfirmed(false);
                    setContactsError("");

                    if (file) {
                      handleCsvUpload(file);
                    }
                  }}
                />

                {csvFile && (
                  <p
                    style={{
                      marginTop: "12px",
                      fontSize: "13px",
                    }}
                  >
                    Selected file: <strong>{csvFile.name}</strong>
                  </p>
                )}
              </div>
            </section>

            {csvImportResult && (
              <div className="dashboard-notice" role="status">
                {csvImportResult}
              </div>
            )}

            {/* CSV Preview */}
            {csvPreview.length > 0 && (
              <section
                className="campaign-section"
                style={{ marginBottom: "24px" }}
              >
                <div className="campaign-heading">
                  <div>
                    <h2>CSV Contact Preview</h2>
                    <p>
                      {csvPreview.length} contact(s) detected.
                      Review the information before importing.
                    </p>
                  </div>
                </div>

                <div
                  className="campaign-table-wrap"
                  style={{ overflowX: "auto" }}
                >
                  <table className="campaign-table">
                    <thead>
                      <tr>
                        <th>NAME</th>
                        <th>DESIGNATION</th>
                        <th>EMAIL</th>
                        <th>CONTACT #</th>
                        <th>COMPANY</th>
                        <th>INDUSTRY</th>
                        <th>STATUS</th>
                        <th>REMARKS</th>
                      </tr>
                    </thead>

                    <tbody>
                      {csvPreview.map((contact, index) => (
                        <tr
                          key={`${contact.email}-${index}`}
                        >
                          <td>{contact.full_name || "—"}</td>
                          <td>{contact.designation || "—"}</td>
                          <td>{contact.email}</td>
                          <td>
                            {contact.contact_number || "—"}
                          </td>
                          <td>{contact.company || "—"}</td>
                          <td>{contact.industry || "—"}</td>
                          <td>{contact.outreach_status}</td>
                          <td>{contact.remarks || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <label
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "10px",
                    marginTop: "18px",
                    fontSize: "13px",
                    lineHeight: "1.5",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={csvPermissionConfirmed}
                    onChange={(e) =>
                      setCsvPermissionConfirmed(e.target.checked)
                    }
                    style={{ marginTop: "3px" }}
                  />

                  <span>
                    I confirm that these contacts have given
                    permission to receive marketing emails from
                    us.
                  </span>
                </label>

                <div
                  className="modal-actions"
                  style={{ marginTop: "20px" }}
                >
                  <button
                    type="button"
                    className="cancel-btn"
                    onClick={() => {
                      setCsvPreview([]);
                      setCsvFile(null);
                      setCsvImportResult("");
                      setCsvPermissionConfirmed(false);
                      setContactsError("");
                    }}
                    disabled={importingCsv}
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    className="create-btn"
                    onClick={handleImportCsv}
                    disabled={
                      importingCsv ||
                      csvPreview.length === 0 ||
                      !csvPermissionConfirmed
                    }
                  >
                    {importingCsv
                      ? "Importing..."
                      : "Import Contacts"}
                  </button>
                </div>
              </section>
            )}

            {/* Contact statistics */}
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-top">Total contacts</div>
                <strong className="stat-number">
                  {contacts.length}
                </strong>
              </div>

              <div className="stat-card">
                <div className="stat-top">Subscribed</div>
                <strong className="stat-number">
                  {
                    contacts.filter(
                      (contact) =>
                        contact.status === "subscribed"
                    ).length
                  }
                </strong>
              </div>

              <div className="stat-card">
                <div className="stat-top">Pending</div>
                <strong className="stat-number">
                  {
                    contacts.filter(
                      (contact) =>
                        contact.status === "pending"
                    ).length
                  }
                </strong>
              </div>

              <div className="stat-card">
                <div className="stat-top">Unsubscribed</div>
                <strong className="stat-number">
                  {
                    contacts.filter(
                      (contact) =>
                        contact.status === "unsubscribed"
                    ).length
                  }
                </strong>
              </div>
            </div>

            {/* All contacts */}
            <section className="campaign-section">
              <div className="campaign-heading">
                <div>
                  <h2>All contacts</h2>
                  <p>
                    Your saved contacts from Supabase.
                  </p>
                </div>
              </div>

              {contactsLoading ? (
                <p className="empty-state">
                  Loading contacts...
                </p>
              ) : contacts.length === 0 ? (
                <p className="empty-state">
                  No contacts yet. Click Add Contact to get
                  started.
                </p>
              ) : (
                <div className="campaign-table-wrap">
                  <table className="campaign-table">
                    <thead>
                      <tr>
                        <th>NAME</th>
                        <th>EMAIL</th>
                        <th>COMPANY</th>
                        <th>STATUS</th>
                      </tr>
                    </thead>

                    <tbody>
                      {contacts.map((contact) => (
                        <tr key={contact.id}>
                          <td>
                            {contact.full_name || "—"}
                          </td>
                          <td>{contact.email}</td>
                          <td>{contact.company || "—"}</td>
                          <td>
                            <select
                              value={contact.status}
                              onChange={(e) =>
                                handleUpdateContactStatus(
                                  contact.id,
                                  e.target.value as Contact["status"]
                                )
                              }
                              aria-label={`Subscription status for ${contact.email}`}
                              className={`status-badge status-${contact.status}`}
                              style={{
                                border: "1px solid #e5e7eb",
                                cursor: "pointer",
                                textTransform: "capitalize",
                              }}
                            >
                              <option value="pending">
                                Pending
                              </option>
                              <option value="subscribed">
                                Subscribed
                              </option>
                              <option value="unsubscribed">
                                Unsubscribed
                              </option>
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </section>
        ) : (
          <>
            {/* Dashboard welcome */}
            <div className="welcome-banner">
              <div>
                <span className="welcome-label">
                  YOUR WORKSPACE
                </span>

                <h2>Welcome back, {user.name}! 👋</h2>

                <p>
                  Here's what's happening with your email
                  campaigns.
                </p>
              </div>

              <div className="welcome-art">✉</div>
            </div>

            <div className="section-heading">
              <div>
                <h2>Campaign overview</h2>
                <p>
                  Here's your actual campaign summary.
                </p>
              </div>
            </div>

            {/* Real campaign statistics */}
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-top">
                  Total campaigns
                </div>
                <strong className="stat-number">
                  {campaignsLoading ? "—" : totalCampaigns}
                </strong>
                <p>All saved campaigns</p>
              </div>

              <div className="stat-card">
                <div className="stat-top">
                  Sent campaigns
                </div>
                <strong className="stat-number">
                  {campaignsLoading ? "—" : sentCampaigns}
                </strong>
                <p>Campaigns marked as sent</p>
              </div>

              <div className="stat-card">
                <div className="stat-top">
                  Draft campaigns
                </div>
                <strong className="stat-number">
                  {campaignsLoading ? "—" : draftCampaigns}
                </strong>
                <p>Campaigns awaiting sending</p>
              </div>

              <div className="stat-card">
                <div className="stat-top">
                  Failed campaigns
                </div>
                <strong className="stat-number">
                  {campaignsLoading ? "—" : failedCampaigns}
                </strong>
                <p>Campaigns that failed</p>
              </div>
            </div>

            {/* Recent campaigns */}
            <section
              className="campaign-section"
              id="campaigns"
            >
              <div className="campaign-heading">
                <div>
                  <h2>Recent campaigns</h2>
                  <p>
                    Keep track of your email activities.
                  </p>
                </div>

                <input
                  className="campaign-search"
                  type="search"
                  placeholder="Search campaigns..."
                  aria-label="Search campaigns"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className="campaign-table-wrap">
                <table className="campaign-table">
                  <thead>
                    <tr>
                      <th>CAMPAIGN NAME</th>
                      <th>DATE</th>
                      <th>RECIPIENTS</th>
                      <th>STATUS</th>
                    </tr>
                  </thead>

                  <tbody>
                    {campaignsLoading ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="empty-state"
                        >
                          Loading campaigns...
                        </td>
                      </tr>
                    ) : campaignsError ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="empty-state"
                        >
                          Unable to load campaigns:{" "}
                          {campaignsError}
                        </td>
                      </tr>
                    ) : filteredCampaigns.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="empty-state"
                        >
                          No campaigns found.
                        </td>
                      </tr>
                    ) : (
                      filteredCampaigns.map((campaign) => (
                        <tr key={campaign.id}>
                          <td>
                            <Link
                              href={`/dashboard/campaigns/${campaign.id}`}
                              className="campaign-name"
                              style={{
                                color: "inherit",
                                textDecoration: "none",
                              }}
                            >
                              <span className="campaign-mail">
                                ✉
                              </span>
                              <strong>{campaign.name}</strong>
                            </Link>
                          </td>

                          <td>
                            {new Date(
                              campaign.created_at
                            ).toLocaleDateString()}
                          </td>

                          <td>
                            {campaign.recipient_contact_ids
                              ?.length ?? 0}
                          </td>

                          <td>
                            <span
                              className={`status-badge status-${campaign.status}`}
                            >
                              {campaign.status
                                .charAt(0)
                                .toUpperCase() +
                                campaign.status.slice(1)}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="table-footer">
                Showing {filteredCampaigns.length} of{" "}
                {campaigns.length} campaigns
              </div>
            </section>

            <footer className="dashboard-footer">
              EmailBlast · Campaign management made simple
            </footer>
          </>
        )}
      </section>

      {/* Add Contact Modal */}
      {showContactForm && (
        <div
          className="modal-overlay"
          onClick={() => setShowContactForm(false)}
        >
          <section
            className="create-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="contact-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-heading">
              <h2 id="contact-title">Add Contact</h2>

              <button
                type="button"
                className="modal-close"
                onClick={() => setShowContactForm(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <p>
              Add a contact to your EmailBlast contact list.
            </p>

            <form onSubmit={handleAddContact}>
              <label htmlFor="contactName">
                Full name
              </label>

              <input
                id="contactName"
                value={contactName}
                onChange={(e) =>
                  setContactName(e.target.value)
                }
                placeholder="e.g. John Doe"
              />

              <label htmlFor="contactEmail">
                Email address
              </label>

              <input
                id="contactEmail"
                type="email"
                value={contactEmail}
                onChange={(e) =>
                  setContactEmail(e.target.value)
                }
                placeholder="e.g. john@example.com"
                required
              />

              <label htmlFor="contactCompany">
                Company
              </label>

              <input
                id="contactCompany"
                value={contactCompany}
                onChange={(e) =>
                  setContactCompany(e.target.value)
                }
                placeholder="e.g. ABC Company"
              />

              {contactsError && (
                <p
                  role="alert"
                  style={{
                    color: "#ff8b8b",
                    fontSize: "12px",
                  }}
                >
                  {contactsError}
                </p>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  className="cancel-btn"
                  onClick={() => setShowContactForm(false)}
                >
                  Cancel
                </button>

                <button
                  className="create-btn"
                  type="submit"
                  disabled={savingContact}
                >
                  {savingContact
                    ? "Saving..."
                    : "Save Contact"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
