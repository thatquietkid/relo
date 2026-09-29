const state = {
    role: 'employee',
    currentView: 'home',
    employee: {
        name: 'Alex River',
        progress: 0,
        checklist: [
            { id: 'c1', task: 'Submit passport copy', completed: false },
            { id: 'c2', task: 'Sign relocation agreement', completed: false },
            { id: 'c3', task: 'Select home search preference', completed: false },
            { id: 'c4', task: 'Complete tax residency form', completed: false },
        ],
        savedItems: [],
        requests: []
    },
    directory: [
        { id: 'd1', name: 'Sarah Chen', role: 'Local Relocation Expert', city: 'London', bio: 'Expert in Central London rentals and school districts.', verified: true },
        { id: 'd2', name: 'James Wilson', role: 'Tax Consultant', city: 'London', bio: 'Specialist in UK expatriate tax laws.', verified: true },
        { id: 'd3', name: 'Elena Rodriguez', role: 'Legal Advisor', city: 'London', bio: 'Visa and immigration specialist.', verified: true },
    ],
    hrStats: {
        totalEmployees: 12,
        pendingRequests: 5,
        avgProgress: '64%'
    }
};

const BRAND_LINK = '<a class="brand dashboard-brand" href="/" aria-label="Relo dashboard home"><span class="brand-mark">r</span><span class="brand-name">relo</span></a>';

const views = {
    employee: {
        home: () => {
            const progress = calculateProgress();
            return `
                <div class="progress-container">
                    <h2>Welcome, ${state.employee.name}</h2>
                    <p>Your relocation progress: ${progress}%</p>
                    <div class="progress-bar-bg">
                        <div class="progress-bar-fill" style="width: ${progress}%"></div>
                    </div>
                </div>
                <div class="card">
                    <h3>Next Action</h3>
                    <p>Complete your <strong>${state.employee.checklist.find(c => !c.completed)?.task || 'all tasks!'}</strong></p>
                    <button class="btn btn-primary" onclick="navigate('checklist')">Go to Checklist</button>
                </div>
                <h3>Recommended Experts</h3>
                <div class="grid">
                    ${state.directory.slice(0, 2).map(item => renderDirectoryCard(item)).join('')}
                </div>
            `;
        },
        checklist: () => {
            return `
                <h2>Relocation Checklist</h2>
                <div class="card">
                    ${state.employee.checklist.map(item => `
                        <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem;">
                            <input type="checkbox" ${item.completed ? 'checked' : ''} onchange="toggleChecklist('${item.id}')">
                            <span>${item.task}</span>
                        </div>
                    `).join('')}
                </div>
            `;
        },
        explore: () => {
            return `
                <h2>Expert Directory</h2>
                <div class="grid">
                    ${state.directory.map(item => renderDirectoryCard(item)).join('')}
                </div>
            `;
        },
        saved: () => {
            return `
                <h2>Saved Experts</h2>
                <div class="grid">
                    ${state.employee.savedItems.length ? state.employee.savedItems.map(id => {
                        const item = state.directory.find(d => d.id === id);
                        return renderDirectoryCard(item);
                    }).join('') : '<p>No saved experts yet.</p>'}
                </div>
            `;
        },
        requests: () => {
            return `
                <h2>My Requests</h2>
                <div class="grid">
                    ${state.employee.requests.length ? state.employee.requests.map(req => `
                        <div class="card">
                            <strong>${req.expertName}</strong>
                            <p>Status: ${req.status}</p>
                            <p>Requested: ${req.date}</p>
                        </div>
                    `).join('') : '<p>No requests sent yet.</p>'}
                </div>
            `;
        }
    },
    hr: {
        home: () => {
            return `
                <h2>HR Admin Dashboard</h2>
                <div class="grid" style="grid-template-columns: repeat(3, 1fr); margin-bottom: 2rem;">
                    <div class="card">
                        <h4>Total Employees</h4>
                        <div style="font-size: 2rem; font-weight: bold;">${state.hrStats.totalEmployees}</div>
                    </div>
                    <div class="card">
                        <h4>Pending Requests</h4>
                        <div style="font-size: 2rem; font-weight: bold;">${state.hrStats.pendingRequests}</div>
                    </div>
                    <div class="card">
                        <h4>Avg. Progress</h4>
                        <div style="font-size: 2rem; font-weight: bold;">${state.hrStats.avgProgress}</div>
                    </div>
                </div>
                <h3>Employee Progress</h3>
                <div class="card">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="text-align: left; border-bottom: 1px solid var(--border-color);">
                                <th style="padding: 1rem 0;">Employee</th>
                                <th style="padding: 1rem 0;">Progress</th>
                                <th style="padding: 1rem 0;">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td style="padding: 1rem 0;">${state.employee.name}</td>
                                <td style="padding: 1rem 0;">${calculateProgress()}%</td>
                                <td style="padding: 1rem 0;">Onboarding</td>
                            </tr>
                            <tr>
                                <td style="padding: 1rem 0;">Jordan Lee</td>
                                <td style="padding: 1rem 0;">85%</td>
                                <td style="padding: 1rem 0;">In Flight</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <button class="btn btn-primary" onclick="openInviteModal()">Invite New Employee</button>
            `;
        }
    }
};

