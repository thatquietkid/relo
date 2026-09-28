const listings = [
  { id: 'home-1', category: 'Housing', title: '2BHK near Koramangala', description: 'Furnished homes with a shorter first-month commute.', meta: '1.8 km from office', freshness: 'Updated 2 days ago', tag: 'Housing' },
  { id: 'move-1', category: 'Moving', title: 'Example Movers', description: 'A moving team familiar with corporate transfers.', meta: 'Responds within 1 day', freshness: 'Verified this month', tag: 'Moving' },
  { id: 'essentials-1', category: 'Essentials', title: 'Bangalore starter guide', description: 'The useful local details you want before landing.', meta: '12 practical guides', freshness: 'Updated 1 week ago', tag: 'City guide' },
  { id: 'home-2', category: 'Housing', title: 'Homes near Indiranagar', description: 'Quiet, connected neighbourhoods with flexible leases.', meta: '4.2 km from office', freshness: 'Updated 4 days ago', tag: 'Housing' },
  { id: 'move-2', category: 'Moving', title: 'MoveRight concierge', description: 'Packing, storage, and settling-in help in one request.', meta: 'Background checked', freshness: 'Verified last week', tag: 'Moving' },
  { id: 'essentials-2', category: 'Essentials', title: 'First-week essentials', description: 'A compact list for internet, groceries, and local travel.', meta: '9 practical guides', freshness: 'Updated 3 days ago', tag: 'City guide' }
];

const state = {
  auth: { loggedIn: false, user: null, token: null, refreshToken: '', error: '', email: '', otpEmail: '', otpStep: 'request' },
  oauth: { authorizationId: '', details: null, loading: false, error: '', decisionBusy: false },
  growth: null,
  adminEvents: [],
  adminInvite: { error: '', notice: '', busy: false },
  adminFilter: { category: '', severity: '' },
  role: 'employee',
  view: 'home',
  filter: 'All',
  search: '',
  saved: new Set(['home-1']),
  checklist: [
    { id: 'date', group: 'Before you move', title: 'Confirm your move date', detail: 'Your employer needs this to shape your timeline.', status: 'required', done: true },
    { id: 'area', group: 'Before you move', title: 'Choose a preferred office area', detail: 'We use this to make commute guidance more relevant.', status: 'recommended', done: true },
    { id: 'housing', group: 'Before you move', title: 'Compare housing options', detail: 'Save a few options to make your first conversations easier.', status: 'recommended', done: false },
    { id: 'moving', group: 'Before you move', title: 'Request a moving-service call', detail: 'Optional · a vetted provider can contact you.', status: 'optional', done: false },
    { id: 'essentials', group: 'After you arrive', title: 'Set up local essentials', detail: 'Available once your move date is confirmed.', status: 'locked', done: false }
  ],
  requests: [
    { id: 'REQ-1048', title: 'Example Movers', note: 'Contact request shared with name and move date.', status: 'Acknowledged', time: 'Yesterday' }
  ],
  modal: null,
  toast: ''
};

const app = document.querySelector('#app');
const API_BASE_URL = window.RELO_CONFIG?.apiBaseUrl || 'http://127.0.0.1:4100';

function isOAuthConsentRoute() {
  return window.location.pathname === '/oauth/consent' || window.location.pathname === '//oauth/consent';
}

