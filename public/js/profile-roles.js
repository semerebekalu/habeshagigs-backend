/**
 * Role-Based Profile Sections
 * Dynamically shows/hides profile sections based on user role
 */

let roleContext = null;

/**
 * Initialize role-based profile
 */
async function initRoleBasedProfile(userId, isOwnProfile) {
    try {
        roleContext = await getRoleContext(userId);
        
        // Show role switcher if user has multiple roles
        if (isOwnProfile && roleContext.can_switch) {
            showRoleSwitcher();
        }
        
        // Render appropriate sections based on active role
        renderRoleBasedSections(roleContext.active_role, isOwnProfile);
        
    } catch (err) {
        console.error('Failed to initialize role-based profile:', err);
    }
}

/**
 * Fetch user's role context
 */
async function getRoleContext(userId) {
    const response = await fetch(`${API}/users/${userId}/role-context`);
    if (!response.ok) throw new Error('Failed to fetch role context');
    return await response.json();
}

/**
 * Render sections based on role
 */
function renderRoleBasedSections(activeRole, isOwnProfile) {
    // Get tabs container
    const tabsContainer = document.querySelector('.profile-tabs');
    if (!tabsContainer) return;
    
    // Clear existing tabs
    tabsContainer.innerHTML = '';
    
    // Common tabs for all roles
    const commonTabs = [
        { id: 'about', label: 'About', icon: '📝' }
    ];
    
    // Role-specific tabs
    let roleTabs = [];
    
    if (activeRole === 'freelancer') {
        roleTabs = [
            { id: 'skills', label: 'Skills', icon: '⚡' },
            { id: 'portfolio', label: 'Portfolio', icon: '🎨' },
            { id: 'reviews', label: 'Reviews', icon: '⭐' }
        ];
        
        if (isOwnProfile) {
            roleTabs.push(
                { id: 'earnings', label: 'Earnings', icon: '💰' },
                { id: 'contracts', label: 'Contracts', icon: '📋' }
            );
        }
    } else if (activeRole === 'client') {
        // Clients don't have portfolio/skills/reviews tabs
        if (isOwnProfile) {
            roleTabs = [
                { id: 'jobs', label: 'Posted Jobs', icon: '💼' },
                { id: 'hired', label: 'Hired Freelancers', icon: '👥' },
                { id: 'spending', label: 'Spending', icon: '💳' },
                { id: 'contracts', label: 'Active Contracts', icon: '📋' }
            ];
        } else {
            // If viewing another client's profile, show limited info
            roleTabs = [
                { id: 'jobs', label: 'Active Jobs', icon: '💼' }
            ];
        }
    } else if (activeRole === 'admin') {
        roleTabs = [
            { id: 'stats', label: 'Platform Stats', icon: '📊' },
            { id: 'management', label: 'Management', icon: '⚙️' },
            { id: 'activity', label: 'Activity Log', icon: '📜' }
        ];
    }
    
    // Combine and render tabs
    const allTabs = [...commonTabs, ...roleTabs];
    allTabs.forEach((tab, index) => {
        const tabEl = document.createElement('div');
        tabEl.className = `ptab ${index === 0 ? 'active' : ''}`;
        tabEl.textContent = `${tab.icon} ${tab.label}`;
        tabEl.onclick = () => switchTab(tab.id, tabEl);
        tabsContainer.appendChild(tabEl);
    });
    
    // Initialize tab content
    initializeTabContent(activeRole, isOwnProfile);
}

/**
 * Update sidebar stats based on role
 */
