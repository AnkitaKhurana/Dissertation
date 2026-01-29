export const chrome = {
  storage: {
    local: {
      store: {} as Record<string, unknown>,
      async set(items: Record<string, unknown>) {
        Object.assign(this.store, items);
      },
      async get(keys: string[]) {
        const result: Record<string, unknown> = {};
        keys.forEach((key) => {
          result[key] = this.store[key];
        });
        return result;
      },
      async clear() {
        this.store = {};
      },
    },
  },
  runtime: {
    sendMessage: jest.fn(),
    lastError: null,
  },
};
