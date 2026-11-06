
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const campaigns = [
  {
    name: "Welcome Email Campaign",
    date: "Nov 02, 2026",
    sent: "1,250",
    status: "Completed",
  },
  {
    name: "November Newsletter",
    date: "Nov 03, 2026",
    sent: "850",
    status: "Completed",
  },
  {
    name: "Product Announcement",
    date: "Nov 04, 2026",
    sent: "0",
    status: "Draft",
  },
  {
    name: "Customer Updates",
    date: "Nov 04, 2026",
    sent: "2,400",
    status: "Scheduled",
  },
];

const menuItems = [
  { name: "Overview", icon: "▦", active: true },
  { name: "Campaigns", icon: "✉" },
  { name: "Contacts", icon: "♙" },
  { name: "Analytics", icon: "▥" },
  { name: "Settings", icon: "⚙" },
];

type Contact = {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string;
  company: string | null;
  status: "pending" | "subscribed" | "unsubscribed";
  consent_source: string | null;
  consented_at: string | null;
  unsubscribed_at: string | null;
  created_at: string;
  updated_at: string;
};

type DashboardClientProps = {
  user: {
    name: string;
    email: string;
  };
};

export default function DashboardClient({ user }: DashboardClientProps) {
    const router = useRouter();

    const initials =
    user.name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("") || "U";

  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [campaignName, setCampaignName] = useState("");
  const [notice, setNotice] = useState("");

  const [activeView, setActiveView] = useState<"Overview" | "Contacts">("Overview");

    const [contacts, setContacts] = useState<Contact[]>([]);
    const [contactsLoading, setContactsLoading] = useState(false);
    const [contactsError, setContactsError] = useState("");

    const [showContactForm, setShowContactForm] = useState(false);
    const [contactName, setContactName] = useState("");
    const [contactEmail, setContactEmail] = useState("");
    const [contactCompany, setContactCompany] = useState("");
//    const [contactStatus, setContactStatus] = useState<Contact["status"]>("pending");
    const [savingContact, setSavingContact] = useState(false);

async function loadContacts() {
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
    setContacts(data as Contact[]);
  }

  setContactsLoading(false);
}