function renderDirectoryCard(item) {
    const isSaved = state.employee.savedItems.includes(item.id);
    return `
        <div class="card">
            <div style="display: flex; justify-content: space-between; align-items: start;">
                <strong>${item.name} ${item.verified ? '✅' : ''}</strong>
                <button class="btn btn-outline" style="padding: 2px 8px; font-size: 0.7rem;" onclick="toggleSave('${item.id}')">
                    ${isSaved ? 'Saved' : 'Save'}
                </button>
            </div>
            <p style="color: var(--text-muted); font-size: 0.85rem;">${item.role}</p>
            <p style="font-size: 0.9rem; margin: 0.5rem 0;">${item.bio}</p>
            <button class="btn btn-primary" style="width: 100%;" onclick="openRequestModal('${item.id}')">Request Contact</button>
        </div>
    `;
}

function calculateProgress() {
    const completed = state.employee.checklist.filter(c => c.completed).length;
    return Math.round((completed / state.employee.checklist.length) * 100);
}

function navigate(view) {
    state.currentView = view;
    render();
}

function toggleChecklist(id) {
    const item = state.employee.checklist.find(c => c.id === id);
    if (item) item.completed = !item.completed;
    render();
}

function toggleSave(id) {
    if (state.employee.savedItems.includes(id)) {
        state.employee.savedItems = state.employee.savedItems.filter(i => i !== id);
    } else {
        state.employee.savedItems.push(id);
    }
    render();
}

function openRequestModal(id) {
    const item = state.directory.find(d => d.id === id);
    const modalBody = document.getElementById('modal-body');
    modalBody.innerHTML = `
        <h3>Request Contact: ${item.name}</h3>
        <p style="margin: 1rem 0;">By requesting contact, you agree to share your name, email, and relocation profile with ${item.name} to facilitate your move.</p>
        <p style="font-size: 0.8rem; color: var(--text-muted);">Your data will be handled according to the Relo Privacy Policy.</p>
        <div style="display: flex; justify-content: flex-end; gap: 1rem; margin-top: 1.5rem;">
            <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="submitRequest('${item.id}', '${item.name}')">Confirm & Request</button>
        </div>
    `;
    document.getElementById('modal-container').classList.remove('hidden');
}

function submitRequest(id, name) {
    state.employee.requests.push({
        id: 'req_' + Date.now(),
        expertName: name,
        status: 'Pending',
        date: new Date().toLocaleDateString()
    });
    closeModal();
    render();
}

function openInviteModal() {
    const modalBody = document.getElementById('modal-body');
    modalBody.innerHTML = `
        <h3>Invite Employee</h3>
        <div style="margin: 1rem 0;">
            <label style="display: block; margin-bottom: 0.5rem;">Email Address</label>
            <input type="email" id="invite-email" style="width: 100%; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 4px;">
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 1rem; margin-top: 1.5rem;">
            <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="confirmInvite()">Send Invitation</button>
        </div>
    `;
    document.getElementById('modal-container').classList.remove('hidden');
}

function confirmInvite() {
    alert('Invitation sent successfully!');
    closeModal();
}

function closeModal() {
    document.getElementById('modal-container').classList.add('hidden');
}

function render() {
    const content = document.getElementById('app-content');
    const nav = document.getElementById('app-nav');
    const roleSelect = document.getElementById('role-select');
    
    roleSelect.value = state.role;

    if (state.role === 'employee') {
        const navItems = [
            { id: 'home', label: 'Home', icon: '🏠' },
            { id: 'checklist', label: 'Checklist', icon: '✅' },
            { id: 'explore', label: 'Explore', icon: '🔍' },
            { id: 'saved', label: 'Saved', icon: '⭐' },
            { id: 'requests', label: 'Requests', icon: '📨' },
        ];
        
        nav.innerHTML = navItems.map(item => `
            <button class="nav-item ${state.currentView === item.id ? 'active' : ''}" onclick="navigate('${item.id}')">
                <span>${item.icon}</span>
                <span>${item.label}</span>
            </button>
        `).join('');
        
        content.innerHTML = views.employee[state.currentView]();
    } else {
        const navItems = [
            { id: 'home', label: 'Dashboard', icon: '📊' },
        ];
        
        nav.innerHTML = navItems.map(item => `
            <button class="nav-item ${state.currentView === item.id ? 'active' : ''} " onclick="navigate('${item.id}')">
                <span>${item.icon}</span>
                <span>${item.label}</span>
            </button>
        `).join('');
        
        content.innerHTML = views.hr[state.currentView]();
    }
}

document.getElementById('role-select').addEventListener('change', (e) => {
    state.role = e.target.value;
    state.currentView = 'home';
    render();
});

document.querySelector('.close-modal').addEventListener('click', closeModal);

// Initialize
render();
