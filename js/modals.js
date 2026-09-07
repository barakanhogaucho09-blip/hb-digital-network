const Modal = {
  open(title, bodyHtml) {
    const overlay = document.getElementById('modal-overlay');
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header"><span>${title}</span><button class="icon-btn" id="modal-close">✕</button></div>
        <div class="modal-body">${bodyHtml}</div>
      </div>
    `;
    overlay.classList.remove('hidden');
    document.getElementById('modal-close').addEventListener('click', () => this.close());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) this.close(); }, { once: true });
  },
  close() { document.getElementById('modal-overlay').classList.add('hidden'); document.getElementById('modal-overlay').innerHTML = ''; }
};

const Modals = {
  async txnForm(prefill = {}) {
    const providers = await DB.getAll('providers');
    Modal.open('New Transaction', `
      <form id="txn-form" class="form">
        <div class="error" id="txn-error"></div>
        <label>Provider
          <select name="provider_id" required>
            <option value="">Select provider</option>
            ${providers.map(p => `<option value="${p.id}" ${prefill.provider_id === p.id ? 'selected' : ''}>${p.name}</option>`).join('')}
          </select>
        </label>
        <label>Type
          <select name="type" required>
            ${Transactions.TYPES.map(t => `<option ${prefill.type === t ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
        </label>
        <label>Customer Name<input name="customer_name" placeholder="Optional"></label>
        <label>Customer Phone<input name="customer_phone" placeholder="07XXXXXXXX"></label>
        <label>Amount<input name="amount" type="number" step="1" required></label>
        <label>Commission<input name="commission" type="number" step="1" value="0"></label>
        <label>Agent Fee<input name="agent_fee" type="number" step="1" value="0"></label>
        <label>Reference<input name="reference" placeholder="Optional"></label>
        <label>Notes<textarea name="notes"></textarea></label>
        <button class="btn primary full" type="submit">Save Transaction</button>
      </form>
    `);
    document.getElementById('txn-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      try {
        await Transactions.create(data);
        Modal.close();
        App.toast('Transaction saved successfully.');
        Screens[App.currentTab] ? Screens[App.currentTab]() : Screens.dashboard();
      } catch (ex) {
        document.getElementById('txn-error').textContent = ex.message;
      }
    });
  },

  async txnDetail(id) {
    const t = await DB.get('transactions', id);
    if (!t) return;
    Modal.open('Transaction Detail', `
      <div class="detail-card">
        <div class="detail-row"><span>Type</span><b>${t.type}</b></div>
        <div class="detail-row"><span>Provider</span><b>${t.provider_id}</b></div>
        <div class="detail-row"><span>Amount</span><b>${fmt(t.amount)}</b></div>
        <div class="detail-row"><span>Commission</span><b>${fmt(t.commission)}</b></div>
        <div class="detail-row"><span>Customer</span><b>${t.customer_name || '—'}</b></div>
        <div class="detail-row"><span>Phone</span><b>${t.customer_phone || '—'}</b></div>
        <div class="detail-row"><span>Reference</span><b>${t.reference || '—'}</b></div>
        <div class="detail-row"><span>Status</span><b>${t.status}</b></div>
        <div class="detail-row"><span>Date/Time</span><b>${t.date} ${t.time}</b></div>
      </div>
      <div class="btn-row">
        <button class="btn secondary" id="btn-edit-txn">Edit</button>
        <button class="btn danger" id="btn-del-txn">Delete</button>
      </div>
    `);
    document.getElementById('btn-del-txn').addEventListener('click', async () => {
      if (!App.confirm('Delete this transaction? This will reverse its balance effect.')) return;
      await Transactions.delete(id);
      Modal.close();
      App.toast('Transaction deleted.');
      Screens[App.currentTab]();
    });
    document.getElementById('btn-edit-txn').addEventListener('click', () => this.txnEditForm(t));
  },

  async txnEditForm(t) {
    Modal.open('Edit Transaction', `
      <form id="txn-edit-form" class="form">
        <div class="error" id="txn-edit-error"></div>
        <label>Amount<input name="amount" type="number" value="${t.amount}" required></label>
        <label>Commission<input name="commission" type="number" value="${t.commission}"></label>
        <label>Status
          <select name="status">
            ${['Completed', 'Pending', 'Cancelled'].map(s => `<option ${t.status === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </label>
        <label>Notes<textarea name="notes">${t.notes || ''}</textarea></label>
        <button class="btn primary full" type="submit">Update</button>
      </form>
    `);
    document.getElementById('txn-edit-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      try {
        await Transactions.update(t.id, data);
        Modal.close();
        App.toast('Transaction updated.');
        Screens[App.currentTab]();
      } catch (ex) { document.getElementById('txn-edit-error').textContent = ex.message; }
    });
  },

  async customerForm() {
    Modal.open('Add Customer', `
      <form id="cust-form" class="form">
        <div class="error" id="cust-error"></div>
        <label>Name<input name="name" required></label>
        <label>Phone<input name="phone" placeholder="07XXXXXXXX"></label>
        <button class="btn primary full" type="submit">Save Customer</button>
      </form>
    `);
    document.getElementById('cust-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      try {
        await Customers.create(data);
        Modal.close();
        App.toast('Customer saved successfully.');
        Screens[App.currentTab]();
      } catch (ex) { document.getElementById('cust-error').textContent = ex.message; }
    });
  },

  async customerDetail(id) {
    const c = await Customers.get(id);
    const history = await Customers.history(id);
    Modal.open(c.name, `
      <div class="detail-card">
        <div class="detail-row"><span>Phone</span><b>${c.phone || '—'}</b></div>
        <div class="detail-row"><span>Total Transactions</span><b>${c.total_transactions}</b></div>
        <div class="detail-row"><span>Total Amount</span><b>${fmt(c.total_amount)}</b></div>
      </div>
      <div class="section-title">History</div>
      <div class="list">${history.length ? history.map(t => Templates.txnRow(t)).join('') : '<div class="empty">No transactions yet.</div>'}</div>
      <div class="btn-row">
        <button class="btn secondary" id="btn-edit-cust">Edit</button>
        <button class="btn danger" id="btn-del-cust">Delete</button>
      </div>
    `);
    document.getElementById('btn-edit-cust').addEventListener('click', () => this.customerEditForm(c));
    document.getElementById('btn-del-cust').addEventListener('click', async () => {
      if (!App.confirm('Delete this customer?')) return;
      try { await Customers.delete(id); Modal.close(); App.toast('Customer deleted.'); Screens[App.currentTab](); }
      catch (ex) { alert(ex.message); }
    });
  },

  customerEditForm(c) {
    Modal.open('Edit Customer', `
      <form id="cust-edit-form" class="form">
        <div class="error" id="cust-edit-error"></div>
        <label>Name<input name="name" value="${c.name}" required></label>
        <label>Phone<input name="phone" value="${c.phone || ''}"></label>
        <button class="btn primary full" type="submit">Update</button>
      </form>
    `);
    document.getElementById('cust-edit-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      try { await Customers.update(c.id, data); Modal.close(); App.toast('Customer updated.'); Screens[App.currentTab](); }
      catch (ex) { document.getElementById('cust-edit-error').textContent = ex.message; }
    });
  },

  expenseForm() {
    Modal.open('Add Expense', `
      <form id="exp-form" class="form">
        <div class="error" id="exp-error"></div>
        <label>Category
          <select name="category" required>${Expenses.CATEGORIES.map(c => `<option>${c}</option>`).join('')}</select>
        </label>
        <label>Description<input name="description"></label>
        <label>Amount<input name="amount" type="number" required></label>
        <label>Payment Method
          <select name="payment_method"><option>Cash</option><option>Mobile Money</option></select>
        </label>
        <label>Notes<textarea name="notes"></textarea></label>
        <button class="btn primary full" type="submit">Save Expense</button>
      </form>
    `);
    document.getElementById('exp-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      try { await Expenses.create(data); Modal.close(); App.toast('Expense saved successfully.'); Screens[App.currentTab](); }
      catch (ex) { document.getElementById('exp-error').textContent = ex.message; }
    });
  },

  async expenseDetail(id) {
    const e = await DB.get('expenses', id);
    Modal.open('Expense', `
      <div class="detail-card">
        <div class="detail-row"><span>Category</span><b>${e.category}</b></div>
        <div class="detail-row"><span>Amount</span><b>${fmt(e.amount)}</b></div>
        <div class="detail-row"><span>Date</span><b>${e.date}</b></div>
        <div class="detail-row"><span>Payment Method</span><b>${e.payment_method}</b></div>
        <div class="detail-row"><span>Notes</span><b>${e.notes || '—'}</b></div>
      </div>
      <div class="btn-row"><button class="btn danger full" id="btn-del-exp">Delete</button></div>
    `);
    document.getElementById('btn-del-exp').addEventListener('click', async () => {
      if (!App.confirm('Delete this expense?')) return;
      await Expenses.delete(id);
      Modal.close();
      App.toast('Expense deleted.');
      Screens[App.currentTab]();
    });
  },

  balanceAdjust(provider_id) {
    Modal.open('Adjust Balance', `
      <form id="bal-form" class="form">
        <div class="error" id="bal-error"></div>
        <label>New Balance<input name="amount" type="number" required></label>
        <label>Reason<input name="reason" placeholder="e.g. Top-up, correction"></label>
        <button class="btn primary full" type="submit">Update Balance</button>
      </form>
    `);
    document.getElementById('bal-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      try {
        await Balances.adjust(provider_id, Number(data.amount), data.reason);
        Modal.close();
        App.toast('Balance updated.');
        Screens[App.currentTab]();
      } catch (ex) { document.getElementById('bal-error').textContent = ex.message; }
    });
  },

  reconciliationForm(balances) {
    Modal.open("Today's Reconciliation", `
      <form id="recon-form" class="form">
        <div class="error" id="recon-error"></div>
        ${balances.map(b => `
          <div class="recon-pair">
            <div class="recon-label">${b.provider ? b.provider.name : b.provider_id}</div>
            <input name="${b.provider_id}_expected" type="number" placeholder="Expected" value="${b.current_balance}" required>
            <input name="${b.provider_id}_actual" type="number" placeholder="Actual" required>
          </div>
        `).join('')}
        <button class="btn primary full" type="submit">Run Reconciliation</button>
      </form>
    `);
    document.getElementById('recon-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      const entries = {};
      balances.forEach(b => {
        entries[b.provider_id] = { expected: data[`${b.provider_id}_expected`], actual: data[`${b.provider_id}_actual`] };
      });
      try {
        const result = await Reconciliation.run({ entries });
        Modal.close();
        App.toast(`Reconciliation complete: ${result.status}`, result.status === 'Balanced' ? 'success' : 'warn');
        Screens[App.currentTab]();
      } catch (ex) { document.getElementById('recon-error').textContent = ex.message; }
    });
  },

  changePin() {
    Modal.open('Change PIN', `
      <form id="pin-change-form" class="form">
        <div class="error" id="pin-change-error"></div>
        <label>Current PIN<input name="old_pin" type="password" inputmode="numeric" required></label>
        <label>New PIN<input name="new_pin" type="password" inputmode="numeric" required></label>
        <button class="btn primary full" type="submit">Update PIN</button>
      </form>
    `);
    document.getElementById('pin-change-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      try {
        await Auth.changePin(data.old_pin, data.new_pin);
        Modal.close();
        App.toast('PIN changed successfully.');
      } catch (ex) { document.getElementById('pin-change-error').textContent = ex.message; }
    });
  }
};

window.Modal = Modal;
window.Modals = Modals;