function updateSidebarForRole(activeRole, isOwnProfile) {
    const sidebarContainer = document.querySelector('.profile-body > div:last-child');
    if (!sidebarContainer) return;
    
    // Clear existing sidebar content
    sidebarContainer.innerHTML = '';
    
    if (activeRole === 'freelancer') {
        // Freelancer sidebar - keep existing stats
        sidebarContainer.innerHTML = `
            <div class="profile-card">
                <h3>Stats</h3>
                <div class="stat-row"><span class="label">⭐ Rating</span><span class="value" id="sideRating">—</span></div>
                <div class="stat-row"><span class="label">✅ Completed</span><span class="value" id="sideCompleted">0</span></div>
                <div class="stat-row"><span class="label">📋 Completion Rate</span><span class="value" id="sideCompletion">—</span></div>
                <div class="stat-row"><span class="label">⚡ Response Rate</span><span class="value" id="sideResponse">—</span></div>
                <div class="stat-row"><span class="label">💰 Hourly Rate</span><span class="value" id="sideRate">—</span></div>
                <div class="stat-row"><span class="label">🟢 Availability</span><span class="value" id="sideAvail">—</span></div>
            </div>
            <div class="profile-card" id="badgesCard" style="display:none;">
                <h3>Skill Badges</h3>
                <div id="badgesList"></div>
            </div>
            ${!isOwnProfile ? `
                <div class="profile-card">
                    <button class="btn btn-primary btn-full" style="margin-bottom:10px;" onclick="window.location.href='/marketplace.html'">💼 Hire Now</button>
                    <button class="btn btn-outline btn-full" onclick="startConversation(${profileData?.id})">💬 Send Message</button>
                </div>
            ` : ''}
        `;
    } else if (activeRole === 'client') {
        // Client sidebar - show client-specific stats
        sidebarContainer.innerHTML = `
            <div class="profile-card">
                <h3>Client Stats</h3>
                <div class="stat-row"><span class="label">💼 Jobs Posted</span><span class="value" id="clientJobsPosted">—</span></div>
                <div class="stat-row"><span class="label">👥 Freelancers Hired</span><span class="value" id="clientHired">—</span></div>
                <div class="stat-row"><span class="label">💰 Total Spent</span><span class="value" id="clientSpent">—</span></div>
                <div class="stat-row"><span class="label">📋 Active Contracts</span><span class="value" id="clientActiveContracts">—</span></div>
                <div class="stat-row"><span class="label">⭐ Avg Rating Given</span><span class="value" id="clientAvgRating">—</span></div>
                <div class="stat-row"><span class="label">📅 Member Since</span><span class="value" id="clientMemberSince">—</span></div>
            </div>
            ${isOwnProfile ? `
                <div class="profile-card">
                    <h3>Quick Actions</h3>
                    <button class="btn btn-primary btn-full" style="margin-bottom:10px;" onclick="window.location.href='/post-job.html'">➕ Post New Job</button>
                    <button class="btn btn-outline btn-full" onclick="window.location.href='/marketplace.html'">🔍 Find Freelancers</button>
                </div>
            ` : ''}
        `;
        
        // Load client stats
        loadClientStats();
    } else if (activeRole === 'admin') {
        // Admin sidebar - show admin tools
        sidebarContainer.innerHTML = `
            <div class="profile-card">
                <h3>Admin Tools</h3>
                <div style="display:grid;gap:8px;">
                    <button class="btn btn-sm btn-outline btn-full" onclick="window.location.href='/admin.html#users'">👥 Users</button>
                    <button class="btn btn-sm btn-outline btn-full" onclick="window.location.href='/admin.html#kyc'">🆔 KYC</button>
                    <button class="btn btn-sm btn-outline btn-full" onclick="window.location.href='/admin.html#disputes'">⚖️ Disputes</button>
                    <button class="btn btn-sm btn-outline btn-full" onclick="window.location.href='/admin.html#payments'">💰 Payments</button>
                </div>
            </div>
            <div class="profile-card">
                <h3>System Health</h3>
                <div class="stat-row"><span class="label">🟢 Status</span><span class="value">Online</span></div>
                <div class="stat-row"><span class="label">👥 Active Users</span><span class="value" id="adminActiveUsers">—</span></div>
                <div class="stat-row"><span class="label">⚠️ Pending Issues</span><span class="value" id="adminPendingIssues">—</span></div>
            </div>
        `;
    }
}

/**
 * Load client statistics
 */
