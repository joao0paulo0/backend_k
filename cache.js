// Simple in-memory cache implementation
const cache = new Map();

module.exports = {
  async get(key) {
    const item = cache.get(key);
    if (!item) return null;
    
    if (item.expiry && item.expiry < Date.now()) {
      cache.delete(key);
      return null;
    }
    
    return item.value;
  },
  
  async set(key, value, expirySeconds) {
    const item = {
      value,
      expiry: expirySeconds ? Date.now() + (expirySeconds * 1000) : null
    };
    cache.set(key, item);
    return true;
  },
  
  async del(key) {
    return cache.delete(key);
  }
}; 