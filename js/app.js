const fmt = (n) => Number(n || 0).toLocaleString('en-TZ', { maximumFractionDigits: 0 });
const todayStr = () => new Date().toISOString().slice(0, 10);

const App = {
  currentTab: 'home',

  async init() {
    await DB.seedDefaults();
    Auth.attachIdleListeners();
    document.getElementById('year').textContent = new Date().getFullYear();

    if (await Auth.isPinSet()) {
      this.showLockScreen();
    } else {
      this.showSetupPin();
    }

    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => this.navigate(btn.dataset.tab));
    });

    document.getElementById('main-app').classList.add('hidden');
  },

  showSetupPin() {
    document.getElementById('lock-screen').classList.remove('hidden');
    document.getElementById('main-app').classList.add('hidden');
    document.getElementById('lock-title').textContent = 'Set up your PIN';
    document.getElementById('lock-form').onsubmit = async (e) => {
      e.preventDefault();
      const pin = document.getElementById('pin-input').value;
      const confirmPin = document.getElementById('pin-confirm').value;
      const err = document.getElementById('lock-error');
      if (pin !== confirmPin) { err.textContent = 'PINs do not match.'; return; }
      try {
        await Auth.setPin(pin);
        this.unlockApp();
      } catch (ex) { err.textContent = ex.message; }
    };
    document.getElementById('pin-confirm-wrap').classList.remove('hidden');
  },

  showLockScreen() {
    document.getElementById('lock-screen').classList.remove('hidden');
    document.getElementById('main-app').classList.add('hidden');
    document.getElementById('lock-title').textContent = 'Enter PIN';
    document.getElementById('pin-confirm-wrap').classList.add('hidden');
    document.getElementById('pin-input').value = '';
    document.getElementById('lock-form').onsubmit = async (e) => {
      e.preventDefault();
      const pin = document.getElementById('pin-input').value;
      const err = document.getElementById('lock-error');
      const ok = await Auth.verifyPin(pin);
      if (ok) { err.textContent = ''; this.unlockApp(); }
      else { err.textContent = 'Incorrect PIN. Try again.'; }
    };
  },

  unlockApp() {
    document.getElementById('lock-screen').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');
    Auth.resetIdleTimer();
    this.navigate('home');
  },

  navigate(tab) {
    this.currentTab = tab;
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    const renderers = {
      home: Screens.dashboard, transactions: Screens.transactions, customers: Screens.customers,
      reports: Screens.reports, more: Screens.more
    };
    (renderers[tab] || Screens.dashboard)();
  },

  toast(message, type = 'success') {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.className = `toast show ${type}`;
    setTimeout(() => el.classList.remove('show'), 3000);
  },

  confirm(message) {
    return window.confirm(message);
  }
};

