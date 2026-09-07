const EXPENSE_CATEGORIES = ['Transport', 'Rent', 'Electricity', 'Internet', 'Salary', 'Airtime', 'Stationery', 'Maintenance', 'Other'];

const Expenses = {
  CATEGORIES: EXPENSE_CATEGORIES,

  async create({ category, description, amount, payment_method, date, notes }) {
    if (!category || !EXPENSE_CATEGORIES.includes(category)) throw new Error('Please select a valid category.');
    if (isNaN(amount) || Number(amount) <= 0) throw new Error('Please enter a valid amount.');
    const record = {
      id: DB.genId('exp'),
      date: date || new Date().toISOString().slice(0, 10),
      category, description: description || '', amount: Number(amount),
      payment_method: payment_method || 'Cash', notes: notes || ''
    };
    await DB.put('expenses', record);
    if (record.payment_method === 'Cash') await Balances.applyDelta('cash', -record.amount, 'Expense ' + record.id);
    return record;
  },

  async update(id, changes) {
    const existing = await DB.get('expenses', id);
    if (!existing) throw new Error('Expense not found.');
    if (existing.payment_method === 'Cash') await Balances.applyDelta('cash', existing.amount, 'Reversal for edit ' + id);
    const merged = { ...existing, ...changes };
    if (isNaN(merged.amount) || Number(merged.amount) <= 0) throw new Error('Please enter a valid amount.');
    await DB.put('expenses', merged);
    if (merged.payment_method === 'Cash') await Balances.applyDelta('cash', -Number(merged.amount), 'Edit ' + id);
    return merged;
  },

  async delete(id) {
    const existing = await DB.get('expenses', id);
    if (!existing) throw new Error('Expense not found.');
    if (existing.payment_method === 'Cash') await Balances.applyDelta('cash', existing.amount, 'Delete expense ' + id);
    await DB.delete('expenses', id);
    return true;
  },

  async list({ date, category } = {}) {
    let all = await DB.getAll('expenses');
    if (date) all = all.filter(e => e.date === date);
    if (category) all = all.filter(e => e.category === category);
    return all.sort((a, b) => b.date.localeCompare(a.date));
  },

  async totalForRange(startDate, endDate) {
    const all = await DB.getAll('expenses');
    return all.filter(e => e.date >= startDate && e.date <= endDate)
      .reduce((sum, e) => sum + e.amount, 0);
  }
};

const Reconciliation = {
  async run({ date, entries }) {
    const lines = {};
    let totalDiscrepancy = 0;
    for (const [key, { expected, actual }] of Object.entries(entries)) {
      const diff = Number(actual) - Number(expected);
      lines[key] = { expected: Number(expected), actual: Number(actual), diff };
      totalDiscrepancy += diff;
    }
    const status = totalDiscrepancy === 0 ? 'Balanced' : (totalDiscrepancy < 0 ? 'Short' : 'Excess');

    const record = {
      id: DB.genId('rec'),
      date: date || new Date().toISOString().slice(0, 10),
      lines, total_discrepancy: totalDiscrepancy, status
    };
    await DB.put('reconciliations', record);
    if (status !== 'Balanced') {
      await Notifications.add('reconciliation', `Reconciliation for ${record.date} is ${status} by ${Math.abs(totalDiscrepancy).toLocaleString()}.`);
    }
    return record;
  },

  async list() {
    const all = await DB.getAll('reconciliations');
    return all.sort((a, b) => b.date.localeCompare(a.date));
  }
};

const Notifications = {
  async add(type, message) {
    const record = { id: DB.genId('notif'),