async function loadClientStats() {
    try {
        // TODO: Add endpoint for client stats
        // For now, set placeholder values
        document.getElementById('clientJobsPosted').textContent = '—';
        document.getElementById('clientHired').textContent = '—';
        document.getElementById('clientSpent').textContent = '—';
        document.getElementById('clientActiveContracts').textContent = '—';
        document.getElementById('clientAvgRating').textContent = '—';
        
        // Set member since date from profileData if available
        if (profileData && profileData.created_at) {
            const memberSince = new Date(profileData.created_at).toLocaleDateString('en-US', { 
                month: 'short', 
                year: 'numeric' 
            });
            document.getElementById('clientMemberSince').textContent = memberSince;
        }
    } catch (err) {
        console.error('Failed to load client stats:', err);
    }
}

/**
 * Initialize tab content based on role
 */
function initializeTabContent(activeRole, isOwnProfile) {
    const bodyContainer = document.querySelector('.profile-body > div:first-child');
    if (!bodyContainer) return;
    
    // Update sidebar based on role
    updateSidebarForRole(activeRole, isOwnProfile);
    
    // Keep existing tabs (about, skills, portfolio, reviews) for freelancers
    // Add new role-specific tabs
    
    if (activeRole === 'freelancer' && isOwnProfile) {
        // Add earnings tab
        if (!document.getElementById('tab-earnings')) {
            const earningsTab = document.createElement('div');
            earningsTab.id = 'tab-earnings';
            earningsTab.className = 'hidden';
            earningsTab.innerHTML = `
                <div class="profile-card">
                    <h3>💰 Earnings Overview</h3>
                    <div id="earningsContent">
                        <div class="stat-row">
                            <span class="label">Total Earnings</span>
                            <span class="value" id="totalEarnings">Loading...</span>
                        </div>
                        <div class="stat-row">
                            <span class="label">This Month</span>
                            <span class="value" id="monthEarnings">Loading...</span>
                        </div>
                        <div class="stat-row">
                            <span class="label">Pending</span>
                            <span class="value" id="pendingEarnings">Loading...</span>
                        </div>
                        <div class="stat-row">
                            <span class="label">Available to Withdraw</span>
                            <span class="value" id="availableBalance">Loading...</span>
                        </div>
                    </div>
                    <button class="btn btn-primary btn-full" style="margin-top:16px;" onclick="window.location.href='/dashboard.html#wallet'">
                        💸 Withdraw Funds
                    </button>
                </div>
            `;
            bodyContainer.appendChild(earningsTab);
            loadEarningsData();
        }
        
        // Add contracts tab
        if (!document.getElementById('tab-contracts')) {
            const contractsTab = document.createElement('div');
            contractsTab.id = 'tab-contracts';
            contractsTab.className = 'hidden';
            contractsTab.innerHTML = `
                <div class="profile-card">
                    <h3>📋 Active Contracts</h3>
                    <div id="contractsList">Loading...</div>
                </div>
            `;
            bodyContainer.appendChild(contractsTab);
            loadContractsData();
        }
    } else if (activeRole === 'client') {
        // Add client-specific tabs
        if (!document.getElementById('tab-jobs')) {
            const jobsTab = document.createElement('div');
            jobsTab.id = 'tab-jobs';
            jobsTab.className = 'hidden';
            jobsTab.innerHTML = `
                <div class="profile-card">
                    <h3>💼 Posted Jobs</h3>
                    <div id="jobsList">Loading...</div>
                </div>
            `;
            bodyContainer.appendChild(jobsTab);
            loadClientJobs();
        }
        
        if (isOwnProfile) {
            if (!document.getElementById('tab-hired')) {
                const hiredTab = document.createElement('div');
                hiredTab.id = 'tab-hired';
                hiredTab.className = 'hidden';
                hiredTab.innerHTML = `
                    <div class="profile-card">
                        <h3>👥 Hired Freelancers</h3>
                        <div id="hiredList">Loading...</div>
                    </div>
                `;
                bodyContainer.appendChild(hiredTab);
                loadHiredFreelancers();
            }
            
            if (!document.getElementById('tab-spending')) {
                const spendingTab = document.createElement('div');
                spendingTab.id = 'tab-spending';
                spendingTab.className = 'hidden';
                spendingTab.innerHTML = `
                    <div class="profile-card">
                        <h3>💳 Spending Analytics</h3>
                        <div id="spendingContent">
                            <div class="stat-row">
                                <span class="label">Total Spent</span>
                                <span class="value" id="totalSpent">Loading...</span>
                            </div>
                            <div class="stat-row">
                                <span class="label">This Month</span>
                                <span class="value" id="monthSpent">Loading...</span>
                            </div>
                            <div class="stat-row">
                                <span class="label">Active Contracts</span>
                                <span class="value" id="activeContracts">Loading...</span>
                            </div>
                            <div class="stat-row">
                                <span class="label">In Escrow</span>
                                <span class="value" id="escrowAmount">Loading...</span>
                            </div>
                        </div>
                    </div>
                `;
                bodyContainer.appendChild(spendingTab);
                loadSpendingData();
            }
        }
    } else if (activeRole === 'admin') {
        // Add admin-specific tabs
        if (!document.getElementById('tab-stats')) {
            const statsTab = document.createElement('div');
            statsTab.id = 'tab-stats';
            statsTab.className = 'hidden';
            statsTab.innerHTML = `
                <div class="profile-card">
                    <h3>📊 Platform Statistics</h3>
                    <div id="platformStats">Loading...</div>
                </div>
            `;
            bodyContainer.appendChild(statsTab);
            loadPlatformStats();
        }
        
        if (!document.getElementById('tab-management')) {
            const mgmtTab = document.createElement('div');
            mgmtTab.id = 'tab-management';
            mgmtTab.className = 'hidden';
            mgmtTab.innerHTML = `
                <div class="profile-card">
                    <h3>⚙️ Quick Management</h3>
                    <div style="display:grid;gap:12px;">
                        <a href="/admin.html#users" class="btn btn-outline btn-full">👥 User Management</a>
                        <a href="/admin.html#kyc" class="btn btn-outline btn-full">🆔 KYC Queue</a>
                        <a href="/admin.html#disputes" class="btn btn-outline btn-full">⚖️ Disputes</a>
                        <a href="/admin.html#payments" class="btn btn-outline btn-full">💰 Payments</a>
                    </div>
                </div>
            `;
            bodyContainer.appendChild(mgmtTab);
        }
        
        if (!document.getElementById('tab-activity')) {
            const activityTab = document.createElement('div');
            activityTab.id = 'tab-activity';
            activityTab.className = 'hidden';
            activityTab.innerHTML = `
                <div class="profile-card">
                    <h3>📜 Recent Activity</h3>
                    <div id="activityLog">Loading...</div>
                </div>
            `;
            bodyContainer.appendChild(activityTab);
            loadActivityLog();
        }
    }
}