function oauthClientConfigured() {
  return Boolean(window.ReloOAuth);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function progress() {
  const finished = state.checklist.filter((item) => item.done).length;
  return Math.round((finished / state.checklist.length) * 100);
}

function navItems() {
  return state.role === 'employee'
    ? [
        ['home', '⌂', 'Home'], ['checklist', '✓', 'My checklist'], ['explore', '⌕', 'Explore'],
        ['saved', '♡', 'Saved'], ['requests', '↗', 'Requests'], ['profile', '○', 'Profile']
      ]
    : state.role === 'admin'
      ? [
          ['events', '◉', 'Major events'], ['people', '◎', 'People'], ['organizations', '◎', 'Organizations'], ['security', '⌁', 'Security'],
          ['settings', '⚙', 'Settings']
        ]
    : [
        ['dashboard', '⌂', 'Overview'], ['employees', '◎', 'Employees'], ['programs', '▦', 'Programs'],
        ['content', '✦', 'Content'], ['reports', '▤', 'Reports'], ['settings', '⚙', 'Settings']
      ];
}

function initials(user) {
  return (user?.name || 'Relo').split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

function renderLogin() {
  const verifying = state.auth.otpStep === 'verify';
  const oauthLogin = isOAuthConsentRoute();
  app.innerHTML = `
    <main class="login-shell">
      <section class="login-story">
        <div class="brand login-brand"><span class="brand-mark">r</span><span class="brand-name">relo</span></div>
        <div class="story-intro"><span class="eyebrow">Employer-backed relocation</span><span class="story-location">Bengaluru · 2026</span></div>
        <div class="story-count"><strong>18</strong><span>days until move-in</span></div>
        <h1>Make the new city feel less like a checklist.</h1>
        <p class="login-copy">A quieter way to prepare for a move — one useful step, trusted local support, and a little more certainty at a time.</p>
        <div class="story-route" aria-label="The Relo relocation path">
          <div class="route-line"></div>
          <div class="route-stop is-done"><span>01</span><strong>Prepare</strong><small>Get oriented</small></div>
          <div class="route-stop is-active"><span>02</span><strong>Settle</strong><small>Choose what fits</small></div>
          <div class="route-stop"><span>03</span><strong>Arrive</strong><small>Start feeling local</small></div>
        </div>
        <p class="story-note">Designed for the people moving — and the teams helping them get there.</p>
      </section>
      <section class="login-card">
        <div class="login-panel-heading"><span class="eyebrow">${verifying ? 'Check your inbox' : oauthLogin ? 'Authorize an application' : 'Welcome back'}</span><span class="secure-note"><span class="secure-dot"></span>Passwordless access</span></div>
        <h2>${verifying ? 'Enter your sign-in code.' : oauthLogin ? 'Sign in to continue.' : 'Pick up where you left off.'}</h2>
        <p class="login-panel-copy">${verifying ? `We sent a six-digit code to <strong>${escapeHtml(state.auth.otpEmail)}</strong>.` : oauthLogin ? 'Sign in to review the application, requested permissions, and redirect destination before continuing.' : 'Sign in with your work email. Relo will send a one-time code through your company SMTP setup.'}</p>
        <form id="otp-form" class="login-form">
          ${verifying ? `<div class="field"><label for="otp-code">One-time code</label><input id="otp-code" class="otp-code-input" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required placeholder="000000" /></div>` : `<div class="field"><label for="login-email">Work email</label><input id="login-email" type="email" autocomplete="email" required placeholder="you@company.com" value="${escapeHtml(state.auth.email || '')}" /></div>`}
          ${state.auth.error ? `<div class="login-error" role="alert">${escapeHtml(state.auth.error)}</div>` : ''}
          <button class="button button-dark login-submit" type="submit"><span>${verifying ? 'Verify code' : 'Send sign-in code'}</span><span class="button-arrow">↗</span></button>
        </form>
        ${verifying ? `<button class="otp-back" data-otp-reset>Use a different email</button>` : ''}
        <div class="login-divider"><span>${verifying ? 'Code not arriving?' : 'Configured access'}</span></div>
        <p class="login-footnote">Only provisioned accounts can request a code. Admin and HR access is managed directly through the database; employee access is issued by an administrator.</p>
      </section>
    </main>`;
}

function renderShell() {
  const currentLabel = navItems().find(([id]) => id === state.view)?.[2] || (state.role === 'employee' ? 'Home' : state.role === 'admin' ? 'Major events' : 'Overview');
  const user = state.auth.user;
  app.innerHTML = `
    <aside class="sidebar">
      <div class="brand"><span class="brand-mark">r</span><span class="brand-name">relo</span></div>
      <div class="role-badge">${state.role === 'employee' ? 'Employee workspace' : state.role === 'admin' ? 'Admin workspace' : 'HR workspace'}</div>
      <div class="nav-label">Workspace</div>
      <nav class="nav-list" aria-label="Primary navigation">
        ${navItems().map(([id, icon, label]) => `<button class="nav-item ${state.view === id ? 'active' : ''}" data-nav="${id}" onclick="window.handleNav('${id}')"><span class="nav-icon">${icon}</span>${label}</button>`).join('')}
      </nav>
      <div class="sidebar-bottom">
        <div class="trust-note"><strong>Why Relo?</strong>One place for the next right step, with people and places your company can stand behind.</div>
        <div class="profile-chip"><span class="avatar">${initials(user)}</span><div><strong>${escapeHtml(user?.name || 'Relo user')}</strong><small>${escapeHtml(user?.email || '')}</small></div></div>
      </div>
    </aside>
    <main class="main">
      <header class="topbar"><div><div class="eyebrow">${state.role === 'employee' ? 'Your relocation' : state.role === 'admin' ? 'Platform control plane' : 'Mobility workspace'}</div><div class="topbar-title">${currentLabel}</div></div><div class="topbar-actions"><button class="icon-button" aria-label="Open notifications">♢</button><button class="icon-button" aria-label="Open help">?</button><span class="avatar">${initials(user)}</span><button class="button button-quiet button-small" data-logout onclick="window.logoutRelo()">Sign out</button></div></header>
      <section class="content">${state.role === 'employee' ? renderEmployee() : state.role === 'admin' ? renderAdmin() : renderHr()} </section>
    </main>
    <nav class="mobile-nav" aria-label="Mobile navigation">
      ${navItems().slice(0, 5).map(([id, icon, label]) => `<button class="mobile-nav-item ${state.view === id ? 'active' : ''}" data-nav="${id}"><span>${icon}</span><small>${label}</small></button>`).join('')}
    </nav>
    ${renderModal()}
    ${state.toast ? `<div class="toast" role="status">${escapeHtml(state.toast)}</div>` : ''}
  `;
}

function renderEmployee() {
  const views = {
    home: renderEmployeeHome,
    checklist: renderChecklist,
    explore: renderExplore,
    saved: renderSaved,
    requests: renderRequests,
    profile: renderProfile
  };
  return (views[state.view] || renderEmployeeHome)();
}

function renderEmployeeHome() {
  const pct = progress();
  return `
    <div class="page-heading home-heading"><div><div class="eyebrow">Bangalore · move in 18 days</div><h1>One clear line from here to home.</h1></div><p>Your company has given you one place to get ready. Start with the next useful thing, and we’ll keep the rest close.</p></div>
    <div class="dashboard-grid">
      <div class="stack">
        <section class="panel progress-panel panel-pad journey-panel"><div class="journey-panel-top"><div><div class="eyebrow">Your relocation at a glance</div><h2>You’re further along than it feels.</h2></div><div class="journey-date"><strong>12</strong><span>Oct<br>move day</span></div></div><div class="journey-path"><span class="journey-node complete">✓</span><span class="journey-segment complete"></span><span class="journey-node complete">✓</span><span class="journey-segment"></span><span class="journey-node">3</span><span class="journey-segment"></span><span class="journey-node">4</span></div><div class="journey-labels"><span>Plan</span><span>Prepare</span><span>Settle</span><span>Arrive</span></div><div class="progress-meta"><div><div class="progress-number">${pct}%</div><div class="progress-label">of your important steps are ready</div></div><a class="button button-primary button-small" href="#" data-nav="checklist">Open checklist</a></div><div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div><div class="progress-footer"><span>${state.checklist.filter((item) => item.done).length} of ${state.checklist.length} steps complete</span><span>Relo starter programme</span></div></section>
        <section class="next-action"><div><div class="eyebrow">Next best action</div><h3>Compare a few housing options</h3><p>We’ll use your saved options to make the first conversation easier.</p></div><button class="button button-dark" data-nav="explore">Continue</button></section>
        <section class="panel panel-pad"><div class="panel-heading"><div><h2>Recommended for you</h2><p>Based on your office area and commute preference.</p></div><button class="text-link" data-nav="explore">Explore all</button></div><div class="recommendations">${recommendationCards()}</div></section>
      </div>
      <aside class="stack"><section class="panel panel-pad"><div class="panel-heading"><div><h3>Recent movement</h3><p>Small steps count.</p></div></div><div class="activity-list"><div class="activity-item"><span class="activity-icon">✓</span><div><strong>Office area added</strong><span>Koramangala · Bengaluru</span></div><span class="activity-time">Today</span></div><div class="activity-item"><span class="activity-icon">✦</span><div><strong>New guide unlocked</strong><span>First week essentials</span></div><span class="activity-time">Yesterday</span></div><div class="activity-item"><span class="activity-icon">↗</span><div><strong>Request acknowledged</strong><span>Example Movers</span></div><span class="activity-time">2d ago</span></div></div></section><section class="panel panel-pad"><div class="panel-heading"><div><h3>Need a hand?</h3><p>Relo support is here when the list gets noisy.</p></div></div><button class="button button-quiet" data-toast="Support request noted — we’ll route it to your mobility team.">Ask for help</button></section></aside>
    </div>
  `;
}

function recommendationCards() {
  return listings.slice(0, 3).map((item, index) => `<article class="recommendation"><div class="recommendation-art"><span class="art-mark"></span><span class="verified">Verified</span></div><h3>${item.title}</h3><p>${item.description}</p><div class="recommendation-footer"><span>${item.meta}</span><button class="text-link" data-open-listing="${item.id}">View</button></div></article>`).join('');
}

function renderChecklist() {
  const groups = [...new Set(state.checklist.map((item) => item.group))];
  return `<div class="page-heading"><div><div class="eyebrow">One step at a time</div><h1>My checklist</h1></div><p>Required steps keep your move on track. Recommended steps make the landing softer; optional steps are always yours to choose.</p></div><section class="panel panel-pad"><div class="panel-heading"><div><h2>Your move plan</h2><p>${state.checklist.filter((item) => item.done).length} of ${state.checklist.length} steps complete</p></div><span class="badge active">${progress()}% ready</span></div><div class="checklist">${groups.map((group) => `<div class="checklist-section">${group}</div>${state.checklist.filter((item) => item.group === group).map(checklistItem).join('')}`).join('')}</div></section>`;
}

function checklistItem(item) {
  const statusLabel = item.done ? 'Complete' : item.status === 'locked' ? 'Locked' : item.status.charAt(0).toUpperCase() + item.status.slice(1);
  return `<div class="check-item"><button class="check-box ${item.done ? 'done' : ''}" data-complete="${item.id}" aria-label="${item.done ? 'Mark incomplete' : 'Complete'}: ${escapeHtml(item.title)}">${item.done ? '✓' : ''}</button><div class="check-copy"><strong>${item.title}</strong><span>${item.detail}</span></div><span class="check-status ${item.done ? 'complete' : item.status === 'recommended' ? 'recommended' : ''}">${statusLabel}</span></div>`;
}

function renderExplore() {
  const categories = ['All', 'Housing', 'Moving', 'Essentials'];
  const visible = listings.filter((item) => (state.filter === 'All' || item.category === state.filter) && [item.title, item.description, item.category].join(' ').toLowerCase().includes(state.search.toLowerCase()));
  return `<div class="page-heading"><div><div class="eyebrow">Trusted in Bangalore</div><h1>Explore your new city.</h1></div><p>Every result has a source, a verification date, and a clear reason it may be useful to you.</p></div><section class="panel panel-pad"><div class="explore-tools"><div class="filter-row">${categories.map((category) => `<button class="filter ${state.filter === category ? 'active' : ''}" data-filter="${category}">${category}</button>`).join('')}</div><label class="search-box" aria-label="Search directory"><span>⌕</span><input id="directory-search" type="search" placeholder="Search the directory" value="${escapeHtml(state.search)}" /></label></div>${visible.length ? `<div class="explore-grid">${visible.map(listingCard).join('')}</div>` : `<div class="empty-state"><div class="empty-mark">⌕</div><h2>No close matches yet</h2><p>Try a broader search or choose another category. We’re keeping this list human-sized on purpose.</p><button class="button button-quiet" data-clear-search>Clear search</button></div>`}</section>`;
}

function listingCard(item) {
  const saved = state.saved.has(item.id);
  return `<article class="listing-card"><div class="listing-visual"><div class="${item.category === 'Housing' ? 'visual-building' : 'visual-tree'}"></div></div><div class="listing-content"><span class="verified">Verified</span><h3>${item.title}</h3><p>${item.description}</p><div class="listing-meta"><span>${item.meta}</span><span>${item.freshness}</span></div><div class="listing-actions"><button class="button button-dark button-small" data-request="${item.id}">Request contact</button><button class="save-button ${saved ? 'saved' : ''}" data-save="${item.id}" aria-label="${saved ? 'Remove from saved' : 'Save'} ${escapeHtml(item.title)}">${saved ? '♥' : '♡'}</button></div></div></article>`;
}

function renderSaved() {
  const items = listings.filter((item) => state.saved.has(item.id));
  return `<div class="page-heading"><div><div class="eyebrow">Your private shortlist</div><h1>Saved for later.</h1></div><p>Only you can see these options. Share them when you’re ready, or keep comparing quietly.</p></div><section class="panel panel-pad">${items.length ? `<div class="explore-grid">${items.map(listingCard).join('')}</div>` : `<div class="empty-state"><div class="empty-mark">♡</div><h2>Your shortlist is waiting</h2><p>Save a housing or service option from Explore and it will appear here.</p><button class="button button-primary" data-nav="explore">Explore options</button></div>`}</section>`;
}

function renderRequests() {
  return `<div class="page-heading"><div><div class="eyebrow">Help that follows through</div><h1>Your requests.</h1></div><p>See what’s been shared, what happens next, and how to pause a request at any time.</p></div><section class="panel panel-pad"><div class="panel-heading"><div><h2>Open and recent</h2><p>${state.requests.length} request${state.requests.length === 1 ? '' : 's'} in your workspace</p></div></div>${state.requests.length ? state.requests.map((request) => `<div class="request-card"><span class="request-dot ${request.status === 'Resolved' ? 'resolved' : ''}"></span><div><h3>${request.title}</h3><p>${request.note}</p><span class="request-status">${request.id} · ${request.time}</span></div><span class="badge ${request.status === 'Acknowledged' ? 'active' : ''}">${request.status}</span></div>`).join('') : `<div class="empty-state"><div class="empty-mark">↗</div><h2>Nothing open</h2><p>When you ask for help, we’ll keep its next step visible here.</p><button class="button button-quiet" data-nav="explore">Find a provider</button></div>`}</section>`;
}

function renderProfile() {
  return `<div class="page-heading"><div><div class="eyebrow">Your details, your choice</div><h1>Profile and privacy.</h1></div><p>Relo uses the minimum information needed to personalize your move. You choose what leaves this workspace.</p></div><div class="dashboard-grid"><section class="panel panel-pad"><div class="panel-heading"><div><h2>Relocation profile</h2><p>Last updated today</p></div><button class="button button-quiet button-small" data-toast="Profile editing will be connected to the Relocation Case service.">Edit</button></div><div class="checklist"><div class="check-item"><div class="activity-icon">⌂</div><div class="check-copy"><strong>Moving from Pune to Bangalore</strong><span>Target move date · 12 October 2026</span></div></div><div class="check-item"><div class="activity-icon">⌖</div><div class="check-copy"><strong>Office area · Koramangala</strong><span>Commute preference · Short commute</span></div></div><div class="check-item"><div class="activity-icon">◌</div><div class="check-copy"><strong>Household · Just me</strong><span>Used only to make relevant recommendations</span></div></div></div></section><section class="panel panel-pad"><div class="panel-heading"><div><h3>Sharing choices</h3><p>For requests you make</p></div></div><div class="consent"><input type="checkbox" checked aria-label="Share basic contact details"><span>Name and preferred contact method can be shared when I explicitly request provider contact.</span></div><button class="button button-quiet" data-toast="Your sharing choices were saved in this prototype.">Save choices</button></section></div>`;
}

function renderHr() {
  const views = { dashboard: renderHrDashboard, employees: renderHrEmployees, programs: renderHrPrograms, content: renderHrContent, reports: renderHrReports, settings: renderHrSettings };
  return (views[state.view] || renderHrDashboard)();
}

function renderHrDashboard() {
  return `<div class="page-heading hr-heading"><div><div class="eyebrow">Mobility programme · Q4</div><h1>See the whole programme, at a glance.</h1></div><div><p>Understand who is moving, where support is needed, and which moments are creating momentum.</p></div></div><div class="stat-row"><div class="stat"><strong>42</strong><span>Active relocations</span><span class="trend">↑ 8% this month</span></div><div class="stat"><strong>8</strong><span>Invitations pending</span><span class="trend">3 need a nudge</span></div><div class="stat"><strong>71%</strong><span>Average progress</span><span class="trend">↑ 4 pts this month</span></div></div>${renderAarrr()}<div class="dashboard-grid" style="margin-top:22px"><section class="panel panel-pad"><div class="panel-heading"><div><h2>Recent employees</h2><p>Operational view · private notes stay private</p></div><button class="text-link" data-nav="employees">View all employees</button></div>${employeeTable()}</section><aside class="stack"><section class="panel panel-pad"><div class="panel-heading"><div><h3>Needs attention</h3><p>Small interventions, earlier.</p></div></div><div class="attention-list"><div class="attention"><span class="attention-mark"></span><div><strong>3 invitations are still unopened</strong><p>Send a gentle reminder before their start date.</p></div></div><div class="attention"><span class="attention-mark"></span><div><strong>5 requests await acknowledgement</strong><p>Example Movers and four others need a response.</p></div></div></div></section><section class="panel panel-pad"><div class="panel-heading"><div><h3>Programme pulse</h3><p>Relo starter programme</p></div></div><div class="progress-track"><div class="progress-fill" style="width:71%; background:var(--mint-deep)"></div></div><div class="progress-footer" style="color:var(--ink-soft)"><span>71% complete</span><span>42 cases</span></div></section></aside></div>`;
}

const defaultAarrr = {
  acquisition: { label: 'Acquisition', value: '80%', detail: 'Invite acceptance', trend: '+9 pts' },
  activation: { label: 'Activation', value: '12d', detail: 'Time to first action', trend: '-2 days' },
  retention: { label: 'Retention', value: '71%', detail: 'Active case progress', trend: '+4 pts' },
  referral: { label: 'Referral', value: '27', detail: 'Helpful feedback responses', trend: '+6 this month' },
  revenue: { label: 'Revenue', value: '₹75k', detail: 'Average allowance managed', trend: '42 cases' }
};

function renderAarrr() {
  const metrics = state.growth || defaultAarrr;
  return `<section class="panel panel-pad growth-panel"><div class="panel-heading"><div><div class="eyebrow">High-priority business loop</div><h2>AARRR growth signals</h2><p>Aggregate programme health, kept separate from private employee notes.</p></div><span class="badge active">Live read model</span></div><div class="aarrr-grid">${Object.values(metrics).map((metric) => `<article class="aarrr-card"><span class="aarrr-label">${escapeHtml(metric.label)}</span><strong>${escapeHtml(metric.value)}</strong><span>${escapeHtml(metric.detail)}</span><em>${escapeHtml(metric.trend)}</em></article>`).join('')}</div></section>`;
}

function employeeTable() {
  const employees = [['Rohan Verma', 'Bangalore', '12 Oct', 62, 'Active'], ['Aisha Khan', 'Hyderabad', '03 Nov', 18, 'Active'], ['Vikram Shah', 'Bangalore', '21 Oct', 84, 'Active'], ['Meera Iyer', 'Pune', '29 Oct', 0, 'Pending']];
  return `<div class="table-wrap"><table><thead><tr><th>Employee</th><th>Destination</th><th>Move date</th><th>Progress</th><th>Status</th></tr></thead><tbody>${employees.map(([name, city, date, value, status]) => `<tr><td><strong>${name}</strong><span>${name === 'Rohan Verma' ? 'Senior Analyst' : 'Programme member'}</span></td><td>${city}</td><td>${date}</td><td><div class="mini-progress"><div class="mini-progress-track"><div class="mini-progress-fill" style="width:${value}%"></div></div><span>${value}%</span></div></td><td><span class="badge ${status === 'Pending' ? 'pending' : 'active'}">${status}</span></td></tr>`).join('')}</tbody></table></div>`;
}

function renderHrEmployees() { return `<div class="page-heading"><div><div class="eyebrow">People in motion</div><h1>Employees.</h1></div><p>Progress, dates, and the next operational step — without opening private employee notes.</p></div><section class="panel panel-pad"><div class="panel-heading"><div><h2>All relocations</h2><p>42 active · 8 pending</p></div><button class="button button-quiet button-small" data-toast="Export queued with tenant-scoped audit logging.">Export report</button></div>${employeeTable()}</section>`; }
function renderHrPrograms() { return `<div class="page-heading"><div><div class="eyebrow">Reusable operating rhythm</div><h1>Programmes.</h1></div><p>Versioned checklists and allowances help every employee receive the same thoughtful start.</p></div><div class="dashboard-grid"><section class="panel panel-pad"><div class="panel-heading"><div><h2>Relo starter programme</h2><p>Active · 42 employees · Updated 01 Sep 2026</p></div><span class="badge active">Published</span></div><div class="checklist"><div class="check-item"><div class="activity-icon">✓</div><div class="check-copy"><strong>Confirm move date</strong><span>Required · before you move</span></div><span class="check-status complete">Required</span></div><div class="check-item"><div class="activity-icon">✓</div><div class="check-copy"><strong>Choose office area</strong><span>Recommended · before you move</span></div><span class="check-status recommended">Recommended</span></div><div class="check-item"><div class="activity-icon">↗</div><div class="check-copy"><strong>Request moving support</strong><span>Optional · before you move</span></div><span class="check-status">Optional</span></div></div></section><section class="panel panel-pad"><div class="panel-heading"><div><h3>Allowance</h3><p>Shared with each employee on invite</p></div></div><div class="stat"><strong>₹75,000</strong><span>Default relocation allowance</span><span class="trend">Version 3 · active</span></div></section></div>`; }
function renderHrContent() { return `<div class="page-heading"><div><div class="eyebrow">Trust is a workflow</div><h1>Content review.</h1></div><p>Keep local recommendations useful, current, and honest about what Relo can stand behind.</p></div><section class="panel panel-pad"><div class="panel-heading"><div><h2>Review queue</h2><p>4 items need a reviewer · 28 published items</p></div><button class="button button-quiet button-small" data-toast="Content import is represented locally in this prototype.">Import source</button></div><div class="attention-list"><div class="attention"><span class="attention-mark" style="background:var(--sun)"></span><div><strong>Neighborhood guide · Indiranagar</strong><p>Freshness check due in 2 days · source: mobility team</p></div><span class="badge pending">Review</span></div><div class="attention"><span class="attention-mark" style="background:var(--sun)"></span><div><strong>MoveRight concierge</strong><p>Verification evidence updated · reviewer needed</p></div><span class="badge pending">Review</span></div><div class="attention"><span class="attention-mark" style="background:var(--mint-deep)"></span><div><strong>Example Movers</strong><p>Verified this month · published</p></div><span class="badge active">Published</span></div></div></section>`; }
function renderHrReports() { return `<div class="page-heading"><div><div class="eyebrow">Signals, not surveillance</div><h1>Reports.</h1></div><p>Understand whether relocation support is helping people get settled, without turning the workspace into a monitoring tool.</p></div><div class="stat-row"><div class="stat"><strong>12d</strong><span>Average time to first action</span><span class="trend">↓ 2 days this quarter</span></div><div class="stat"><strong>86%</strong><span>Invitation acceptance</span><span class="trend">↑ 9 pts this quarter</span></div><div class="stat"><strong>4.7/5</strong><span>Employee helpfulness score</span><span class="trend">Based on 27 responses</span></div></div><section class="panel panel-pad" style="margin-top:22px"><div class="panel-heading"><div><h2>What employees use</h2><p>Aggregate activity · last 30 days</p></div></div><div class="checklist"><div class="check-item"><div class="activity-icon">⌂</div><div class="check-copy"><strong>Housing recommendations</strong><span>Most visited content category</span></div><strong>68%</strong></div><div class="check-item"><div class="activity-icon">↗</div><div class="check-copy"><strong>Moving-service requests</strong><span>Requests that received acknowledgement</span></div><strong>92%</strong></div><div class="check-item"><div class="activity-icon">✓</div><div class="check-copy"><strong>Checklist completion</strong><span>Employees completing at least one step</span></div><strong>81%</strong></div></div></section>`; }
function renderHrSettings() { return `<div class="page-heading"><div><div class="eyebrow">Control the defaults</div><h1>Settings.</h1></div><p>Manage programme defaults and access. Employee privacy stays the default, not a preference someone has to discover.</p></div><section class="panel panel-pad"><div class="panel-heading"><div><h2>Workspace settings</h2><p>Relo starter programme</p></div></div><div class="checklist"><div class="check-item"><div class="activity-icon">◌</div><div class="check-copy"><strong>Employee notes</strong><span>Private by default · HR sees operational statuses only</span></div><span class="badge active">On</span></div><div class="check-item"><div class="activity-icon">♢</div><div class="check-copy"><strong>Reminder cadence</strong><span>One nudge at 7 days, one at 2 days</span></div><button class="button button-quiet button-small" data-toast="Reminder settings are represented in the prototype.">Edit</button></div><div class="check-item"><div class="activity-icon">⌁</div><div class="check-copy"><strong>Single sign-on</strong><span>Managed by your identity provider</span></div><span class="badge active">Connected</span></div></div></section>`; }

function renderAdmin() {
  const views = { events: renderAdminEvents, people: renderAdminPeople, organizations: renderAdminOrganizations, security: renderAdminSecurity, settings: renderAdminSettings };
  return (views[state.view] || renderAdminEvents)();
}

function renderAdminPeople() {
  const invite = state.adminInvite;
  return `<div class="page-heading"><div><div class="eyebrow">Provisioned access · admin only</div><h1>People.</h1></div><p>Invite employees from the control plane. Admin and HR roles are intentionally managed through the database, never through this portal.</p></div><section class="panel panel-pad"><div class="panel-heading"><div><h2>Invite an employee</h2><p>The employee will receive an email invitation and can then use passwordless OTP access.</p></div><span class="badge active">Employee only</span></div><form id="admin-invite-form" class="form-grid"><div class="field"><label for="admin-invite-name">Employee name</label><input id="admin-invite-name" required placeholder="e.g. Rohan Verma" /></div><div class="field"><label for="admin-invite-email">Work email</label><input id="admin-invite-email" type="email" required placeholder="name@company.com" /></div>${invite.error ? `<div class="login-error" role="alert">${escapeHtml(invite.error)}</div>` : ''}${invite.notice ? `<div class="form-notice" role="status">${escapeHtml(invite.notice)}</div>` : ''}<div><button class="button button-primary" type="submit" ${invite.busy ? 'disabled' : ''}>${invite.busy ? 'Sending invitation…' : 'Send employee invitation'} <span class="button-arrow">↗</span></button></div></form></section><section class="panel panel-pad"><div class="panel-heading"><div><h2>Role policy</h2><p>Elevated access stays outside the portal.</p></div></div><div class="checklist"><div class="check-item"><div class="activity-icon">◎</div><div class="check-copy"><strong>Employee</strong><span>Invite from this dashboard; role is fixed server-side.</span></div><span class="badge active">Available</span></div><div class="check-item"><div class="activity-icon">⌁</div><div class="check-copy"><strong>HR and admin</strong><span>Add and promote through the Supabase database workflow.</span></div><span class="badge pending">DB only</span></div></div></section>`;
}

function adminEventTime(value) {
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function renderAdminEvents() {
  const events = state.adminEvents;
  const critical = events.filter((event) => event.severity === 'critical').length;
  const warning = events.filter((event) => event.severity === 'warning').length;
  const categories = ['all', 'auth', 'relocation', 'content', 'growth', 'system'];
  return `<div class="page-heading admin-heading"><div><div class="eyebrow">Platform control plane · live feed</div><h1>Major events, without the noise.</h1></div><div><p>One operational view for the moments that can affect trust, access, and programme health across Relo.</p><button class="button button-primary" data-toast="Event ingestion is append-only and tenant-scoped.">Event policy</button></div></div><div class="admin-signal-row"><div class="admin-signal admin-signal-critical"><strong>${critical}</strong><span>Critical in view</span><small>Needs an owner</small></div><div class="admin-signal admin-signal-warning"><strong>${warning}</strong><span>Warnings in view</span><small>Worth a follow-up</small></div><div class="admin-signal admin-signal-live"><strong>${events.length}</strong><span>Events loaded</span><small>Latest first · max 100</small></div></div><section class="panel panel-pad admin-events-panel"><div class="panel-heading"><div><div class="eyebrow">Event stream</div><h2>What changed recently</h2><p>Only administrators can read this cross-tenant operational feed.</p></div><span class="badge active">Admin only</span></div><div class="event-filters">${categories.map((category) => `<button class="filter ${state.adminFilter.category === (category === 'all' ? '' : category) ? 'active' : ''}" data-admin-filter="${category}">${category === 'all' ? 'All events' : category}</button>`).join('')}</div><div class="event-list">${events.length ? events.map((event) => `<article class="event-row severity-${escapeHtml(event.severity)}"><div class="event-marker"><span></span></div><div class="event-copy"><div class="event-meta"><span class="event-category">${escapeHtml(event.category)}</span><span>${adminEventTime(event.occurredAt)}</span></div><h3>${escapeHtml(event.summary)}</h3><p>${escapeHtml(event.eventName.replaceAll('_', ' '))}</p></div><span class="event-severity">${escapeHtml(event.severity)}</span></article>`).join('') : `<div class="empty-state"><div class="empty-mark">◉</div><h2>No events match</h2><p>Try another category or wait for the next operational signal.</p></div>`}</div></section>`;
}

function renderAdminOrganizations() {
  return `<div class="page-heading"><div><div class="eyebrow">Tenant boundaries</div><h1>Organizations.</h1></div><p>Keep customer workspaces isolated while giving the platform team a clear operational inventory.</p></div><section class="panel panel-pad"><div class="panel-heading"><div><h2>Organization registry</h2><p>Organization management will be connected to the control-plane service.</p></div><span class="badge active">Admin only</span></div><div class="empty-state"><div class="empty-mark">◎</div><h2>Registry surface ready</h2><p>The admin event feed is live first. Organization actions remain intentionally read-only in this prototype.</p></div></section>`;
}

function renderAdminSecurity() {
  return `<div class="page-heading"><div><div class="eyebrow">Access and trust</div><h1>Security signals.</h1></div><p>Review the authentication and authorization events that deserve a human owner.</p></div><section class="panel panel-pad"><div class="panel-heading"><div><h2>Authentication posture</h2><p>OTP delivery, role boundaries, and deployment health</p></div><span class="badge active">Protected</span></div><div class="checklist"><div class="check-item"><div class="activity-icon">⌁</div><div class="check-copy"><strong>Email OTP</strong><span>Provisioned users only · Supabase SMTP</span></div><span class="badge active">Enabled</span></div><div class="check-item"><div class="activity-icon">◎</div><div class="check-copy"><strong>Admin event access</strong><span>RLS policy restricts reads to the admin role</span></div><span class="badge active">Enforced</span></div></div></section>`;
}

function renderAdminSettings() {
  return `<div class="page-heading"><div><div class="eyebrow">Platform defaults</div><h1>Admin settings.</h1></div><p>Deployment-owned configuration stays outside the client and is supplied through Render and Supabase.</p></div><section class="panel panel-pad"><div class="panel-heading"><div><h2>Current boundaries</h2><p>Safe defaults for the prototype</p></div></div><div class="checklist"><div class="check-item"><div class="activity-icon">✦</div><div class="check-copy"><strong>SMTP credentials</strong><span>Configured in the deployment portal</span></div><span class="badge pending">Pending</span></div><div class="check-item"><div class="activity-icon">⌁</div><div class="check-copy"><strong>Event retention</strong><span>Append-only events with indexed timestamps</span></div><span class="badge active">Ready</span></div></div></section>`;
}

function renderModal() {
  if (state.modal?.type === 'request') {
    const item = listings.find((listing) => listing.id === state.modal.listingId);
    return `<div class="modal-backdrop" data-close-modal><div class="modal" role="dialog" aria-modal="true" aria-labelledby="request-title" onclick="event.stopPropagation()"><div class="modal-header"><div><h2 id="request-title">Request help from ${item.title}</h2><p>You choose exactly what leaves your Relo workspace.</p></div><button class="close-button" aria-label="Close" data-close-modal>×</button></div><form id="request-form"><div class="form-grid"><div class="field"><label for="request-message">What would make this useful?</label><textarea id="request-message" placeholder="I’m looking for..."></textarea></div><label class="consent"><input id="request-consent" type="checkbox" required><span>I consent to share my name, preferred contact method, destination city, and target move date with this provider for this request.</span></label></div><div class="modal-actions"><button class="button button-quiet" type="button" data-close-modal>Cancel</button><button class="button button-dark" type="submit">Send request</button></div></form></div></div>`;
  }
  if (state.modal?.type === 'listing') {
    const item = listings.find((listing) => listing.id === state.modal.listingId);
    return `<div class="modal-backdrop" data-close-modal><div class="modal" role="dialog" aria-modal="true" aria-labelledby="listing-title" onclick="event.stopPropagation()"><div class="modal-header"><div><span class="verified">Verified</span><h2 id="listing-title">${item.title}</h2><p>${item.description}</p></div><button class="close-button" aria-label="Close" data-close-modal>×</button></div><div class="consent"><span><strong>Why this is here:</strong> ${item.meta}. ${item.freshness}. The listing is curated for your employer programme and does not guarantee an outcome.</span></div><div class="modal-actions"><button class="button button-quiet" data-save="${item.id}">${state.saved.has(item.id) ? 'Remove from saved' : 'Save for later'}</button><button class="button button-dark" data-request="${item.id}">Request contact</button></div></div></div>`;
  }
  return '';
}

function renderOAuthConsent() {
  const oauth = state.oauth;
  if (oauth.loading) {
    return `<main class="oauth-shell"><section class="oauth-card"><div class="brand oauth-brand"><span class="brand-mark">r</span><span class="brand-name">relo</span></div><span class="eyebrow">Secure authorization</span><h1>Checking the request.</h1><p class="oauth-muted">We’re validating the connected application and its requested access.</p><div class="oauth-loader" aria-label="Loading"></div></section></main>`;
  }
  if (oauth.error || !oauth.details) {
    return `<main class="oauth-shell"><section class="oauth-card"><div class="brand oauth-brand"><span class="brand-mark">r</span><span class="brand-name">relo</span></div><span class="eyebrow">Authorization unavailable</span><h1>We couldn’t load this request.</h1><div class="login-error" role="alert">${escapeHtml(oauth.error || 'The authorization request is incomplete or expired.')}</div><button class="button button-dark" data-oauth-back>Return to Relo</button></section></main>`;
  }
  const { clientName, clientUri, redirectUri, scopes } = oauth.details;
  return `<main class="oauth-shell"><section class="oauth-card" aria-labelledby="oauth-title"><div class="brand oauth-brand"><span class="brand-mark">r</span><span class="brand-name">relo</span></div><span class="eyebrow">Connected application</span><h1 id="oauth-title">Allow ${escapeHtml(clientName)} to connect?</h1><p class="oauth-muted">You’re signed in as <strong>${escapeHtml(state.auth.user?.email || '')}</strong>. Review the details before continuing.</p><div class="oauth-client"><span class="oauth-client-mark">${escapeHtml(clientName.slice(0, 1).toUpperCase())}</span><div><strong>${escapeHtml(clientName)}</strong>${clientUri ? `<a href="${escapeHtml(clientUri)}" target="_blank" rel="noreferrer">${escapeHtml(clientUri)}</a>` : '<span>Connected through Relo</span>'}</div></div><div class="oauth-section"><span class="eyebrow">It will return you to</span><code>${escapeHtml(redirectUri || 'The registered callback URL')}</code></div><div class="oauth-section"><span class="eyebrow">Requested access</span><ul class="oauth-scope-list">${(scopes.length ? scopes : ['basic account identity']).map((scope) => `<li><span>✓</span>${escapeHtml(scope)}</li>`).join('')}</ul></div>${oauth.error ? `<div class="login-error" role="alert">${escapeHtml(oauth.error)}</div>` : ''}<div class="oauth-actions"><button class="button button-quiet oauth-deny" data-oauth-decision="deny" ${oauth.decisionBusy ? 'disabled' : ''}>Deny</button><button class="button button-dark" data-oauth-decision="approve" ${oauth.decisionBusy ? 'disabled' : ''}>${oauth.decisionBusy ? 'Processing…' : 'Approve access'} <span class="button-arrow">↗</span></button></div><p class="oauth-note">Relo uses Supabase OAuth Server to issue the authorization code. Your password and one-time codes are never shared with this application.</p></section></main>`;
}

function navigate(view) {
  state.view = view;
  state.modal = null;
  render();
}

function showToast(message) {
  state.toast = message;
  render();
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => { state.toast = ''; render(); }, 2600);
}

function persistSession() {
  if (state.auth.loggedIn) {
    sessionStorage.setItem('reloSession', JSON.stringify({ user: state.auth.user, token: state.auth.token, refreshToken: state.auth.refreshToken }));
  } else {
    sessionStorage.removeItem('reloSession');
  }
}

function setSession(user, token, refreshToken = '') {
  state.auth = { loggedIn: true, user, token, refreshToken, error: '', email: '', otpEmail: '', otpStep: 'request' };
  state.role = user.role === 'employee' ? 'employee' : user.role === 'admin' ? 'admin' : 'hr';
  state.view = state.role === 'employee' ? 'home' : state.role === 'admin' ? 'events' : 'dashboard';
  state.growth = null;
  state.adminEvents = [];
  state.oauth = { authorizationId: '', details: null, loading: false, error: '', decisionBusy: false };
  persistSession();
  render();
  if (state.role === 'hr') loadGrowth();
  if (state.role === 'admin') loadAdminEvents();
  if (isOAuthConsentRoute()) loadOAuthConsent();
}

async function loadOAuthConsent() {
  if (!isOAuthConsentRoute()) return;
  const authorizationId = new URLSearchParams(window.location.search).get('authorization_id') || '';
  state.oauth = { authorizationId, details: null, loading: true, error: '', decisionBusy: false };
  render();
  if (!authorizationId) {
    state.oauth.loading = false;
    state.oauth.error = 'Missing authorization_id. Start the connection again from the requesting application.';
    render();
    return;
  }
  try {
    if (!oauthClientConfigured()) throw new Error('OAuth consent is not configured on this deployment.');
    const response = await fetch(`${API_BASE_URL}/api/oauth/authorization-details?authorization_id=${encodeURIComponent(authorizationId)}`, { headers: { Authorization: `Bearer ${state.auth.token}` } });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Unable to validate the authorization request.');
    const data = payload.authorization;
    if (data?.redirect_url && !data.authorization_id) {
      window.location.assign(data.redirect_url);
      return;
    }
    if (!data?.authorization_id) throw new Error('The authorization request is invalid or expired.');
    state.oauth.details = window.ReloOAuth.normalizeAuthorizationDetails(data);
  } catch (error) {
    state.oauth.error = error.message || 'Unable to validate the authorization request.';
  }
  state.oauth.loading = false;
  render();
}

async function decideOAuth(decision) {
  if (!state.oauth.authorizationId || !oauthClientConfigured()) return;
  state.oauth.decisionBusy = true;
  state.oauth.error = '';
  render();
  try {
    const endpoint = decision === 'approve' ? '/api/oauth/approve' : '/api/oauth/deny';
    const response = await fetch(`${API_BASE_URL}${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.auth.token}` }, body: JSON.stringify({ authorizationId: state.oauth.authorizationId }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Unable to complete the authorization decision.');
    if (!payload.redirectUrl) throw new Error('Supabase did not provide a return URL for this decision.');
    window.location.assign(payload.redirectUrl);
  } catch (error) {
    state.oauth.decisionBusy = false;
    state.oauth.error = error.message || 'Unable to complete the authorization decision.';
    render();
  }
}

async function requestOtp(email) {
  state.auth.error = '';
  state.auth.email = email.trim().toLowerCase();
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/request-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: state.auth.email }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to send a sign-in code');
    state.auth.otpEmail = state.auth.email;
    state.auth.otpStep = 'verify';
    render();
  } catch (error) {
    state.auth.error = error.message === 'Failed to fetch' ? 'The auth service is unavailable. Check the deployment.' : error.message;
    render();
  }
}

async function verifyOtp(token) {
  state.auth.error = '';
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/verify-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: state.auth.otpEmail, token }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to verify the sign-in code');
    setSession(data.user, data.token, data.refreshToken);
  } catch (error) {
    state.auth.error = error.message === 'Failed to fetch' ? 'The auth service is unavailable. Check the deployment.' : error.message;
    render();
  }
}

