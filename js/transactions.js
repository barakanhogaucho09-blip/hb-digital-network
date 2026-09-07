const TXN_TYPES = ['Cash In', 'Cash Out', 'Deposit', 'Withdrawal', 'Send Money', 'Receive Money', 'Bill Payment', 'Airtime', 'Other'];

function validatePhone(phone) {
  const cleaned = (phone || '').replace(/\s+/g, '');
  return /^(0|\+255|255)?[67]\d{8}$/.test(cleaned);
}

function validateTxnInput({ provider_id, type, amount }) {
  const errors = [];
  if (!provider_id) errors.push('Please select a provider.');
  if (!type || !TXN_TYPES.includes(type)) errors.push('Please select a valid transaction type.');
  if (amount === undefined || amount === null || isNaN(amount)) errors.push('Please enter a valid amount.');
  else if (Number(amount) <= 0) errors.push('Amount must be greater than zero.');
  return errors;
}

function computeBalanceDeltas(type, amount) {
  const amt = Number(amount);
  switch (type) {
    case 'Cash In': return { cash: amt, provider: -amt };
    case 'Cash Out': return { cash: -amt, provider: amt };
    case 'Deposit':
    case 'Receive Money': return { cash: 0, provider: amt };
    case 'Withdrawal':
    case 'Send Money':
    case 'Bill Payment':
    case 'Airtime': return { cash: 0, provider: -amt };
    default: return { cash: 0, provider: 0 };
  }
}

const Transactions = {
  TYPES: TXN_TYPES,

  async create(input) {
    const errors = validateTxnInput(input);
    if (input.customer_phone && !validatePhone(input.customer_phone)) {
      errors.push('Please enter a valid Tanzanian phone number.');
    }
    if (errors.length) throw new Error(errors.join(' '));

    const amount = Number(input.amount);
    const commission = input.commission ? Number(input.commission) : 0;
    const fee = input.agent_fee ? Number(input.agent_fee) : 0;

    let customer_id = input.customer_id || null;
    if (!customer_id && input.customer_name) {
      const customer = await Customers.findOrCreate(input.customer_name, input.customer_phone);
      customer_id = customer.id;
    }

    const record = {
      id: DB.genId('txn'),
      date: input.date || new Date().toISOString().slice(0, 10),
      time: input.time || new Date().toTimeString().slice(0, 5),
      provider_id: input.provider_id,
      type: input.type,
      customer_id,
      customer_name: input.customer_name || '',
      customer_phone: input.customer_phone || '',
      amount,
      commission,
      agent_fee: fee,
      reference: input.reference || '',
      status: input.status || 'Completed',
      notes: input.notes || ''
    };

    await DB.put('transactions', record);

    if (record.status === 'Completed') {
      const deltas = computeBalanceDeltas(record.type, amount);
      if (deltas.cash !== 0) await Balances.applyDelta('cash', deltas.cash, 'Transaction ' + record.id);
      if (deltas.provider !== 0) await Balances.applyDelta(record.provider_id, deltas.provider, 'Transaction ' + record.id);
    }

    if (customer_id) await Customers.recalcStats(customer_id);

    return record;
  },

  async update(id, changes) {
    const existing = await DB.get('transactions', id);
    if (!existing) throw new Error('Transaction not found.');

    if (existing.status === 'Completed') {
      const oldDeltas = computeBalanceDeltas(existing.type, existing.amount);
      if (oldDeltas.cash !== 0) await Balances.applyDelta('cash', -oldDeltas.cash, 'Reversal for edit ' + id);
      if (oldDeltas.provider !== 0) await Balances.applyDelta(existing.provider_id, -oldDeltas.provider, 'Reversal for edit ' + id);
    }

    const merged = { ...existing, ...changes };
    const errors = validateTxnInput(merged);
    if (errors.length) throw new Error(errors.join(' '));

    await DB.put('transactions', merged);

    if (merged.status === 'Completed') {
      const newDeltas = computeBalanceDeltas(merged.type, merged.amount);
      if (newDeltas.cash !== 0) await Balances.applyDelta('cash', newDeltas.cash, 'Edit ' + id);
      if (newDeltas.provider !== 0) await Balances.applyDelta(merged.provider_id, newDeltas.provider, 'Edit ' + id);
    }

    if (merged.customer_id) await Customers.recalcStats(merged.customer_id);
    return merged;
  },

  async delete(id) {
    const existing = await DB.get('transactions', id);
    if (!existing) throw new Error('Transaction not found.');

    if (existing.status === 'Completed') {
      const deltas = computeBalanceDeltas(existing.type, existing.amount);
      if (deltas.cash !== 0) await Balances.applyDelta('cash', -deltas.cash, 'Delete ' + id);
      if (deltas.provider !== 0) await Balances.applyDelta(existing.provider_id, -deltas.provider, 'Delete ' + id);
    }

    await DB.delete('transactions', id);
    if (existing.customer_id) await Customers.recalcStats(existing.customer_id);
    return true;
  },

  async list({ date, provider_id, type, customer_id, status, search } = {}) {
    let all = await DB.getAll('transactions');
    if (date) all = all.filter(t => t.date === date);
    if (provider_id) all = all.filter(t => t.provider_id === provider_id);
    if (type) all = all.filter(t => t.type === type);
    if (customer_id) all = all.filter(t => t.customer_id === customer_id);
    if (status) all = all.filter(t => t.status === status);
    if (search) {
      const q = search.toLowerCase();
      all = all.filter(t =>
        (t.customer_name || '').toLowerCase().includes(q) ||
        (t.customer_phone || '').includes(q) ||
        (t.reference || '').toLowerCase().includes(q) ||
        (t.id || '').toLowerCase().includes(q)
      );
    }
    return all.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  },

  async todaysSummary() {
    const today = new Date().toISOString().slice(0, 10);
    const txns = await this.list({ date: today, status: 'Completed' });
    let cashIn = 0, cashOut = 0, commission = 0;
    txns.forEach(t => {
      const d = computeBalanceDeltas(t.type, t.amount);
      if (d.cash > 0) cashIn += d.cash;
      if (d.cash < 0) cashOut += Math.abs(d.cash);
      commission += Number(t.commission || 0) + Number(t.agent_fee || 0);
    });
    return { count: txns.length, cashIn, cashOut, commission, transactions: txns };
  }
};

window.Transactions = Transactions;
window.validatePhone = validatePhone;