/**
 * Show role switcher button
 */
function showRoleSwitcher() {
    const metaRow = document.querySelector('.profile-meta-row');
    if (!metaRow) return;
    
    const switcherHTML = `
        <div class="role-switcher" style="display:flex;gap:8px;align-items:center;background:#f8fafc;padding:8px 12px;border-radius:8px;border:1px solid #e2e8f0;">
            <span style="font-size:.85rem;color:#64748b;font-weight:600;">View as:</span>
            <select id="roleSwitcher" onchange="switchRole(this.value)" style="padding:4px 8px;border-radius:6px;border:1px solid #cbd5e1;font-size:.85rem;font-weight:600;cursor:pointer;">
                ${roleContext.available_roles.map(role => `
                    <option value="${role}" ${role === roleContext.active_role ? 'selected' : ''}>
                        ${role === 'freelancer' ? '💼 Freelancer' : '👔 Client'}
                    </option>
                `).join('')}
            </select>
        </div>
    `;
    
    // Insert before action buttons
    const actionBtns = document.getElementById('actionBtns');
    if (actionBtns) {
        actionBtns.insertAdjacentHTML('beforebegin', switcherHTML);
    }
}

/**
 * Switch active role
 */
async function switchRole(newRole) {
    try {
        const response = await fetch(`${API}/auth/switch-role`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ role: newRole })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Update token
            localStorage.setItem('token', data.token);
            
            // Reload page to show new role
            window.location.reload();
        } else {
            toast('Failed to switch role', 'error');
        }
    } catch (err) {
        toast('Error switching role', 'error');
    }
}

/**
 * Load earnings data for freelancers
 */