async function loadGrowth() {
  if (!state.auth.token || state.role !== 'hr') return;
  try {
    const response = await fetch(`${API_BASE_URL}/api/growth/aarrr`, { headers: { Authorization: `Bearer ${state.auth.token}` } });
    if (!response.ok) return;
    const data = await response.json();
    state.growth = data.metrics;
    render();
  } catch {
    // The fixture keeps the HR dashboard useful while the API is offline.
  }
}

async function loadAdminEvents() {
  if (!state.auth.token || state.role !== 'admin') return;
  const query = new URLSearchParams({ limit: '100' });
  if (state.adminFilter.category) query.set('category', state.adminFilter.category);
  if (state.adminFilter.severity) query.set('severity', state.adminFilter.severity);
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/events?${query.toString()}`, { headers: { Authorization: `Bearer ${state.auth.token}` } });
    if (!response.ok) throw new Error('Unable to load admin events');
    const data = await response.json();
    state.adminEvents = data.events || [];
    render();
  } catch (error) {
    state.auth.error = error.message;
    render();
  }
}

async function inviteEmployee(name, email) {
  state.adminInvite = { error: '', notice: '', busy: true };
  render();
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.auth.token}` },
      body: JSON.stringify({ name, email })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to invite employee');
    state.adminInvite = { error: '', notice: `Invitation sent to ${data.user.email}.`, busy: false };
    render();
  } catch (error) {
    state.adminInvite = { error: error.message, notice: '', busy: false };
    render();
  }
}

