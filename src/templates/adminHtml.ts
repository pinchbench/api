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
    th.sortable { cursor: pointer; user-select: none; position: relative; padding-right: 24px; }
    th.sortable:hover { background: #30363d; }
    th.sortable::after { content: '⇅'; position: absolute; right: 8px; opacity: 0.3; font-size: 12px; }
    th.sortable.sort-asc::after { content: '↑'; opacity: 1; color: #238636; }
    th.sortable.sort-desc::after { content: '↓'; opacity: 1; color: #238636; }
    tr:hover { background: #21262d; }
    .btn { padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; }
    .btn-primary { background: #238636; color: white; }
    .btn-primary:hover { background: #2ea043; }
    .btn-danger { background: #da3633; color: white; }
    .btn-danger:hover { background: #f85149; }
    .btn-secondary { background: #30363d; color: #e6edf3; border: 1px solid #484f58; }
    .btn-secondary:hover { background: #484f58; }
    .btn-copy { background: #1f6feb; color: white; }
    .btn-copy:hover { background: #388bfd; }
    .btn-copy.copied { background: #238636; }
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
    .checkbox-filter { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #8b949e; }
    .checkbox-filter input { accent-color: #238636; }
    .no-results { text-align: center; padding: 40px; color: #8b949e; }
    .link { color: #79c0ff; text-decoration: none; }
    .link:hover { text-decoration: underline; }
    .chart-card { background: #0d1117; border: 1px solid #30363d; border-radius: 8px; padding: 16px; }
    .chart-header { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
    .chart-title { font-size: 16px; color: #e6edf3; font-weight: 600; }
    .chart-meta { font-size: 12px; color: #8b949e; }
    .chart-canvas { width: 100%; height: 260px; display: block; }
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
      <button class="tab" data-tab="graphs">Graphs</button>
      <button class="tab" data-tab="models">Models</button>
      <button class="tab" data-tab="tokens">Tokens</button>
      <button class="tab" data-tab="users">Users</button>
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
        <label class="checkbox-filter" for="submissions-official-only">
          <input type="checkbox" id="submissions-official-only" onchange="applySubmissionsOfficialFilter()">
          Official only
        </label>
        <button class="btn btn-danger" onclick="deleteZeroPercentSubmissions()">Delete all 0%</button>
      </div>
      <div id="submissions-content"><div class="loading">Loading...</div></div>
    </div>

    <div id="graphs" class="panel">
      <h2 style="margin-bottom: 15px;">Graphs</h2>
      <div class="chart-card">
        <div class="chart-header">
          <div class="chart-title">Submissions per day</div>
          <div class="page-size-selector">
            <label for="submissions-per-day-filter">Show:</label>
            <select id="submissions-per-day-filter" onchange="loadSubmissionsPerDayGraph()">
              <option value="all">All submissions</option>
              <option value="true">Official only</option>
              <option value="false">Unofficial only</option>
            </select>
          </div>
          <div id="submissions-per-day-meta" class="chart-meta"></div>
        </div>
        <canvas id="submissions-per-day-chart" class="chart-canvas"></canvas>
      </div>
    </div>

    <div id="models" class="panel">
      <h2 style="margin-bottom: 15px;">Models</h2>
      <div class="toolbar">
        <div class="search-box">
          <input type="text" id="models-search" placeholder="Search by model, provider, or weights..." oninput="filterModels()">
        </div>
      </div>
      <div id="models-content"><div class="loading">Loading...</div></div>
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

    <div id="users" class="panel">
      <h2 style="margin-bottom: 15px;">Users</h2>
      <div class="toolbar">
        <div class="search-box">
          <input type="text" id="users-search" placeholder="Search by GitHub username..." oninput="filterUsers()">
        </div>
        <div class="page-size-selector">
          <label for="users-page-size">Show:</label>
          <select id="users-page-size" onchange="changeUsersPageSize()">
            <option value="20">20</option>
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="all">All</option>
          </select>
        </div>
      </div>
      <div id="users-content"><div class="loading">Loading...</div></div>
    </div>
  </div>

  <script>
    const API_BASE = '/admin/api';
    let currentSubmissionsPage = 0;
    let currentTokensPage = 0;
    let currentUsersPage = 0;
    let submissionsPageSize = 20;
    let tokensPageSize = 20;
    let usersPageSize = 20;

    // Store full data for client-side filtering and sorting
    let allVersions = [];
    let allSubmissions = [];
    let allModels = [];
    let allTokens = [];
    let allUsers = [];
    let totalSubmissions = 0;
    let totalTokens = 0;
    let totalUsers = 0;

    // Sort state for each table: { column: string, direction: 'asc' | 'desc' }
    let versionsSort = { column: 'created_at', direction: 'desc' };
    let submissionsSort = { column: 'timestamp', direction: 'desc' };
    let modelsSort = { column: 'model', direction: 'asc' };
    let tokensSort = { column: 'created_at', direction: 'desc' };
    let usersSort = { column: 'submission_count', direction: 'desc' };

    // Generic sort function
    function sortData(data, column, direction, getters) {
      const getValue = getters[column] || (item => item[column]);
      return [...data].sort((a, b) => {
        let aVal = getValue(a);
        let bVal = getValue(b);
        
        // Handle null/undefined
        if (aVal == null && bVal == null) return 0;
        if (aVal == null) return direction === 'asc' ? 1 : -1;
        if (bVal == null) return direction === 'asc' ? -1 : 1;
        
        // Handle dates
        if (aVal instanceof Date) aVal = aVal.getTime();
        if (bVal instanceof Date) bVal = bVal.getTime();
        
        // Handle strings
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return direction === 'asc' 
            ? aVal.localeCompare(bVal) 
            : bVal.localeCompare(aVal);
        }
        
        // Handle numbers
        return direction === 'asc' ? aVal - bVal : bVal - aVal;
      });
    }

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
      const validTabs = ['versions', 'submissions', 'graphs', 'models', 'tokens', 'users'];
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
    const versionsGetters = {
      id: v => v.id,
      created_at: v => new Date(v.created_at),
      submission_count: v => v.submission_count,
      status: v => (v.is_current ? 'a' : 'z') + (v.is_hidden ? 'z' : 'a') // Sort current first, visible first
    };

    function sortVersions(column) {
      if (versionsSort.column === column) {
        versionsSort.direction = versionsSort.direction === 'asc' ? 'desc' : 'asc';
      } else {
        versionsSort.column = column;
        versionsSort.direction = 'asc';
      }
      filterVersions();
    }

    async function loadVersions() {
      try {
        const data = await api('/versions');
        allVersions = data.versions;
        filterVersions();
      } catch (err) {
        document.getElementById('versions-content').innerHTML = '<div class="error">' + err.message + '</div>';
      }
    }

    function filterVersions() {
      const query = document.getElementById('versions-search').value.toLowerCase().trim();
      let filtered = allVersions;
      if (query) {
        filtered = allVersions.filter(v => {
          const status = (v.is_current ? 'current' : '') + ' ' + (v.is_hidden ? 'hidden' : 'visible');
          return v.id.toLowerCase().includes(query) || status.includes(query);
        });
      }
      const sorted = sortData(filtered, versionsSort.column, versionsSort.direction, versionsGetters);
      renderVersions(sorted);
    }

    function renderVersions(versions) {
      if (!versions.length) {
        const query = document.getElementById('versions-search').value;
        document.getElementById('versions-content').innerHTML = query 
          ? '<div class="no-results">No versions match your search.</div>' 
          : '<p>No versions found.</p>';
        return;
      }
      
      function sortClass(col) {
        if (versionsSort.column !== col) return 'sortable';
        return 'sortable sort-' + versionsSort.direction;
      }
      
      let html = '<table><thead><tr>';
      html += '<th class="' + sortClass('id') + '" onclick="sortVersions(\\'id\\')">Version ID</th>';
      html += '<th class="' + sortClass('created_at') + '" onclick="sortVersions(\\'created_at\\')">Created</th>';
      html += '<th class="' + sortClass('submission_count') + '" onclick="sortVersions(\\'submission_count\\')">Submissions</th>';
      html += '<th class="' + sortClass('status') + '" onclick="sortVersions(\\'status\\')">Status</th>';
      html += '<th>Actions</th>';
      html += '</tr></thead><tbody>';
      
      versions.forEach(v => {
        const current = v.is_current ? '<span class="badge badge-green">Current</span>' : '';
        const hidden = v.is_hidden ? '<span class="badge badge-red">Hidden</span>' : '';
        html += '<tr>';
        html += '<td class="mono">' + v.id + '</td>';
        html += '<td>' + new Date(v.created_at).toLocaleDateString() + '</td>';
        html += '<td>' + v.submission_count + '</td>';
        html += '<td>' + current + ' ' + hidden + '</td>';
        html += '<td>';
        html += '<button class="btn ' + (v.is_current ? 'btn-secondary' : 'btn-primary') + '" onclick="toggleCurrent(\\'' + v.id + '\\', ' + !v.is_current + ')">' + (v.is_current ? 'Remove Current' : 'Set Current') + '</button> ';
        html += '<button class="btn btn-secondary" onclick="toggleHidden(\\'' + v.id + '\\', ' + !v.is_hidden + ')">' + (v.is_hidden ? 'Unhide' : 'Hide') + '</button>';
        html += '</td></tr>';
      });
      html += '</tbody></table>';
      document.getElementById('versions-content').innerHTML = html;
    }

    async function toggleCurrent(id, current) {
      try {
        await api('/versions/' + id, {
          method: 'PUT',
          body: JSON.stringify({ current: current })
        });
        showAlert('Version ' + id + ' is now ' + (current ? 'current' : 'not current'));
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
    const submissionsGetters = {
      id: s => s.id,
      model: s => s.model,
      provider: s => s.provider || '',
      score_percentage: s => s.score_percentage,
      benchmark_version: s => s.benchmark_version || '',
      timestamp: s => new Date(s.timestamp),
      official: s => s.official
    };

    function sortSubmissions(column) {
      if (submissionsSort.column === column) {
        submissionsSort.direction = submissionsSort.direction === 'asc' ? 'desc' : 'asc';
      } else {
        submissionsSort.column = column;
        submissionsSort.direction = 'asc';
      }
      filterSubmissions();
    }

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
        const officialOnly = document.getElementById('submissions-official-only').checked;
        const officialParam = officialOnly ? '&official=true' : '';
        const data = await api('/submissions?limit=' + submissionsPageSize + '&offset=' + (page * submissionsPageSize) + officialParam);
        allSubmissions = data.submissions;
        totalSubmissions = data.total;
        filterSubmissions();
      } catch (err) {
        document.getElementById('submissions-content').innerHTML = '<div class="error">' + err.message + '</div>';
      }
    }

    function applySubmissionsOfficialFilter() {
      currentSubmissionsPage = 0;
      loadSubmissions(0);
    }

    function filterSubmissions() {
      const query = document.getElementById('submissions-search').value.toLowerCase().trim();
      let filtered = allSubmissions;
      if (query) {
        filtered = filtered.filter(s => {
          return s.id.toLowerCase().includes(query) ||
                 s.model.toLowerCase().includes(query) ||
                 (s.provider && s.provider.toLowerCase().includes(query)) ||
                 (s.benchmark_version && s.benchmark_version.toLowerCase().includes(query));
        });
      }
      const sorted = sortData(filtered, submissionsSort.column, submissionsSort.direction, submissionsGetters);
      const isFiltered = !!query;
      renderSubmissions(sorted, isFiltered ? sorted.length : totalSubmissions, isFiltered);
    }

    function renderSubmissions(submissions, total, isFiltered = false) {
      if (!submissions.length) {
        const query = document.getElementById('submissions-search').value;
        const officialOnly = document.getElementById('submissions-official-only').checked;
        document.getElementById('submissions-content').innerHTML = (query || officialOnly)
          ? '<div class="no-results">No submissions match your filter.</div>' 
          : '<p>No submissions found.</p>';
        return;
      }
      
      function sortClass(col) {
        if (submissionsSort.column !== col) return 'sortable';
        return 'sortable sort-' + submissionsSort.direction;
      }
      
      let html = '<table><thead><tr>';
      html += '<th class="' + sortClass('id') + '" onclick="sortSubmissions(\\'id\\')">ID</th>';
      html += '<th class="' + sortClass('model') + '" onclick="sortSubmissions(\\'model\\')">Model</th>';
      html += '<th class="' + sortClass('provider') + '" onclick="sortSubmissions(\\'provider\\')">Provider</th>';
      html += '<th class="' + sortClass('score_percentage') + '" onclick="sortSubmissions(\\'score_percentage\\')">Score</th>';
      html += '<th class="' + sortClass('official') + '" onclick="sortSubmissions(\\'official\\')">Official</th>';
      html += '<th class="' + sortClass('benchmark_version') + '" onclick="sortSubmissions(\\'benchmark_version\\')">Version</th>';
      html += '<th class="' + sortClass('timestamp') + '" onclick="sortSubmissions(\\'timestamp\\')">Date</th>';
      html += '<th>Actions</th>';
      html += '</tr></thead><tbody>';
      
      submissions.forEach(s => {
        html += '<tr>';
        html += '<td class="mono"><a href="https://pinchbench.com/submission/' + s.id + '" target="_blank" rel="noopener" style="color: #79c0ff; text-decoration: none;">' + s.id.slice(0, 8) + '...</a></td>';
        html += '<td>' + s.model + '</td>';
        html += '<td>' + (s.provider || '-') + '</td>';
        html += '<td>' + (s.score_percentage * 100).toFixed(1) + '%</td>';
        html += '<td>' + (s.official ? '<span class="badge badge-green">Yes</span>' : '<span class="badge badge-gray">No</span>') + '</td>';
        html += '<td class="mono">' + (s.benchmark_version || '-') + '</td>';
        html += '<td>' + new Date(s.timestamp).toLocaleDateString() + '</td>';
        html += '<td>';
        if (s.official) {
          html += '<button class="btn btn-secondary" onclick="toggleSubmissionOfficial(\\'' + s.id + '\\', false)">Mark Unofficial</button> ';
        } else {
          html += '<button class="btn btn-primary" onclick="toggleSubmissionOfficial(\\'' + s.id + '\\', true)">Mark Official</button> ';
        }
        html += '<button class="btn btn-danger" onclick="deleteSubmission(\\'' + s.id + '\\')">Delete</button>';
        html += '</td>';
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

    async function toggleSubmissionOfficial(id, official) {
      try {
        await api('/submissions/' + id + '/official', {
          method: 'POST',
          body: JSON.stringify({ official: official })
        });
        showAlert('Submission ' + id + ' is now ' + (official ? 'official' : 'unofficial'));
        loadSubmissions(currentSubmissionsPage);
      } catch (err) {
        showAlert(err.message, 'error');
      }
    }

    async function deleteZeroPercentSubmissions() {
      if (!confirm('Delete all submissions with a 0.0% score? This cannot be undone.')) return;
      try {
        const result = await api('/submissions/zero-percent', { method: 'DELETE' });
        showAlert('Deleted ' + result.deleted + ' zero-percent submissions');
        loadSubmissions(0);
      } catch (err) {
        showAlert(err.message, 'error');
      }
    }

    // ========== MODELS ==========
    const modelsGetters = {
      model: m => m.model,
      provider: m => m.provider,
      weights: m => m.weights,
      hf_link: m => m.hf_link || ''
    };

    function sortModels(column) {
      if (modelsSort.column === column) {
        modelsSort.direction = modelsSort.direction === 'asc' ? 'desc' : 'asc';
      } else {
        modelsSort.column = column;
        modelsSort.direction = 'asc';
      }
      filterModels();
    }

    async function loadModels() {
      try {
        const data = await api('/models/metadata');
        allModels = data.models;
        filterModels();
      } catch (err) {
        document.getElementById('models-content').innerHTML = '<div class="error">' + err.message + '</div>';
      }
    }

    function filterModels() {
      const query = document.getElementById('models-search').value.toLowerCase().trim();
      let filtered = allModels;
      if (query) {
        filtered = allModels.filter(m => {
          return m.model.toLowerCase().includes(query) ||
                 (m.provider && m.provider.toLowerCase().includes(query)) ||
                 (m.weights && m.weights.toLowerCase().includes(query));
        });
      }
      const sorted = sortData(filtered, modelsSort.column, modelsSort.direction, modelsGetters);
      renderModels(sorted);
    }

    function renderModels(models) {
      // Simple HTML-escaping to prevent XSS when rendering model data
      function escapeHtml(value) {
        if (value === null || value === undefined) return '';
        return String(value)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }

      if (!models.length) {
        const query = document.getElementById('models-search').value;
        document.getElementById('models-content').innerHTML = query
          ? '<div class="no-results">No models match your search.</div>'
          : '<p>No models found.</p>';
        return;
      }

      function sortClass(col) {
        if (modelsSort.column !== col) return 'sortable';
        return 'sortable sort-' + modelsSort.direction;
      }

      let html = '<table><thead><tr>';
      html += '<th class="' + sortClass('model') + '" onclick="sortModels(\\'model\\')">Model</th>';
      html += '<th class="' + sortClass('provider') + '" onclick="sortModels(\\'provider\\')">Provider</th>';
      html += '<th class="' + sortClass('weights') + '" onclick="sortModels(\\'weights\\')">Weights</th>';
      html += '<th class="' + sortClass('hf_link') + '" onclick="sortModels(\\'hf_link\\')">HF Link</th>';
      html += '</tr></thead><tbody>';

      models.forEach(m => {
        let weightsBadge = '<span class="badge badge-gray">Unknown</span>';
        if (m.weights === 'Open') {
          weightsBadge = '<span class="badge badge-green">Open</span>';
        } else if (m.weights === 'Closed') {
          weightsBadge = '<span class="badge badge-red">Closed</span>';
        }

        let hfLink = '-';
        if (typeof m.hf_link === 'string') {
          const url = m.hf_link.trim();
          // Only allow links to Hugging Face, as these are expected here
          if (url.startsWith('https://huggingface.co/')) {
            const safeUrl = escapeHtml(url);
            hfLink = '<a class="link" href="' + safeUrl + '" target="_blank" rel="noopener">Hugging Face ↗</a>';
          }
        }

        html += '<tr>';
        html += '<td class="mono">' + escapeHtml(m.model) + '</td>';
        html += '<td>' + (m.provider ? escapeHtml(m.provider) : '-') + '</td>';
        html += '<td>' + weightsBadge + '</td>';
        html += '<td>' + hfLink + '</td>';
        html += '</tr>';
      });
      html += '</tbody></table>';
      document.getElementById('models-content').innerHTML = html;
    }

    // ========== TOKENS ==========
    const tokensGetters = {
      id: t => t.id,
      created_at: t => new Date(t.created_at),
      last_used_at: t => t.last_used_at ? new Date(t.last_used_at) : null,
      submission_count: t => t.submission_count,
      status: t => t.claimed_at ? 'a_claimed' : (t.claim_code ? 'b_pending' : 'c_unclaimed')
    };

    function sortTokens(column) {
      if (tokensSort.column === column) {
        tokensSort.direction = tokensSort.direction === 'asc' ? 'desc' : 'asc';
      } else {
        tokensSort.column = column;
        tokensSort.direction = 'asc';
      }
      filterTokens();
    }

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
        filterTokens();
      } catch (err) {
        document.getElementById('tokens-content').innerHTML = '<div class="error">' + err.message + '</div>';
      }
    }

    function filterTokens() {
      const query = document.getElementById('tokens-search').value.toLowerCase().trim();
      let filtered = allTokens;
      if (query) {
        filtered = allTokens.filter(t => {
          const status = t.claimed_at ? 'claimed' : (t.claim_code ? 'pending' : 'unclaimed');
          return t.id.toLowerCase().includes(query) || status.includes(query);
        });
      }
      const sorted = sortData(filtered, tokensSort.column, tokensSort.direction, tokensGetters);
      renderTokens(sorted, query ? sorted.length : totalTokens, !!query);
    }

    function renderTokens(tokens, total, isFiltered = false) {
      if (!tokens.length) {
        const query = document.getElementById('tokens-search').value;
        document.getElementById('tokens-content').innerHTML = query 
          ? '<div class="no-results">No tokens match your search.</div>' 
          : '<p>No tokens found.</p>';
        return;
      }
      
      function sortClass(col) {
        if (tokensSort.column !== col) return 'sortable';
        return 'sortable sort-' + tokensSort.direction;
      }
      
      let html = '<table><thead><tr>';
      html += '<th class="' + sortClass('id') + '" onclick="sortTokens(\\'id\\')">ID</th>';
      html += '<th class="' + sortClass('created_at') + '" onclick="sortTokens(\\'created_at\\')">Created</th>';
      html += '<th class="' + sortClass('last_used_at') + '" onclick="sortTokens(\\'last_used_at\\')">Last Used</th>';
      html += '<th class="' + sortClass('submission_count') + '" onclick="sortTokens(\\'submission_count\\')">Submissions</th>';
      html += '<th class="' + sortClass('status') + '" onclick="sortTokens(\\'status\\')">Status</th>';
      html += '<th>Actions</th>';
      html += '</tr></thead><tbody>';
      
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
        html += '<button class="btn btn-copy" id="copy-btn-' + t.id.slice(0, 8) + '" onclick="copyToken(\\'' + t.id + '\\', this)">Copy</button> ';
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

    async function copyToken(id, btn) {
      try {
        await navigator.clipboard.writeText(id);
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = originalText;
          btn.classList.remove('copied');
        }, 2000);
      } catch (err) {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = id;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = 'Copy';
          btn.classList.remove('copied');
        }, 2000);
      }
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

    // ========== USERS ==========
    const usersGetters = {
      github_username: u => u.github_username,
      token_count: u => u.token_count,
      submission_count: u => u.submission_count,
      first_seen: u => u.first_seen ? new Date(u.first_seen) : null,
      last_active: u => u.last_active ? new Date(u.last_active) : null
    };

    function sortUsers(column) {
      if (usersSort.column === column) {
        usersSort.direction = usersSort.direction === 'asc' ? 'desc' : 'asc';
      } else {
        usersSort.column = column;
        usersSort.direction = 'asc';
      }
      filterUsers();
    }

    function changeUsersPageSize() {
      const select = document.getElementById('users-page-size');
      const value = select.value;
      usersPageSize = value === 'all' ? 10000 : parseInt(value, 10);
      currentUsersPage = 0;
      document.getElementById('users-search').value = '';
      loadUsers(0);
    }

    async function loadUsers(page = 0) {
      currentUsersPage = page;
      document.getElementById('users-content').innerHTML = '<div class="loading">Loading...</div>';
      try {
        const data = await api('/users?limit=' + usersPageSize + '&offset=' + (page * usersPageSize));
        allUsers = data.users;
        totalUsers = data.total;
        filterUsers();
      } catch (err) {
        document.getElementById('users-content').innerHTML = '<div class="error">' + err.message + '</div>';
      }
    }

    function filterUsers() {
      const query = document.getElementById('users-search').value.toLowerCase().trim();
      let filtered = allUsers;
      if (query) {
        filtered = allUsers.filter(u => {
          return u.github_username.toLowerCase().includes(query);
        });
      }
      const sorted = sortData(filtered, usersSort.column, usersSort.direction, usersGetters);
      renderUsers(sorted, query ? sorted.length : totalUsers, !!query);
    }

    function renderUsers(users, total, isFiltered = false) {
      if (!users.length) {
        const query = document.getElementById('users-search').value;
        document.getElementById('users-content').innerHTML = query 
          ? '<div class="no-results">No users match your search.</div>' 
          : '<p>No users found. Users appear here when they claim their tokens via GitHub OAuth.</p>';
        return;
      }
      
      function sortClass(col) {
        if (usersSort.column !== col) return 'sortable';
        return 'sortable sort-' + usersSort.direction;
      }
      
      let html = '<table><thead><tr>';
      html += '<th class="' + sortClass('github_username') + '" onclick="sortUsers(\\'github_username\\')">GitHub Username</th>';
      html += '<th class="' + sortClass('submission_count') + '" onclick="sortUsers(\\'submission_count\\')">Submissions</th>';
      html += '<th class="' + sortClass('token_count') + '" onclick="sortUsers(\\'token_count\\')">Tokens</th>';
      html += '<th class="' + sortClass('first_seen') + '" onclick="sortUsers(\\'first_seen\\')">First Seen</th>';
      html += '<th class="' + sortClass('last_active') + '" onclick="sortUsers(\\'last_active\\')">Last Active</th>';
      html += '<th>Profile</th>';
      html += '</tr></thead><tbody>';
      
      users.forEach(u => {
        html += '<tr>';
        html += '<td><strong>' + u.github_username + '</strong></td>';
        html += '<td>' + u.submission_count + '</td>';
        html += '<td>' + u.token_count + '</td>';
        html += '<td>' + (u.first_seen ? new Date(u.first_seen).toLocaleDateString() : '-') + '</td>';
        html += '<td>' + (u.last_active ? new Date(u.last_active).toLocaleDateString() : '-') + '</td>';
        html += '<td><a href="https://github.com/' + encodeURIComponent(u.github_username) + '" target="_blank" rel="noopener" class="btn btn-secondary">GitHub ↗</a></td>';
        html += '</tr>';
      });
      html += '</tbody></table>';
      
      const showingAll = usersPageSize >= 10000;
      html += '<div class="pagination">';
      if (!isFiltered && !showingAll) {
        html += '<button class="btn btn-secondary" onclick="loadUsers(' + (currentUsersPage - 1) + ')" ' + (currentUsersPage === 0 ? 'disabled' : '') + '>Previous</button>';
        html += '<span>Page ' + (currentUsersPage + 1) + ' / ' + Math.ceil(total / usersPageSize) + '</span>';
        html += '<button class="btn btn-secondary" onclick="loadUsers(' + (currentUsersPage + 1) + ')" ' + ((currentUsersPage + 1) * usersPageSize >= total ? 'disabled' : '') + '>Next</button>';
      }
      if (isFiltered) {
        html += '<span>' + users.length + ' of ' + allUsers.length + ' loaded results</span>';
      } else {
        html += '<span style="margin-left: auto; color: #8b949e;">Showing ' + users.length + ' of ' + total + ' total</span>';
      }
      html += '</div>';
      document.getElementById('users-content').innerHTML = html;
    }

    // ========== GRAPHS ==========
    function formatDateLabel(date) {
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }

    function buildDailySeries(points) {
      if (!points.length) return { labels: [], values: [] };
      const map = new Map(points.map(p => [p.day, p.count]));
      const start = new Date(points[0].day + 'T00:00:00Z');
      const end = new Date(points[points.length - 1].day + 'T00:00:00Z');
      const labels = [];
      const values = [];
      for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
        const key = d.toISOString().slice(0, 10);
        labels.push(formatDateLabel(d));
        values.push(map.get(key) ?? 0);
      }
      return { labels, values };
    }

    function drawLineChart(canvas, labels, values) {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const parent = canvas.parentElement;
      const width = parent ? parent.clientWidth : 600;
      const height = 260;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      canvas.style.height = height + 'px';
      canvas.style.width = width + 'px';
      ctx.scale(ratio, ratio);

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#0d1117';
      ctx.fillRect(0, 0, width, height);

      const padding = { top: 16, right: 16, bottom: 28, left: 40 };
      const chartWidth = width - padding.left - padding.right;
      const chartHeight = height - padding.top - padding.bottom;
      const maxValue = Math.max(1, ...values);

      ctx.strokeStyle = '#21262d';
      ctx.lineWidth = 1;
      const gridLines = 4;
      for (let i = 0; i <= gridLines; i++) {
        const y = padding.top + (chartHeight * i) / gridLines;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();
      }

      ctx.fillStyle = '#8b949e';
      ctx.font = '11px -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let i = 0; i <= gridLines; i++) {
        const value = Math.round(maxValue - (maxValue * i) / gridLines);
        const y = padding.top + (chartHeight * i) / gridLines;
        ctx.fillText(String(value), padding.left - 6, y);
      }

      if (!values.length) return;

      ctx.strokeStyle = '#79c0ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      values.forEach((value, idx) => {
        const x = padding.left + (chartWidth * idx) / Math.max(1, values.length - 1);
        const y = padding.top + chartHeight - (value / maxValue) * chartHeight;
        if (idx === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();

      ctx.strokeStyle = 'rgba(121, 192, 255, 0.2)';
      ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight);
      ctx.lineTo(padding.left, padding.top + chartHeight);
      ctx.closePath();
      ctx.fillStyle = 'rgba(121, 192, 255, 0.08)';
      ctx.fill();

      const labelCount = Math.min(6, labels.length);
      ctx.fillStyle = '#8b949e';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let i = 0; i < labelCount; i++) {
        const idx = Math.round((labels.length - 1) * (i / Math.max(1, labelCount - 1)));
        const x = padding.left + (chartWidth * idx) / Math.max(1, labels.length - 1);
        ctx.fillText(labels[idx], x, padding.top + chartHeight + 6);
      }
    }

    async function loadSubmissionsPerDayGraph() {
      const filter = document.getElementById('submissions-per-day-filter').value;
      const meta = document.getElementById('submissions-per-day-meta');
      const canvas = document.getElementById('submissions-per-day-chart');
      meta.textContent = 'Loading...';
      try {
        const data = await api('/graphs/submissions-per-day?official=' + encodeURIComponent(filter));
        const points = data.points || [];
        const { labels, values } = buildDailySeries(points);
        drawLineChart(canvas, labels, values);
        if (!points.length) {
          meta.textContent = 'No data available.';
        } else {
          const total = values.reduce((sum, val) => sum + val, 0);
          const days = values.length;
          meta.textContent = total + ' submissions across ' + days + ' days.';
        }
      } catch (err) {
        meta.textContent = 'Failed to load graph.';
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
      loadSubmissionsPerDayGraph();
      loadModels();
      loadTokens();
      loadUsers();
    }

    init();
  </script>
</body>
</html>`;