async function loadEarningsData() {
    try {
        const balance = await apiFetch('/wallet/balance');
        document.getElementById('availableBalance').textContent = `${balance.balance || 0} ETB`;
        
        // TODO: Add endpoints for total/monthly earnings
        document.getElementById('totalEarnings').textContent = '—';
        document.getElementById('monthEarnings').textContent = '—';
        document.getElementById('pendingEarnings').textContent = '—';
    } catch {
        document.getElementById('earningsContent').innerHTML = '<p style="color:#94a3b8;">Unable to load earnings data</p>';
    }
}

/**
 * Load contracts data
 */
async function loadContractsData() {
    try {
        // TODO: Add endpoint for user's contracts
        document.getElementById('contractsList').innerHTML = '<p style="color:#94a3b8;">No active contracts</p>';
    } catch {
        document.getElementById('contractsList').innerHTML = '<p style="color:#94a3b8;">Unable to load contracts</p>';
    }
}

/**
 * Load client's posted jobs
 */
async function loadClientJobs() {
    try {
        const jobs = await apiFetch('/jobs?status=open');
        if (!jobs.length) {
            document.getElementById('jobsList').innerHTML = '<p style="color:#94a3b8;">No jobs posted yet</p>';
            return;
        }
        
        document.getElementById('jobsList').innerHTML = jobs.map(job => `
            <div style="border-bottom:1px solid #f1f5f9;padding:12px 0;">
                <h4 style="font-size:.95rem;font-weight:600;margin-bottom:4px;">${job.title}</h4>
                <p style="font-size:.85rem;color:#64748b;margin-bottom:6px;">${job.description?.substring(0, 100)}...</p>
                <div style="display:flex;gap:12px;font-size:.8rem;color:#94a3b8;">
                    <span>💰 ${job.budget_min}-${job.budget_max} ETB</span>
                    <span>📝 ${job.proposal_count || 0} proposals</span>
                </div>
            </div>
        `).join('');
    } catch {
        document.getElementById('jobsList').innerHTML = '<p style="color:#94a3b8;">Unable to load jobs</p>';
    }
}

/**
 * Load hired freelancers
 */
async function loadHiredFreelancers() {
    try {
        // TODO: Add endpoint for hired freelancers
        document.getElementById('hiredList').innerHTML = '<p style="color:#94a3b8;">No freelancers hired yet</p>';
    } catch {
        document.getElementById('hiredList').innerHTML = '<p style="color:#94a3b8;">Unable to load data</p>';
    }
}

/**
 * Load spending data
 */
async function loadSpendingData() {
    try {
        // TODO: Add endpoints for spending analytics
        document.getElementById('totalSpent').textContent = '—';
        document.getElementById('monthSpent').textContent = '—';
        document.getElementById('activeContracts').textContent = '—';
        document.getElementById('escrowAmount').textContent = '—';
    } catch {
        document.getElementById('spendingContent').innerHTML = '<p style="color:#94a3b8;">Unable to load spending data</p>';
    }
}

/**
 * Load platform stats (admin)
 */
async function loadPlatformStats() {
    try {
        const stats = await apiFetch('/admin/stats');
        document.getElementById('platformStats').innerHTML = `
            <div class="stat-row"><span class="label">Total Users</span><span class="value">${stats.total_users || 0}</span></div>
            <div class="stat-row"><span class="label">Active Jobs</span><span class="value">${stats.active_jobs || 0}</span></div>
            <div class="stat-row"><span class="label">Total Volume</span><span class="value">${stats.total_volume || 0} ETB</span></div>
            <div class="stat-row"><span class="label">Disputes</span><span class="value">${stats.open_disputes || 0}</span></div>
        `;
    } catch {
        document.getElementById('platformStats').innerHTML = '<p style="color:#94a3b8;">Unable to load stats</p>';
    }
}

/**
 * Load activity log (admin)
 */
async function loadActivityLog() {
    try {
        // TODO: Add endpoint for activity log
        document.getElementById('activityLog').innerHTML = '<p style="color:#94a3b8;">No recent activity</p>';
    } catch {
        document.getElementById('activityLog').innerHTML = '<p style="color:#94a3b8;">Unable to load activity</p>';
    }
}
