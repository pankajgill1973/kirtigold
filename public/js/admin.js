/* ==========================================================================
   KIRTI GOLD INDUSTRIES - SECURE ADMIN DASHBOARD ENGINE
   ========================================================================== */

(() => {
  // Robust fallback check to prevent naming collisions in global scope
  if (typeof window.showToast !== 'function') {
    window.showToast = function(message, type = 'success') {
      console.log(`[Toast Fallback] ${type}: ${message}`);
      // Native transparent alert fallback
      alert(`${type.toUpperCase()}: ${message}`);
    };
  }
  // Define a local binding to the global function for clean execution
  const showToast = window.showToast;

  let adminToken = localStorage.getItem('kirti_admin_token') || '';
let loadedData = { subscribers: [], enquiries: [], applications: [] };
let activeTab = 'enquiries';

document.addEventListener('DOMContentLoaded', () => {
  if (!adminToken) {
    showLoginView();
  } else {
    loadDashboardData();
  }

  setupEventListeners();
});

// Show login form overlay
function showLoginView() {
  const loginWrapper = document.getElementById('loginWrapper');
  const dashboardWrapper = document.getElementById('dashboardWrapper');
  
  if (loginWrapper) loginWrapper.style.display = 'flex';
  if (dashboardWrapper) dashboardWrapper.style.display = 'none';
}

// Show dashboard panel
function showDashboardView() {
  const loginWrapper = document.getElementById('loginWrapper');
  const dashboardWrapper = document.getElementById('dashboardWrapper');
  
  if (loginWrapper) loginWrapper.style.display = 'none';
  if (dashboardWrapper) dashboardWrapper.style.display = 'flex';
}

// Hook all listeners
function setupEventListeners() {
  // Login Submit
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const password = document.getElementById('adminPassword').value;

      try {
        const response = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password })
        });
        const result = await response.json();

        if (result.success) {
          adminToken = result.token;
          localStorage.setItem('kirti_admin_token', adminToken);
          showToast('Login successful!', 'success');
          showDashboardView();
          loadDashboardData();
        } else {
          showToast('Invalid credentials.', 'error');
        }
      } catch (err) {
        showToast('Authentication failed.', 'error');
      }
    });
  }

  // Logout Trigger
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        if (adminToken) {
          await fetch('/api/admin/logout', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${adminToken}` }
          });
        }
      } finally {
        localStorage.removeItem('kirti_admin_token');
        adminToken = '';
        loadedData = { subscribers: [], enquiries: [], applications: [] };
        showLoginView();
        showToast('Logged out successfully.', 'info');
      }
    });
  }

  // Search input
  const searchInput = document.getElementById('tableSearch');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      renderActiveTabTable();
    });
  }

  // Export CSV Button
  const exportBtn = document.getElementById('exportBtn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      exportToCSV();
    });
  }

  // Sidebar tab switching event listeners dynamically bound (CSP-safe)
  const menuItems = document.querySelectorAll('.admin-menu-item');
  menuItems.forEach(item => {
    item.addEventListener('click', () => {
      const tab = item.getAttribute('data-tab');
      switchAdminTab(tab, item);
    });
  });
}

// Set active tab and re-render
window.switchAdminTab = function(tabName, element) {
  activeTab = tabName;
  
  // Update menu highlight
  document.querySelectorAll('.admin-menu-item').forEach(item => {
    item.classList.remove('active');
  });
  if (element) element.classList.add('active');

  // Change Search Placeholder
  const searchInput = document.getElementById('tableSearch');
  if (searchInput) {
    searchInput.value = '';
    searchInput.placeholder = `Search in ${tabName}...`;
  }

  renderActiveTabTable();
};

// Fetch metrics and records
async function loadDashboardData() {
  if (!adminToken) return;

  try {
    const response = await fetch('/api/admin/data', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.status === 401) {
      // Token expired or invalid
      localStorage.removeItem('kirti_admin_token');
      showLoginView();
      showToast('Session expired. Please log in again.', 'error');
      return;
    }

    const result = await response.json();
    if (result.success) {
      loadedData = {
        subscribers: result.subscribers || [],
        enquiries: result.enquiries || [],
        applications: result.applications || []
      };

      showDashboardView();
      updateMetricCards();
      renderActiveTabTable();
    } else {
      showToast('Failed to pull data feeds.', 'error');
    }
  } catch (err) {
    showToast('Failed to connect to administration api.', 'error');
  }
}

// Refresh analytics boxes
function updateMetricCards() {
  const totalSubscribersEl = document.getElementById('statTotalSubscribers');
  const totalEnquiriesEl = document.getElementById('statTotalEnquiries');
  const totalApplicationsEl = document.getElementById('statTotalApplications');

  if (totalSubscribersEl) totalSubscribersEl.innerText = loadedData.subscribers.length;
  if (totalEnquiriesEl) totalEnquiriesEl.innerText = loadedData.enquiries.length;
  if (totalApplicationsEl) totalApplicationsEl.innerText = loadedData.applications.length;
}

// Generate data records into table view
function renderActiveTabTable() {
  const headerRow = document.getElementById('tableHeaderRow');
  const body = document.getElementById('tableBody');
  const searchVal = document.getElementById('tableSearch')?.value.toLowerCase() || '';

  if (!headerRow || !body) return;

  body.innerHTML = '';
  headerRow.innerHTML = '';

  let dataset = loadedData[activeTab] || [];

  // Implement client-side filtering
  if (searchVal) {
    dataset = dataset.filter(item => {
      return Object.values(item).some(val => 
        String(val).toLowerCase().includes(searchVal)
      );
    });
  }

  if (activeTab === 'subscribers') {
    headerRow.innerHTML = `
      <th>#</th>
      <th>Email Address</th>
      <th>Subscription Date</th>
    `;

    if (dataset.length === 0) {
      body.innerHTML = `<tr><td colspan="3" class="text-center">No subscribers registered yet.</td></tr>`;
      return;
    }

    dataset.forEach((item, index) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${index + 1}</td>
        <td><strong>${escapeHTML(item.email)}</strong></td>
        <td>${formatDate(item.subscribedAt)}</td>
      `;
      body.appendChild(row);
    });

  } else if (activeTab === 'enquiries') {
    headerRow.innerHTML = `
      <th>ID</th>
      <th>Client Name</th>
      <th>Email & Phone</th>
      <th>Product Focus</th>
      <th>Message</th>
      <th>Received</th>
      <th>Status</th>
    `;

    if (dataset.length === 0) {
      body.innerHTML = `<tr><td colspan="7" class="text-center">No inquiries submitted yet.</td></tr>`;
      return;
    }

    dataset.forEach(item => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><small>${escapeHTML(item.id)}</small></td>
        <td><strong>${escapeHTML(item.name)}</strong></td>
        <td>
          <div>${escapeHTML(item.email)}</div>
          <div style="font-size:0.8rem; color:var(--text-muted);">${escapeHTML(item.phone)}</div>
        </td>
        <td><span class="badge-status completed" style="background:rgba(212,175,55,0.05); color:var(--primary); border-color:var(--dark-border);">${escapeHTML(item.product)}</span></td>
        <td style="max-width: 250px; font-size:0.9rem;" title="${escapeHTML(item.message)}">${escapeHTML(item.message)}</td>
        <td><small>${formatDate(item.createdAt)}</small></td>
        <td><span class="badge-status pending">${escapeHTML(item.status)}</span></td>
      `;
      body.appendChild(row);
    });

  } else if (activeTab === 'applications') {
    headerRow.innerHTML = `
      <th>ID</th>
      <th>Company Details</th>
      <th>Applicant Name</th>
      <th>Location</th>
      <th>Details</th>
      <th>Applied On</th>
      <th>Status</th>
    `;

    if (dataset.length === 0) {
      body.innerHTML = `<tr><td colspan="7" class="text-center">No distributor applications logged.</td></tr>`;
      return;
    }

    dataset.forEach(item => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><small>${escapeHTML(item.id)}</small></td>
        <td>
          <strong>${escapeHTML(item.companyName)}</strong>
          <div style="font-size:0.8rem; color:var(--text-muted);">Est. Exp: ${escapeHTML(item.experience)} yrs</div>
        </td>
        <td>
          <div><strong>${escapeHTML(item.contactPerson)}</strong></div>
          <div style="font-size:0.85rem;"><a href="tel:${escapeHTML(item.phone)}" style="color:var(--primary);">${escapeHTML(item.phone)}</a></div>
          <div style="font-size:0.85rem; color:var(--text-muted);">${escapeHTML(item.email)}</div>
        </td>
        <td>
          <div>${escapeHTML(item.city)}</div>
          <div style="font-size:0.8rem; color:var(--text-muted);">${escapeHTML(item.state)}</div>
        </td>
        <td>
          <div style="font-size:0.85rem;">Investment Cap: <strong>${escapeHTML(item.investment)}</strong></div>
          <div style="font-size:0.85rem; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHTML(item.message)}">${escapeHTML(item.message)}</div>
        </td>
        <td><small>${formatDate(item.createdAt)}</small></td>
        <td><span class="badge-status pending">${escapeHTML(item.status)}</span></td>
      `;
      body.appendChild(row);
    });
  }
}

