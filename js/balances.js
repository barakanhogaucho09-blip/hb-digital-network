const Balances = {
  async getAll() {
    const balances = await DB.getAll('balances');
    const providers = await DB.getAll('providers');
    const map = Object.fromEntries(providers.map(p => [p.id, p]));
    return balances.map(b => ({ ...b, provider: map[b.provider_id] })).sort((a, b) =>
      (a.provider_id === 'cash' ? -1 : 1) - (b.provider_id === 'cash' ? -1 : 1)
    );
  },

  async get(provider_id) {
    return DB.get('balances', provider_id);
  },

  async applyDelta(provider_id, delta, reason = '') {
    let bal = await DB.get('balances', provider_id);
    if (!bal) {
      bal = { provider_id, opening_balance: 0, current_balance: 0, last_updated: new Date().toISOString() };
    }
    const before = bal.current_balance;
    const after = before + delta;
    bal.current_balance = after;
    bal.last_updated = new Date().toISOString();
    await DB.put('balances', bal);

    await DB.put('balance_history', {
      id: DB.genId('bh'),
      provider_id,
      type: delta >= 0 ? 'increase' : 'decrease',
      amount: Math.abs(delta),
      before,
      after,
      reason,
      date: new Date().toISOString().slice(0, 10)
    });

    await Notifications.checkLowBalance(provider_id, after);
    return bal;
  },

  async setOpeningBalance(provider_id, amount) {
    if (isNaN(amount) || amount < 0) throw new Err
