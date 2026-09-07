const Actions = {
  downloadFile(filename, content, mime = 'application/json') {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  async downloadBackup() {
    const json = await Backup.exportJSON();
    this.downloadFile(`hb_digital_backup_${todayStr()}.json`, json);
    App.toast('Backup exported.');
  },

  async downloadCSV(storeName) {
    const csv = await Backup.exportCSV(storeName);
    if (!csv) { App.toast('No data to export.', 'warn'); return; }
    this.downloadFile(`${storeName}_${todayStr()}.csv`, csv, 'text/csv');
    App.toast('CSV exported.');
  },

  async exportReport(report) {
    this.downloadFile(`report_${report.date}.json`, JSON.stringify(report, null, 2));
    App.toast('Report exported.');
  },

  async shareReport(report) {
    const text = `HB Digital Network — Daily Report (${report.date})\nTransactions: ${report.total_transactions}\nCommission: ${fmt(report.total_commission)}\nExpenses: ${fmt(report.total_expenses)}\nNet Profit: ${fmt(report.net_profit)}\nReconciliation: ${report.reconciliation_status}`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Daily Report', text }); }
      catch (e) { /* user cancelled */ }
    } else {
      await navigator.clipboard.writeText(text);
      App.toast('Report copied to clipboard.');
    }
  },

  async restoreBackup(file) {
    if (!file) return;
    const text = await file.text();
    try {
      await Backup.importJSON(text);
      App.toast('Backup restored successfully.');
      App.navigate('home');
    } catch (ex) { App.toast(ex.message, 'error'); }
  },

  async clearAllData() {
    if (!App.confirm('This will permanently delete ALL data (transactions, customers, balances, everything). This cannot be undone. Continue?')) return;
    if (!App.confirm('Are you absolutely sure? Type OK to confirm final deletion.')) return;
    await DB.clearAll();
    await DB.seedDefaults();
    App.toast('All data cleared.');
    App.navigate('home');
  },

  setTheme(mode) {
    document.documentElement.setAttribute('data-theme', mode);
    localStorage.setItem('hbdn_theme', mode);
    App.toast(`${mode === 'dark' ? 'Dark' : 'Light'} mode enabled.`);
  }
};

window.Actions = Actions;

(function () {
  const saved = localStorage.getItem('hbdn_theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);
})();