const Screens = {
  root() { return document.getElementById('screen-root'); },

  async dashboard() {
    const summary = await Transactions.todaysSummary();
    const balances = await Balances.getAll();
    const cash = balances.find(b => b.provider_id === 'cash');
    const electronic = balances.filter(b => b.provider_id !== 'cash').reduce((s, b) => s + b.current_balance, 0);
    const expensesToday = await Expenses.list({ date: todayStr() });
    const totalExpenses = expensesToday.reduce((s, e) => s + e.amount, 0);
    const recon = (await Reconciliation.list()).find(r => r.date === todayStr());
    const recent = summary.transactions.slice(0, 5);

    this.root().innerHTML = `
      <div class="header">
        <div>
          <div class="header-eyebrow">HB Digital Network</div>
          <div class="header-title">Dashboard</div>
        </div>
        <button class="icon-btn" id="btn-notifs">🔔<span id="notif-badge" class="badge hidden"></span></button>
      </div>

      <div class="stat-grid">
        <div class="stat-card"><div class="stat-label">Today's Transactions</div><div class="stat-value">${summary.count}</div></div>
        <div class="stat-card"><div class="stat-label">Cash In</div><div class="stat-value green">${fmt(summary.cashIn)}</div></div>
        <div class="stat-card"><div class="stat-label">Cash Out</div><div class="stat-value red">${fmt(summary.cashOut)}</div></div>
        <div class="stat-card"><div class="stat-label">Commission</div><div class="stat-value blue">${fmt(summary.commission)}</div></div>
        <div class="stat-card"><div class="stat-label">Expenses</div><div class="stat-value red">${fmt(totalExpenses)}</div></div>
        <div class="stat-card"><div class="stat-label">Reconciliation</div><div class="stat-value">${recon ? recon.status : 'Pending'}</div></div>
      </div>

      <div class="section-title">Balances</div>
      <div class="balance-strip">
        <div class="balance-chip cash"><span>Cash</span><b>${fmt(cash ? cash.current_balance : 0)}</b></div>
        <div class="balance-chip electronic"><span>Electronic</span><b>${fmt(electronic)}</b></div>
      </div>

      <div class="section-title">Quick Actions</div>
      <div class="quick-grid">
        <button class="quick-btn" data-action="cashin">➕ Cash In</button>
        <button class="quick-btn" data-action="cashout">➖ Cash Out</button>
        <button class="quick-btn" data-action="send">📤 Send Money</button>
        <button class="quick-btn" data-action="receive">📥 Receive Money</button>
        <button class="quick-btn" data-action="customer">👤 Add Customer</button>
        <button class="quick-btn" data-action="expense">🧾 Add Expense</button>
        <button class="quick-btn" data-action="recon">⚖️ Reconciliation</button>
        <button class="quick-btn" data-action="report">📊 Daily Report</button>
      </div>

      <div class="section-title">Recent Transactions</div>
      <div class="list">
        ${recent.length ? recent.map(t => Templates.txnRow(t)).join('') : '<div class="empty">No transactions yet today.</div>'}
      </div>
    `;

    this.root().querySelectorAll('.quick-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const map = {
          cashin: () => Modals.txnForm({ type: 'Cash In' }),
          cashout: () => Modals.txnForm({ type: 'Cash Out' }),
          send: () => Modals.txnForm({ type: 'Send Money' }),
          receive: () => Modals.txnForm({ type: 'Receive Money' }),
          customer: () => Modals.customerForm(),
          expense: () => Modals.expenseForm(),
          recon: () => { App.currentTab = 'more'; Screens.reconciliation(); },
          report: () => Screens.reportDetail(todayStr())
        };
        map[btn.dataset.action] && map[btn.dataset.action]();
      });
    });

    document.getElementById('btn-notifs').addEventListener('click', () => Screens.notifications());
    const unread = await Notifications.unreadCount();
    const badge = document.getElementById('notif-badge');
    if (unread > 0) { badge.textContent = unread; badge.classList.remove('hidden'); }
  },

  async transactions(filters = {}) {
    const txns = await Transactions.list(filters);
    this.root().innerHTML = `
      <div class="header">
        <div class="header-title">Transactions</div>
        <button class="icon-btn primary" id="btn-add-txn">+</button>
      </div>
      <div class="search-row">
        <input type="text" id="txn-search" placeholder="Search name, phone, reference..." value="${filters.search || ''}">
        <select id="txn-filter-type"><option value="">All types</option>${Transactions.TYPES.map(t => `<option ${filters.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
      </div>
      <div class="list">
        ${txns.length ? txns.map(t => Templates.txnRow(t, true)).join('') : '<div class="empty">No transactions found.</div>'}
      </div>
    `;
    document.getElementById('btn-add-txn').addEventListener('click', () => Modals.txnForm());
    document.getElementById('txn-search').addEventListener('input', (e) => this.transactions({ ...filters, search: e.target.value }));
    document.getElementById('txn-filter-type').addEventListener('change', (e) => this.transactions({ ...filters, type: e.target.value || undefined }));
    this.root().querySelectorAll('.row[data-txn]').forEach(row => {
      row.addEventListener('click', () => Modals.txnDetail(row.dataset.txn));
    });
  },

  async customers(search = '') {
    const list = await Customers.list(search);
    this.root().innerHTML = `
      <div class="header">
        <div class="header-title">Customers</div>
        <button class="icon-btn primary" id="btn-add-cust">+</button>
      </div>
      <div class="search-row"><input type="text" id="cust-search" placeholder="Search customers..." value="${search}"></div>
      <div class="list">
        ${list.length ? list.map(c => `
          <div class="row" data-cust="${c.id}">
            <div class="row-main"><div class="row-title">${c.name}</div><div class="row-sub">${c.phone || 'No phone'}</div></div>
            <div class="row-end"><div>${c.total_transactions} txns</div><div class="muted">${fmt(c.total_amount)} TZS</div></div>
          </div>`).join('') : '<div class="empty">No customers yet.</div>'}
      </div>
    `;
    document.getElementById('btn-add-cust').addEventListener('click', () => Modals.customerForm());
    document.getElementById('cust-search').addEventListener('input', (e) => this.customers(e.target.value));
    this.root().querySelectorAll('.row[data-cust]').forEach(row => {
      row.addEventListener('click', () => Modals.customerDetail(row.dataset.cust));
    });
  },

  async reports() {
    const reports = await Reports.list();
    this.root().innerHTML = `
      <div class="header"><div class="header-title">Daily Reports</div>
        <button class="icon-btn primary" id="btn-gen-report">↻</button></div>
      <div class="list">
        ${reports.length ? reports.map(r => `
          <div class="row" data-report="${r.date}">
            <div class="row-main"><div class="row-title">${r.date}</div><div class="row-sub">${r.total_transactions} txns · ${r.reconciliation_status}</div></div>
            <div class="row-end"><div class="${r.net_profit >= 0 ? 'green' : 'red'}">${fmt(r.net_profit)}</div></div>
          </div>`).join('') : '<div class="empty">No reports generated yet.</div>'}
      </div>
    `;
    document.getElementById('btn-gen-report').addEventListener('click', async () => {
      await Reports.generateDaily(todayStr());
      App.toast('Report generated for today.');
      this.reports();
    });
    this.root().querySelectorAll('.row[data-report]').forEach(row => {
      row.addEventListener('click', () => this.reportDetail(row.dataset.report));
    });
  },

  async reportDetail(date) {
    let report = (await Reports.list()).find(r => r.date === date);
    if (!report) report = await Reports.generateDaily(date);
    this.root().innerHTML = `
      <div class="header"><button class="icon-btn" id="btn-back">←</button><div class="header-title">Report — ${report.date}</div></div>
      <div class="detail-card">
        <div class="detail-row"><span>Total Transactions</span><b>${report.total_transactions}</b></div>
        <div class="detail-row"><span>Total Commission</span><b>${fmt(report.total_commission)}</b></div>
        <div class="detail-row"><span>Total Expenses</span><b>${fmt(report.total_expenses)}</b></div>
        <div class="detail-row"><span>Net Profit</span><b class="${report.net_profit >= 0 ? 'green' : 'red'}">${fmt(report.net_profit)}</b></div>
        <div class="detail-row"><span>Customers Served</span><b>${report.customers_count}</b></div>
        <div class="detail-row"><span>Reconciliation</span><b>${report.reconciliation_status}</b></div>
      </div>
      <div class="section-title">Balances Snapshot</div>
      <div class="list">${report.balances_snapshot.map(b => `<div class="row"><div class="row-main">${b.provider_id}</div><div class="row-end">${fmt(b.balance)}</div></div>`).join('')}</div>
      <div class="btn-row">
        <button class="btn secondary" id="btn-export">Export JSON</button>
        <button class="btn secondary" id="btn-share">Share</button>
      </div>
    `;
    document.getElementById('btn-back').addEventListener('click', () => App.navigate('reports'));
    document.getElementById('btn-export').addEventListener('click', () => Actions.exportReport(report));
    document.getElementById('btn-share').addEventListener('click', () => Actions.shareReport(report));
  },

  async more() {
    this.root().innerHTML = `
      <div class="header"><div class="header-title">More</div></div>
      <div class="menu-list">
        <div class="menu-item" data-go="balances">💰 Balances</div>
        <div class="menu-item" data-go="expenses">🧾 Expenses</div>
        <div class="menu-item" data-go="reconciliation">⚖️ Reconciliation</div>
        <div class="menu-item" data-go="statistics">📈 Statistics</div>
        <div class="menu-item" data-go="backup">💾 Backup & Restore</div>
        <div class="menu-item" data-go="settings">⚙️ Settings</div>
        <div class="menu-item" data-go="about">ℹ️ About</div>
      </div>
    `;
    this.root().querySelectorAll('.menu-item').forEach(item => {
      item.addEventListener('click', () => this[item.dataset.go]());
    });
  },

  async balances() {
    const balances = await Balances.getAll();
    this.root().innerHTML = `
      <div class="header"><button class="icon-btn" id="btn-back">←</button><div class="header-title">Balances</div></div>
      <div class="list">
        ${balances.map(b => `
          <div class="row" data-bal="${b.provider_id}">
            <div class="row-main"><div class="row-title">${b.provider ? b.provider.name : b.provider_id}</div><div class="row-sub">Updated ${new Date(b.last_updated).toLocaleString()}</div></div>
            <div class="row-end"><b>${fmt(b.current_balance)}</b></div>
          </div>`).join('')}
      </div>
    `;
    document.getElementById('btn-back').addEventListener('click', () => App.navigate('more'));
    this.root().querySelectorAll('.row[data-bal]').forEach(row => {
      row.addEventListener('click', () => Modals.balanceAdjust(row.dataset.bal));
    });
  },

  async expenses() {
    const list = await Expenses.list();
    this.root().innerHTML = `
      <div class="header"><button class="icon-btn" id="btn-back">←</button><div class="header-title">Expenses</div>
        <button class="icon-btn primary" id="btn-add-exp">+</button></div>
      <div class="list">
        ${list.length ? list.map(e => `
          <div class="row" data-exp="${e.id}">
            <div class="row-main"><div class="row-title">${e.category}</div><div class="row-sub">${e.date} · ${e.description || ''}</div></div>
            <div class="row-end red">${fmt(e.amount)}</div>
          </div>`).join('') : '<div class="empty">No expenses recorded.</div>'}
      </div>
    `;
    document.getElementById('btn-back').addEventListener('click', () => App.navigate('more'));
    document.getElementById('btn-add-exp').addEventListener('click', () => Modals.expenseForm());
    this.root().querySelectorAll('.row[data-exp]').forEach(row => {
      row.addEventListener('click', () => Modals.expenseDetail(row.dataset.exp));
    });
  },

  async reconciliation() {
    const balances = await Balances.getAll();
    const list = await Reconciliation.list();
    this.root().innerHTML = `
      <div class="header"><button class="icon-btn" id="btn-back">←</button><div class="header-title">Reconciliation</div></div>
      <button class="btn primary full" id="btn-run-recon">Run Today's Reconciliation</button>
      <div class="section-title">History</div>
      <div class="list">
        ${list.length ? list.map(r => `
          <div class="row"><div class="row-main"><div class="row-title">${r.date}</div></div>
          <div class="row-end status-${r.status.toLowerCase()}">${r.status}</div></div>`).join('') : '<div class="empty">No reconciliations yet.</div>'}
      </div>
    `;
    document.getElementById('btn-back').addEventListener('click', () => App.navigate('more'));
    document.getElementById('btn-run-recon').addEventListener('click', () => Modals.reconciliationForm(balances));
  },

  async statistics() {
    const txns = await DB.getAll('transactions');
    const byProvider = {};
    txns.forEach(t => byProvider[t.provider_id] = (byProvider[t.provider_id] || 0) + 1);
    const providers = await DB.getAll('providers');
    const max = Math.max(1, ...Object.values(byProvider));
    this.root().innerHTML = `
      <div class="header"><button class="icon-btn" id="btn-back">←</button><div class="header-title">Statistics</div></div>
      <div class="section-title">Transactions by Provider</div>
      <div class="bar-chart">
        ${providers.map(p => `
          <div class="bar-row">
            <span class="bar-label">${p.name}</span>
            <div class="bar-track"><div class="bar-fill" style="width:${((byProvider[p.id] || 0) / max) * 100}%; background:${p.color}"></div></div>
            <span class="bar-value">${byProvider[p.id] || 0}</span>
          </div>`).join('')}
      </div>
    `;
    document.getElementById('btn-back').addEventListener('click', () => App.navigate('more'));
  },

  async backup() {
    this.root().innerHTML = `
      <div class="header"><button class="icon-btn" id="btn-back">←</button><div class="header-title">Backup & Restore</div></div>
      <div class="detail-card">
        <button class="btn primary full" id="btn-export-json">Export Full Backup (JSON)</button>
        <button class="btn secondary full" id="btn-export-txn-csv">Export Transactions (CSV)</button>
        <label class="btn secondary full" for="import-file">Restore from Backup</label>
        <input type="file" id="import-file" accept=".json" class="hidden">
        <button class="btn danger full" id="btn-clear-data">Clear All Data</button>
      </div>
    `;
    document.getElementById('btn-back').addEventListener('click', () => App.navigate('more'));
    document.getElementById('btn-export-json').addEventListener('click', () => Actions.downloadBackup());
    document.getElementById('btn-export-txn-csv').addEventListener('click', () => Actions.downloadCSV('transactions'));
    document.getElementById('import-file').addEventListener('change', (e) => Actions.restoreBackup(e.target.files[0]));
    document.getElementById('btn-clear-data').addEventListener('click', () => Actions.clearAllData());
  },

  async settings() {
    const biz = (await DB.get('settings', 'business')) || { value: {} };
    const b = biz.value || {};
    this.root().innerHTML = `
      <div class="header"><button class="icon-btn" id="btn-back">←</button><div class="header-title">Settings</div></div>
      <form id="settings-form" class="form">
        <label>Business Name<input name="business_name" value="${b.business_name || ''}"></label>
        <label>Agent Name<input name="agent_name" value="${b.agent_name || ''}"></label>
        <label>Phone Number<input name="phone" value="${b.phone || ''}"></label>
        <label>Business Location<input name="location" value="${b.location || ''}"></label>
        <label>Currency<input name="currency" value="${b.currency || 'TZS'}"></label>
        <button class="btn primary full" type="submit">Save</button>
      </form>
      <div class="section-title">Security</div>
      <button class="btn secondary full" id="btn-change-pin">Change PIN</button>
      <div class="section-title">Appearance</div>
      <div class="theme-toggle">
        <button class="btn secondary" id="theme-light">☀️ Light</button>
        <button class="btn secondary" id="theme-dark">🌙 Dark</button>
      </div>
    `;
    document.getElementById('btn-back').addEventListener(