function logout() {
  if (state.auth.token) {
    fetch(`${API_BASE_URL}/api/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${state.auth.token}` } }).catch(() => {});
  }
  state.auth = { loggedIn: false, user: null, token: null, refreshToken: '', error: '', email: '', otpEmail: '', otpStep: 'request' };
  state.role = 'employee';
  state.view = 'home';
  state.growth = null;
  state.adminEvents = [];
  state.adminInvite = { error: '', notice: '', busy: false };
  state.oauth = { authorizationId: '', details: null, loading: false, error: '', decisionBusy: false };
  persistSession();
  render();
}

function render() {
  if (isOAuthConsentRoute() && state.auth.loggedIn) {
    app.innerHTML = renderOAuthConsent();
    return;
  }
  state.auth.loggedIn ? renderShell() : renderLogin();
}

window.handleNav = (view) => navigate(view);
window.logoutRelo = logout;

app.addEventListener('click', (event) => {
  const oauthDecision = event.target.closest('[data-oauth-decision]')?.dataset.oauthDecision;
  if (oauthDecision) { decideOAuth(oauthDecision); return; }
  if (event.target.closest('[data-oauth-back]')) { window.location.assign('/'); return; }
  if (event.target.closest('[data-otp-reset]')) { state.auth.otpStep = 'request'; state.auth.otpEmail = ''; state.auth.error = ''; render(); return; }
  if (event.target.closest('[data-logout]')) { logout(); return; }
  const role = event.target.closest('[data-role]')?.dataset.role;
  if (role && state.auth.loggedIn) { state.role = role; state.view = role === 'employee' ? 'home' : 'dashboard'; render(); return; }
  const nav = event.target.closest('[data-nav]')?.dataset.nav;
  if (nav) { event.preventDefault(); navigate(nav); return; }
  const filter = event.target.closest('[data-filter]')?.dataset.filter;
  if (filter) { state.filter = filter; render(); return; }
  const adminFilter = event.target.closest('[data-admin-filter]')?.dataset.adminFilter;
  if (adminFilter) { state.adminFilter.category = adminFilter === 'all' ? '' : adminFilter; loadAdminEvents(); return; }
  const complete = event.target.closest('[data-complete]')?.dataset.complete;
  if (complete) { const item = state.checklist.find((entry) => entry.id === complete); if (item && item.status !== 'locked') { item.done = !item.done; showToast(item.done ? 'Checklist step marked complete.' : 'Checklist step reopened.'); } return; }
  const save = event.target.closest('[data-save]')?.dataset.save;
  if (save) { state.saved.has(save) ? state.saved.delete(save) : state.saved.add(save); showToast(state.saved.has(save) ? 'Saved to your private shortlist.' : 'Removed from your shortlist.'); return; }
  const request = event.target.closest('[data-request]')?.dataset.request;
  if (request) { state.modal = { type: 'request', listingId: request }; render(); return; }
  const openListing = event.target.closest('[data-open-listing]')?.dataset.openListing;
  if (openListing) { state.modal = { type: 'listing', listingId: openListing }; render(); return; }
  if (event.target.closest('[data-close-modal]')) { state.modal = null; render(); return; }
  if (event.target.closest('[data-clear-search]')) { state.search = ''; render(); return; }
  const toast = event.target.closest('[data-toast]')?.dataset.toast;
  if (toast) showToast(toast);
});

