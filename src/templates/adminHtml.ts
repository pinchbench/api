// Admin HTML template - separated from route logic for maintainability
export const adminHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PinchBench Admin</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0d1117; color: #e6edf3; }
    .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
    header { background: #161b22; color: white; padding: 20px; margin-bottom: 20px; border-radius: 8px; border: 1px solid #30363d; }
    header h1 { font-size: 24px; }
    header .user { font-size: 14px; opacity: 0.8; margin-top: 5px; }
    .tabs { display: flex; gap: 10px; margin-bottom: 20px; }
    .tab { padding: 10px 20px; background: #21262d; border: 1px solid #30363d; border-radius: 8px; cursor: pointer; font-size: 14px; color: #e6edf3; }
    .tab:hover { background: #30363d; }
    .tab.active { background: #238636; color: white; border-color: #238636; }
    .panel { display: none; background: #161b22; border-radius: 8px; padding: 20px; border: 1px solid #30363d; }
    .panel.active { display: block; }
    .panel h2 { color: #e6edf3; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #30363d; }
    th { background: #21262d; font-weight: 600; color: #e6edf3; }
    tr:hover { background: #21262d; }
    .btn { padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; }
    .btn-primary { background: #238636; color: white; }
    .btn-primary:hover { background: #2ea043; }
    .btn-danger { background: #da3633; color: white; }
    .btn-danger:hover { background: #f85149; }
    .btn-secondary { background: #30363d; color: #e6edf3; border: 1px solid #484f58; }
    .btn-secondary:hover { background: #484f58; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 12px; }
    .badge-green { background: #238636; color: white; }
    .badge-red { background: #da3633; color: white; }
    .badge-gray { background: #30363d; color: #8b949e; }
    .pagination { margin-top: 20px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .loading { text-align: center; padding: 40px; color: #8b949e; }
    .error { background: #490202; color: #f85149; padding: 15px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #da3633; }
    .success { background: #0d1117; color: #3fb950; padding: 15px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #238636; }
    .mono { font-family: 'Monaco', 'Menlo', monospace; font-size: 12px; color: #79c0ff; }
    .toolbar { display: flex; gap: 15px; align-items: center; margin-bottom: 15px; flex-wrap: wrap; }
    .search-box { flex: 1; min-width: 200px; }
    .search-box input { width: 100%; max-width: 400px; padding: 10px 14px; border: 1px solid #30363d; border-radius: 6px; background: #0d1117; color: #e6edf3; font-size: 14px; }
    .search-box input:focus { outline: none; border-color: #238636; box-shadow: 0 0 0 3px rgba(35, 134, 54, 0.3); }
    .search-box input::placeholder { color: #8b949e; }
    .page-size-selector { display: flex; align-items: center; gap: 8px; }
    .page-size-selector label { font-size: 13px; color: #8b949e; }
    .page-size-selector select { padding: 8px 12px; border: 1px solid #30363d; border-radius: 6px; background: #0d1117; color: #e6edf3; font-size: 14px; cursor: pointer; }
    .page-size-selector select:focus { outline: none; border-color: #238636; }
    .no-results { text-align: center; padding: 40px; color: #8b949e; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🎯 PinchBench Admin</h1>
      <div class="user">Logged in as: <span id="user-email">Loading...</span></div>
    </header>

    <div id="alert"></div>

    <div class="tabs">
      <button class="tab" data-tab="versions">Benchmark Versions</button>
      <button class="tab" data-tab="submissions">Submissions</button>
      <button class="tab" data-tab="tokens">Tokens</button>
    </div>

    <div id="versions" class="panel">
      <h2 style="margin-bottom: 15px;">Benchmark Versions</h2>
      <div class="toolbar">
        <div class="search-box">
          <input type="text" id="versions-search" placeholder="Search by version ID or status..." oninput="filterVersions()">
        </div>
      </div>
      <div id="versions-content"><div class="loading">Loading...</div></div>
    </div>

    <div id="submissions" class="panel">
      <h2 style="margin-bottom: 15px;">Submissions</h2>
      <div class="toolbar">
        <div class="search-box">
          <input type="text" id="submissions-search" placeholder="Search by ID, model, provider, or version..." oninput="filterSubmissions()">
        </div>
        <div class="page-size-selector">
          <label for="submissions-page-size">Show:</label>
          <select id="submissions-page-size" onchange="changeSubmissionsPageSize()">
            <option value="20">20</option>
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="all">All</option>
          </select>
        </div>
      </div>
      <div id="submissions-content"><div class="loading">Loading...</div></div>
    </div>

    <div id="tokens" class="panel">
      <h2 style="margin-bottom: 15px;">API Tokens</h2>
      <div class="toolbar">
        <div class="search-box">
          <input type="text" id="tokens-search" placeholder="Search by ID or status..." oninput="filterTokens()">
        </div>
        <div class="page-size-selector">
          <label for="tokens-page-size">Show:</label>
          <select id="tokens-page-size" onchange="changeTokensPageSize()">
            <option value="20">20</option>
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="all">All</option>
          </select>
        </div>
      </div>
      <div id="tokens-content"><div class="loading">Loading...</div></div>
    </div>
  </div>

  <script>
    const API_BASE = '/admin/api';
    let currentSubmissionsPage = 0;
    let currentTokensPage = 0;
    let submissionsPageSize = 20;
    let tokensPageSize = 20;

    // Store full data for client-side filtering
    let allVersions = [];
    let allSubmissions = [];
    let allTokens = [];
    let totalSubmissions = 0;
    let totalTokens = 0;

    // Tab switching
    function switchTab(tabName) {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      const tab = document.querySelector('.tab[data-tab="' + tabName + '"]');
      const panel = document.getElementById(tabName);
      if (tab && panel) {
        tab.classList.add('active');
        panel.classList.add('active');
      }
    }

    function getTabFromHash() {
      const hash = window.location.hash.slice(1);
      const validTabs = ['versions', 'submissions', 'tokens'];
      return validTabs.includes(hash) ? hash : 'versions';
    }

    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        window.location.hash = tabName;
      });
    });

    window.addEventListener('hashchange', () => {
      switchTab(getTabFromHash());
    });

    // Set initial tab from URL hash
    switchTab(getTabFromHash());

    function showAlert(message, type = 'success') {
      const alert = document.getElementById('alert');
      alert.innerHTML = '<div class="' + type + '">' + message + '</div>';
      setTimeout(() => alert.innerHTML = '', 5000);
    }

    async function api(endpoint, options = {}) {
      const res = await fetch(API_BASE + endpoint, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...options.headers }
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(err.error || err.message || 'Request failed');
      }
      return res.json();
    }

    // ========== VERSIONS ==========
    async function loadVersions() {
      try {
        const data = await api('/versions');
        allVersions = data.versions;
        renderVersions(allVersions);
      } catch (err) {
        document.getElementById('versions-content').innerHTML = '<div class="error">' + err.message + '</div>';
      }
    }

    function filterVersions() {
      const query = document.getElementById('versions-search').value.toLowerCase().trim();
      if (!query) {
        renderVersions(allVersions);
        return;
      }
      const filtered = allVersions.filter(v => {
        const status = (v.is_current ? 'current' : '') + ' ' + (v.is_hidden ? 'hidden' : 'visible');
        return v.id.toLowerCase().includes(query) || status.includes(query);
      });
      renderVersions(filtered);
    }

    function renderVersions(versions) {
      if (!versions.length) {
        const query = document.getElementById('versions-search').value;
        document.getElementById('versions-content').innerHTML = query 
          ? '<div class="no-results">No versions match your search.</div>' 
          : '<p>No versions found.</p>';
        return;
      }
      let html = '<table><thead><tr><th>Version ID</th><th>Created</th><th>Submissions</th><th>Status</th><th>Actions</th></tr></thead><tbody>';
      versions.forEach(v => {
        const current = v.is_current ? '<span class="badge badge-green">Current</span>' : '';
        const hidden = v.is_hidden ? '<span class="badge badge-red">Hidden</span>' : '';
        html += '<tr>';
        html += '<td class="mono">' + v.id + '</td>';
        html += '<td>' + new Date(v.created_at).toLocaleDateString() + '</td>';
        html += '<td>' + v.submission_count + '</td>';
        html += '<td>' + current + ' ' + hidden + '</td>';
        html += '<td>';
        html += '<button class="btn btn-primary" onclick="setCurrent(\\'' + v.id + '\\')" ' + (v.is_current ? 'disabled' : '') + '>Set Current</button> ';
        html += '<button class="btn btn-secondary" onclick="toggleHidden(\\'' + v.id + '\\', ' + !v.is_hidden + ')">' + (v.is_hidden ? 'Unhide' : 'Hide') + '</button>';
        html += '</td></tr>';
      });
      html += '</tbody></table>';
      document.getElementById('versions-content').innerHTML = html;
    }

    async function setCurrent(id) {
      try {
        await api('/versions/' + id, {
          method: 'PUT',
          body: JSON.stringify({ current: true })
        });
        showAlert('Version ' + id + ' is now current');
        loadVersions();
      } catch (err) {
        showAlert(err.message, 'error');
      }
    }

    async function toggleHidden(id, hidden) {
      try {
        await api('/versions/' + id, {
          method: 'PUT',
          body: JSON.stringify({ hidden: hidden })
        });
        showAlert('Version ' + id + ' is now ' + (hidden ? 'hidden' : 'visible'));
        loadVersions();
      } catch (err) {
        showAlert(err.message, 'error');
      }
    }

    // ========== SUBMISSIONS ==========
    function changeSubmissionsPageSize() {
      const select = document.getElementById('submissions-page-size');
      const value = select.value;
      submissionsPageSize = value === 'all' ? 10000 : parseInt(value, 10);
      currentSubmissionsPage = 0;
      document.getElementById('submissions-search').value = '';
      loadSubmissions(0);
    }

    async function loadSubmissions(page = 0) {
      currentSubmissionsPage = page;
      document.getElementById('submissions-content').innerHTML = '<div class="loading">Loading...</div>';
      try {
        const data = await api('/submissions?limit=' + submissionsPageSize + '&offset=' + (page * submissionsPageSize));
        allSubmissions = data.submissions;
        totalSubmissions = data.total;
        renderSubmissions(allSubmissions, totalSubmissions);
      } catch (err) {
        document.getElementById('submissions-content').innerHTML = '<div class="error">' + err.message + '</div>';
      }
    }

    function filterSubmissions() {
      const query = document.getElementById('submissions-search').value.toLowerCase().trim();
      if (!query) {
        renderSubmissions(allSubmissions, totalSubmissions);
        return;
      }
      const filtered = allSubmissions.filter(s => {
        return s.id.toLowerCase().includes(query) ||
               s.model.toLowerCase().includes(query) ||
               (s.provider && s.provider.toLowerCase().includes(query)) ||
               (s.benchmark_version && s.benchmark_version.toLowerCase().includes(query));
      });
      renderSubmissions(filtered, filtered.length, true);
    }

    function renderSubmissions(submissions, total, isFiltered = false) {
      if (!submissions.length) {
        const query = document.getElementById('submissions-search').value;
        document.getElementById('submissions-content').innerHTML = query 
          ? '<div class="no-results">No submissions match your search.</div>' 
          : '<p>No submissions found.</p>';
        return;
      }
      let html = '<table><thead><tr><th>ID</th><th>Model</th><th>Provider</th><th>Score</th><th>Version</th><th>Date</th><th>Actions</th></tr></thead><tbody>';
      submissions.forEach(s => {
        html += '<tr>';
        html += '<td class="mono">' + s.id.slice(0, 8) + '...</td>';
        html += '<td>' + s.model + '</td>';
        html += '<td>' + (s.provider || '-') + '</td>';
        html += '<td>' + (s.score_percentage * 100).toFixed(1) + '%</td>';
        html += '<td class="mono">' + (s.benchmark_version || '-') + '</td>';
        html += '<td>' + new Date(s.timestamp).toLocaleDateString() + '</td>';
        html += '<td><button class="btn btn-danger" onclick="deleteSubmission(\\'' + s.id + '\\')">Delete</button></td>';
        html += '</tr>';
      });
      html += '</tbody></table>';
      
      const showingAll = submissionsPageSize >= 10000;
      html += '<div class="pagination">';
      if (!isFiltered && !showingAll) {
        html += '<button class="btn btn-secondary" onclick="loadSubmissions(' + (currentSubmissionsPage - 1) + ')" ' + (currentSubmissionsPage === 0 ? 'disabled' : '') + '>Previous</button>';
        html += '<span>Page ' + (currentSubmissionsPage + 1) + ' / ' + Math.ceil(total / submissionsPageSize) + '</span>';
        html += '<button class="btn btn-secondary" onclick="loadSubmissions(' + (currentSubmissionsPage + 1) + ')" ' + ((currentSubmissionsPage + 1) * submissionsPageSize >= total ? 'disabled' : '') + '>Next</button>';
      }
      if (isFiltered) {
        html += '<span>' + submissions.length + ' of ' + allSubmissions.length + ' loaded results</span>';
      } else {
        html += '<span style="margin-left: auto; color: #8b949e;">Showing ' + submissions.length + ' of ' + total + ' total</span>';
      }
      html += '</div>';
      document.getElementById('submissions-content').innerHTML = html;
    }

    async function deleteSubmission(id) {
      if (!confirm('Are you sure you want to delete submission ' + id + '?')) return;
      try {
        await api('/submissions/' + id, { method: 'DELETE' });
        showAlert('Submission deleted');
        loadSubmissions(currentSubmissionsPage);
      } catch (err) {
        showAlert(err.message, 'error');
      }
    }

    // ========== TOKENS ==========
    function changeTokensPageSize() {
      const select = document.getElementById('tokens-page-size');
      const value = select.value;
      tokensPageSize = value === 'all' ? 10000 : parseInt(value, 10);
      currentTokensPage = 0;
      document.getElementById('tokens-search').value = '';
      loadTokens(0);
    }

    async function loadTokens(page = 0) {
      currentTokensPage = page;
      document.getElementById('tokens-content').innerHTML = '<div class="loading">Loading...</div>';
      try {
        const data = await api('/tokens?limit=' + tokensPageSize + '&offset=' + (page * tokensPageSize));
        allTokens = data.tokens;
        totalTokens = data.total;
        renderTokens(allTokens, totalTokens);
      } catch (err) {
        document.getElementById('tokens-content').innerHTML = '<div class="error">' + err.message + '</div>';
      }
    }

    function filterTokens() {
      const query = document.getElementById('tokens-search').value.toLowerCase().trim();
      if (!query) {
        renderTokens(allTokens, totalTokens);
        return;
      }
      const filtered = allTokens.filter(t => {
        const status = t.claimed_at ? 'claimed' : (t.claim_code ? 'pending' : 'unclaimed');
        return t.id.toLowerCase().includes(query) || status.includes(query);
      });
      renderTokens(filtered, filtered.length, true);
    }

    function renderTokens(tokens, total, isFiltered = false) {
      if (!tokens.length) {
        const query = document.getElementById('tokens-search').value;
        document.getElementById('tokens-content').innerHTML = query 
          ? '<div class="no-results">No tokens match your search.</div>' 
          : '<p>No tokens found.</p>';
        return;
      }
      let html = '<table><thead><tr><th>ID</th><th>Created</th><th>Last Used</th><th>Submissions</th><th>Status</th><th>Actions</th></tr></thead><tbody>';
      tokens.forEach(t => {
        const status = t.claimed_at 
          ? '<span class="badge badge-green">Claimed</span>' 
          : (t.claim_code ? '<span class="badge badge-gray">Pending</span>' : '<span class="badge badge-gray">Unclaimed</span>');
        html += '<tr>';
        html += '<td class="mono">' + t.id.slice(0, 8) + '...</td>';
        html += '<td>' + new Date(t.created_at).toLocaleDateString() + '</td>';
        html += '<td>' + (t.last_used_at ? new Date(t.last_used_at).toLocaleDateString() : '-') + '</td>';
        html += '<td>' + t.submission_count + '</td>';
        html += '<td>' + status + '</td>';
        html += '<td>';
        if (!t.claimed_at) {
          html += '<button class="btn btn-primary" onclick="confirmToken(\\'' + t.id + '\\')">Confirm</button>';
        } else {
          html += '<button class="btn btn-secondary" onclick="unconfirmToken(\\'' + t.id + '\\')">Unconfirm</button>';
        }
        html += '</td>';
        html += '</tr>';
      });
      html += '</tbody></table>';
      
      const showingAll = tokensPageSize >= 10000;
      html += '<div class="pagination">';
      if (!isFiltered && !showingAll) {
        html += '<button class="btn btn-secondary" onclick="loadTokens(' + (currentTokensPage - 1) + ')" ' + (currentTokensPage === 0 ? 'disabled' : '') + '>Previous</button>';
        html += '<span>Page ' + (currentTokensPage + 1) + ' / ' + Math.ceil(total / tokensPageSize) + '</span>';
        html += '<button class="btn btn-secondary" onclick="loadTokens(' + (currentTokensPage + 1) + ')" ' + ((currentTokensPage + 1) * tokensPageSize >= total ? 'disabled' : '') + '>Next</button>';
      }
      if (isFiltered) {
        html += '<span>' + tokens.length + ' of ' + allTokens.length + ' loaded results</span>';
      } else {
        html += '<span style="margin-left: auto; color: #8b949e;">Showing ' + tokens.length + ' of ' + total + ' total</span>';
      }
      html += '</div>';
      document.getElementById('tokens-content').innerHTML = html;
    }

    async function confirmToken(id) {
      if (!confirm('Confirm token ' + id + '? This will mark it as claimed.')) return;
      try {
        await api('/tokens/' + id + '/confirm', { method: 'POST' });
        showAlert('Token confirmed');
        loadTokens(currentTokensPage);
      } catch (err) {
        showAlert(err.message, 'error');
      }
    }

    async function unconfirmToken(id) {
      if (!confirm('Unconfirm token ' + id + '? This will remove claimed status.')) return;
      try {
        await api('/tokens/' + id + '/unconfirm', { method: 'POST' });
        showAlert('Token unconfirmed');
        loadTokens(currentTokensPage);
      } catch (err) {
        showAlert(err.message, 'error');
      }
    }

    // ========== INIT ==========
    async function init() {
      try {
        const user = await api('/me');
        document.getElementById('user-email').textContent = user.email;
      } catch (err) {
        document.getElementById('user-email').textContent = 'Unknown';
      }
      loadVersions();
      loadSubmissions();
      loadTokens();
    }

    init();
  </script>
</body>
</html>`;