async function handleAddContact(e: React.FormEvent<HTMLFormElement>) {
  e.preventDefault();

  setSavingContact(true);
  setContactsError("");

  const supabase = createClient();

  const {
    data: { user: currentUser },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !currentUser) {
    setContactsError("Your session has expired. Please log in again.");
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

useEffect(() => {
  if (activeView === "Contacts") {
    loadContacts();
  }
}, [activeView]);

  async function handleLogout() {
  const supabase = createClient();

  const { error } = await supabase.auth.signOut();

  if (error) {
    setNotice("Unable to log out. Please try again.");
    return;
  }

  router.replace("/");
  router.refresh();
}

  const filteredCampaigns = campaigns.filter((campaign) =>
    campaign.name.toLowerCase().includes(search.toLowerCase())
  );

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setShowCreate(false);
    setNotice(
      `Demo only: "${campaignName}" is a sample campaign idea. It was not saved.`
    );
    setCampaignName("");
  }

  return (
    <main className="dashboard-layout">
      <aside className="dashboard-sidebar">
        <Link href="/" className="dashboard-brand">
          <span className="dashboard-logo">E</span>
          <span>
            Email<span className="brand-highlight">Blast</span>
          </span>
        </Link>

        <p className="sidebar-label">WORKSPACE</p>

        <nav className="dashboard-nav">
          {menuItems.map((item) => (
            <a
              key={item.name}
              href={
                item.name === "Overview"
                    ? "#overview"
                    : item.name === "Contacts"
                    ? "#contacts"
                    : item.name === "Campaigns"
                    ? "#campaigns"
                    : "#"
                }
              onClick={(e) => {
                e.preventDefault();

                if (item.name === "Overview") {
                    setActiveView("Overview");
                    setNotice("");
                } else if (item.name === "Contacts") {
                    setActiveView("Contacts");
                    setNotice("");
                } else {
                    setNotice(`${item.name} UI is coming soon.`);
                }
            }}
              className={`nav-item ${
                (
                    (item.name === "Overview" && activeView === "Overview") ||
                    (item.name === "Contacts" && activeView === "Contacts")
                )
                    ? "nav-active"
                    : ""
              }`}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.name}
            </a>
          ))}
        </nav>


<div className="sidebar-bottom">
  <div className="sidebar-help">
    <div className="help-icon">✦</div>
    <strong>Need help?</strong>
    <p>Manage your campaigns with ease.</p>
  </div>

  <div className="sidebar-user">
    <div className="avatar">{initials}</div>

    <div className="user-info">
      <strong>{user.name}</strong>
      <span>{user.email}</span>
    </div>

    <button
      type="button"
      className="user-menu"
      onClick={handleLogout}
      title="Log out"
      aria-label="Log out"
    >
      ↪
    </button>
  </div>
</div>

      </aside>

      <section className="dashboard-main" id="overview">
        <header className="dashboard-header">
          <div>
            <p className="breadcrumb">Workspace / {activeView}
            </p>
            <h1>{activeView === "Contacts" ? "Contacts" : "Dashboard"}</h1>
          </div>
          <button
            className="create-btn"
            onClick={() => {
              setNotice("");
              setShowCreate(true);
            }}
          >
            + Create campaign
          </button>
        </header>
        
{activeView === "Contacts" ? (
  <section id="contacts">
    <div className="section-heading">
      <div>
        <h2>Manage your contacts</h2>
        <p>View and manage your saved email contacts.</p>
      </div>

      <button
        className="create-btn"
        onClick={() => {
          setContactsError("");
          setShowContactForm(true);
        }}
      >
        + Add Contact
      </button>
    </div>

    <div className="stats-grid">
      <div className="stat-card">
        <div className="stat-top">Total contacts</div>
        <strong className="stat-number">{contacts.length}</strong>
      </div>

      <div className="stat-card">
        <div className="stat-top">Subscribed</div>
        <strong className="stat-number">
          {contacts.filter((c) => c.status === "subscribed").length}
        </strong>
      </div>

      <div className="stat-card">
        <div className="stat-top">Pending</div>
        <strong className="stat-number">
          {contacts.filter((c) => c.status === "pending").length}
        </strong>
      </div>

      <div className="stat-card">
        <div className="stat-top">Unsubscribed</div>
        <strong className="stat-number">
          {contacts.filter((c) => c.status === "unsubscribed").length}
        </strong>
      </div>
    </div>

    {contactsError && (
      <div className="dashboard-notice" role="alert">
        {contactsError}
      </div>
    )}

    <section className="campaign-section">
      <div className="campaign-heading">
        <div>
          <h2>All contacts</h2>
          <p>Your saved contacts from Supabase.</p>
        </div>
      </div>

      {contactsLoading ? (
        <p className="empty-state">Loading contacts...</p>
      ) : contacts.length === 0 ? (
        <p className="empty-state">
          No contacts yet. Click Add Contact to get started.
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
                  <td>{contact.full_name || "—"}</td>
                  <td>{contact.email}</td>
                  <td>{contact.company || "—"}</td>
                  <td>
                    <span className={`status-badge status-${contact.status}`}>
                      {contact.status}
                    </span>
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

        {notice && (
          <div className="dashboard-notice" role="status">
            {notice}
            <button onClick={() => setNotice("")}>Dismiss</button>
          </div>
        )}

        <div className="welcome-banner">
          <div>
            <span className="welcome-label">YOUR WORKSPACE</span>
            <h2>Welcome back, {user.name}! 👋</h2>
            <p>
              Here's what's happening with your email campaigns.
            </p>
          </div>
          <div className="welcome-art">✉</div>
        </div>

        <div className="section-heading">
          <div>
            <h2>Campaign overview</h2>
            <p>Here's your campaign summary.</p>
          </div>
          <span className="demo-badge">SAMPLE DATA</span>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-top">
              <span>Total campaigns</span>
              <span className="stat-icon purple">✉</span>
            </div>
            <strong className="stat-number">24</strong>
            <p>All campaign drafts and sends</p>
          </div>

          <div className="stat-card">
            <div className="stat-top">
              <span>Emails sent</span>
              <span className="stat-icon blue">↗</span>
            </div>
            <strong className="stat-number">12,840</strong>
            <p>Total sample sends</p>
          </div>

          <div className="stat-card">
            <div className="stat-top">
              <span>Delivery rate</span>
              <span className="stat-icon green">✓</span>
            </div>
            <strong className="stat-number">98.5%</strong>
            <p>Sample delivery metric</p>
          </div>

          <div className="stat-card">
            <div className="stat-top">
              <span>Open rate</span>
              <span className="stat-icon orange">◎</span>
            </div>
            <strong className="stat-number">42.8%</strong>
            <p>Sample engagement metric</p>
          </div>
        </div>

        <section className="campaign-section" id="campaigns">
          <div className="campaign-heading">
            <div>
              <h2>Recent campaigns</h2>
              <p>Keep track of your email activities.</p>
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
                  <th>EMAILS SENT</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {filteredCampaigns.map((campaign) => (
                  <tr key={campaign.name}>
                    <td>
                      <div className="campaign-name">
                        <span className="campaign-mail">✉</span>
                        <strong>{campaign.name}</strong>
                      </div>
                    </td>
                    <td>{campaign.date}</td>
                    <td>{campaign.sent}</td>
                    <td>
                      <span
                        className={`status-badge status-${campaign.status.toLowerCase()}`}
                      >
                        {campaign.status}
                      </span>
                    </td>
                  </tr>
                ))}

                {filteredCampaigns.length === 0 && (
                  <tr>
                    <td colSpan={4} className="empty-state">
                      No matching campaigns found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="table-footer">
            Showing {filteredCampaigns.length} of {campaigns.length} sample
            campaigns
          </div>
        </section>

       <footer className="dashboard-footer">
            EmailBlast · Campaign management made simple
        </footer>
        </>
        )}
    </section>

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

      <p>Add a contact to your EmailBlast contact list.</p>

      <form onSubmit={handleAddContact}>
        <label htmlFor="contactName">Full name</label>
        <input
          id="contactName"
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
          placeholder="e.g. John Doe"
        />

        <label htmlFor="contactEmail">Email address</label>
        <input
          id="contactEmail"
          type="email"
          value={contactEmail}
          onChange={(e) => setContactEmail(e.target.value)}
          placeholder="e.g. john@example.com"
          required
        />

        <label htmlFor="contactCompany">Company</label>
        <input
          id="contactCompany"
          value={contactCompany}
          onChange={(e) => setContactCompany(e.target.value)}
          placeholder="e.g. ABC Company"
        />

        {contactsError && (
          <p role="alert" style={{ color: "#ff8b8b", fontSize: "12px" }}>
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
            {savingContact ? "Saving..." : "Save Contact"}
          </button>
        </div>
      </form>
    </section>
  </div>
)}

      {showCreate && (
        <div
          className="modal-overlay"
          onClick={() => setShowCreate(false)}
        >
          <section
            className="create-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-heading">
              <h2 id="create-title">Create campaign</h2>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowCreate(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <p>Start by giving your campaign a name.</p>

            <form onSubmit={handleCreate}>
              <label htmlFor="campaignName">Campaign name</label>
              <input
                id="campaignName"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="e.g. November Newsletter"
                required
              />

              <div className="modal-actions">
                <button
                  type="button"
                  className="cancel-btn"
                  onClick={() => setShowCreate(false)}
                >
                  Cancel
                </button>
                <button className="create-btn" type="submit">
                  Continue
                </button>
              </div>
            </form>
            <small>
              Demo interaction only. No campaign will be saved or sent.
            </small>
          </section>
        </div>
      )}
    </main>
  );
}