app.addEventListener('input', (event) => {
  if (event.target.id === 'directory-search') { state.search = event.target.value; render(); const input = document.querySelector('#directory-search'); input?.focus(); input?.setSelectionRange(state.search.length, state.search.length); }
});

app.addEventListener('submit', (event) => {
  if (event.target.id === 'otp-form') {
    event.preventDefault();
    if (state.auth.otpStep === 'verify') {
      verifyOtp(document.querySelector('#otp-code').value);
    } else {
      requestOtp(document.querySelector('#login-email').value);
    }
    return;
  }
  if (event.target.id === 'request-form') {
    event.preventDefault();
    const item = listings.find((listing) => listing.id === state.modal.listingId);
    state.requests.unshift({ id: `REQ-${1050 + state.requests.length}`, title: item.title, note: 'Contact request shared with the consent you selected.', status: 'Submitted', time: 'Just now' });
    state.modal = null;
    state.view = 'requests';
    showToast('Request sent. You can follow its next step in Requests.');
  }
  if (event.target.id === 'admin-invite-form') {
    event.preventDefault();
    inviteEmployee(document.querySelector('#admin-invite-name').value, document.querySelector('#admin-invite-email').value);
  }
});

try {
  const stored = JSON.parse(sessionStorage.getItem('reloSession') || 'null');
  if (stored?.user && stored?.token) setSession(stored.user, stored.token, stored.refreshToken || '');
} catch {
  sessionStorage.removeItem('reloSession');
}

render();
