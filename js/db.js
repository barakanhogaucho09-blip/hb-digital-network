const DB_NAME = 'hb_digital_network';
const DB_VERSION = 1;

const STORES = {
  users: { keyPath: 'id' },
  providers: { keyPath: 'id' },
  balances: { keyPath: 'provider_id' },
  balance_history: { keyPath: 'id', indexes: ['provider_id', 'date'] },
  customers: { keyPath: 'id', indexes: ['phone', 'name'] },
  transactions: { keyPath: 'id', indexes: ['date', 'provider_id', 'customer_id', 'type', 'status'] },
  expenses: { keyPath: 'id', indexes: ['date', 'category'] },
  reconciliations: { keyPath: 'id', indexes: ['date'] },
  reports: { keyPath: 'id', indexes: ['date'] },
  notifications: { keyPath: 'id', indexes: ['read', 'created_at'] },
  settings: { keyPath: 'key' }
};

let _db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (_db) return resolve(_db);
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      Object.entries(STORES).forEach(([name, cfg]) => {
        if (!db.objectStoreNames.contains(name)) {
          const store = db.createObjectStore(name, { keyPath: cfg.keyPath });
          (cfg.indexes || []).forEach(idx => store.createIndex(idx, idx, { unique: false }));
        }
      });
    };

    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror = (e) => reject(e.target.error);
  });
}

function tx(storeName, mode = 'readonly') {
  return openDB().then(db => db.transaction(storeName, mode).objectStore(storeName));
}

function genId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const DB = {
  genId,

  async put(storeName, record) {
    const now = new Date().toISOString();
    if (!record.created_at) record.created_at = now;
    record.updated_at = now;
    if (!record.sync_status) record.sync_status = 'local';
    const store = await tx(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.put(record);
      req.onsuccess = () => resolve(record);
      req.onerror = (e) => reject(e.target.error);
    });
  },

  async get(storeName, key) {
    const store = await tx(storeName);
    return new Promise((resolve, reject) => {
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = (e) => reject(e.target.error);
    });
  },

  async getAll(storeName) {
    const store = await tx(storeName);
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = (e) => reject(e.target.error);
    });
  },

  async delete(storeName, key) {
    const store = await tx(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.delete(key);
      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e.target.error);
    });
  },

  async byIndex(storeName, indexName, value) {
    const store = await tx(storeName);
    return new Promise((resolve, reject) => {
      const req = store.index(indexName).getAll(value);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = (e) => reject(e.target.error);
    });
  },

  async clearAll() {
    const db = await openDB();
    return Promise.all(Object.keys(STORES).map(name => new Promise((resolve, reject) => {
      const req = db.transaction(name, 'readwrite').objectStore(name).clear();
      req.onsuccess = () => resolve();
      req.onerror = (e) => reject(e.target.error);
    })));
  },

  async seedDefaults() {
    const providers = await DB.getAll('providers');
    if (providers.length > 0) return;

    const defaultProviders = [
      { id: 'mpesa', name: 'M-Pesa', color: '#3AAA35' },
      { id: 'mixx', name: 'Mixx by Yas', color: '#FFC72C' },
      { id: 'airtel', name: 'Airtel Money', color: '#ED1C24' },
      { id: 'halopesa', name: 'HaloPesa', color: '#F7931E' },
      { id: 'cash', name: 'Cash', color: '#1E88E5' }
    ];

    for (const p of defaultProviders) {
      await DB.put('providers', p);
      await DB.put('balances', {
        provider_id: p.id,
        opening_balance: 0,
        current_balance: 0,
        last_updated: new Date().toISOString()
      });
    }
  }
};

window.DB = DB;
