
"use client";

import { useState } from "react";
import Link from "next/link";

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

export default function DashboardPage() {
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [campaignName, setCampaignName] = useState("");
  const [notice, setNotice] = useState("");

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
                  : item.name === "Campaigns"
                  ? "#campaigns"
                  : "#"
              }
              onClick={(e) => {
                if (
                  item.name !== "Overview" &&
                  item.name !== "Campaigns"
                ) {
                  e.preventDefault();
                  setNotice(`${item.name} UI is coming soon.`);
                }
              }}
              className={`nav-item ${
                item.active ? "nav-active" : ""
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
            <div className="avatar">JD</div>
            <div className="user-info">
              <strong>John Doe</strong>
              <span>Demo Account</span>
            </div>
            <span className="user-menu">⋯</span>
          </div>
        </div>
      </aside>

      <section className="dashboard-main" id="overview">
        <header className="dashboard-header">
          <div>
            <p className="breadcrumb">Workspace / Overview</p>
            <h1>Dashboard</h1>
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

        {notice && (
          <div className="dashboard-notice" role="status">
            {notice}
            <button onClick={() => setNotice("")}>Dismiss</button>
          </div>
        )}

        <div className="welcome-banner">
          <div>
            <span className="welcome-label">YOUR WORKSPACE</span>
            <h2>Welcome back, John! 👋</h2>
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
      </section>

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
