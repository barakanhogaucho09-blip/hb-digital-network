const Customers = {
  async create({ name, phone }) {
    if (!name || !name.trim()) throw new Error('Please enter a customer name.');
    if (phone && !validatePhone(phone)) throw new Error('Please enter a valid Tanzanian phone number.');

    if (phone) {
      const existing = await DB.byIndex('customers', 'phone', phone);
      if (existing.length) throw new Error('A customer with this phone number already exists.');
    }

    const record = {
      id: DB.genId('cust'),
      name: name.trim(),
      phone: phone || '',
      total_transactions: 0,
      total_amount: 0
    };
    await DB.put('customers', record);
    return record;
  },

  async findOrCreate(name, phone) {
    if (phone) {
      const existing = await DB.byIndex('customers', 'phone', phone);
      if (existing.length) return existing[0];
    }
    return this.create({ name, phone });
  },

  async update(id, changes) {
    const existing = await DB.get('customers', id);
    if (!existing) throw new Error('Customer not found.');
    if (changes.phone && !validatePhone(changes.phone)) throw new Error('Please enter a valid Tanzanian phone number.');
    const merged = { ...existing, ...changes };
    await DB.put('customers', merged);
    return merged;
  },

  async delete(id) {
    const txns = await Transactions.list({ customer_id: id });
    if (txns.length > 0) {
      throw new Error(`This customer has ${txns.length} transaction(s). Delete or reassign them first.`);
    }
    await DB.delete('customers', id);
    return true;
  },

  async list(search) {
    let all = await DB.getAll('customers');
    if (search) {
      const q = search.toLowerCase();
      all = all.filter(c => c.name.toLowerCase().includes(q) || c.phone.includes(q));
    }
    return all.sort((a, b) => a.name.localeCompare(b.name));
  },

  async get(id) {
    return DB.get('customers', id);
  },

  async recalcStats(id) {
    const customer = await DB.get('customers', id);
    if (!customer) return;
    const txns = await Transactions.list({ customer_id: id });
    customer.total_transactions = txns.length;
    customer.total_amount = txns.reduce((sum, t) => sum + Number(t.amount || 0), 0);
    await DB.put('customers', customer);
  },

  async history(id) {
    return Transactions.list({ customer_id: id });
  }
};

window.Customers = Customers;