// Export active data subset to CSV
function exportToCSV() {
  const dataset = loadedData[activeTab] || [];
  if (dataset.length === 0) {
    showToast('Nothing to export.', 'info');
    return;
  }

  let headers = [];
  let rows = [];

  if (activeTab === 'subscribers') {
    headers = ['Email', 'Subscribed At'];
    rows = dataset.map(item => [item.email, item.subscribedAt]);
  } else if (activeTab === 'enquiries') {
    headers = ['Inquiry ID', 'Name', 'Email', 'Phone', 'Product', 'Message', 'Created At', 'Status'];
    rows = dataset.map(item => [item.id, item.name, item.email, item.phone, item.product, item.message, item.createdAt, item.status]);
  } else if (activeTab === 'applications') {
    headers = ['Application ID', 'Company', 'Contact Person', 'Email', 'Phone', 'State', 'City', 'Experience', 'Investment', 'Message', 'Created At', 'Status'];
    rows = dataset.map(item => [item.id, item.companyName, item.contactPerson, item.email, item.phone, item.state, item.city, item.experience, item.investment, item.message, item.createdAt, item.status]);
  }

  // Escape CSV fields and neutralize spreadsheet formula prefixes from untrusted submissions.
  function safeCsvCell(value) {
    let str = String(value === null || value === undefined ? '' : value);
    if (/^[\\s\\u0000-\\u001f]*[=+\\-@]/.test(str)) str = "'" + str;
    return `"${str.replace(/"/g, '""')}"`;
  }

  let csvContent = headers.map(safeCsvCell).join(',') + "\r\n";
  rows.forEach(row => {
    csvContent += row.map(safeCsvCell).join(',') + "\r\n";
  });

  // Use a Blob so special characters are encoded safely.
  const csvBlob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const encodedUri = URL.createObjectURL(csvBlob);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `kirtigold_${activeTab}_export_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('CSV downloaded successfully!', 'success');
}

// Helpers
function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

function formatDate(isoString) {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (e) {
    return isoString;
  }
}

})();
