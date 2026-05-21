// This file runs before test files are loaded. It must NOT import testing libraries
// because Jest's expect/globals are not yet available here.

// Provide a lightweight `chrome` mock for tests. Use `any` casts to avoid conflicts
// with `@types/chrome` ambient types (we only need basic storage/runtime behavior).
// This file runs before Jest's environment is wired up, so DO NOT call `jest.fn()` here.
if (!(globalThis as any).chrome) {
  (globalThis as any).chrome = {
    storage: {
      local: {
        store: {} as Record<string, unknown>,
        set: async (items: Record<string, unknown>) => {
          Object.assign((globalThis as any).chrome.storage.local.store, items);
        },
        get: async (keys: any) => {
          const result: Record<string, unknown> = {};
          const klist = Array.isArray(keys) ? keys : [keys];
          klist.forEach((key: string) => {
            result[key] = (globalThis as any).chrome.storage.local.store[key];
          });
          return result;
        },
        clear: async () => {
          (globalThis as any).chrome.storage.local.store = {};
        },
      },
      session: {
        store: {} as Record<string, unknown>,
        set: async (items: Record<string, unknown>) => {
          Object.assign((globalThis as any).chrome.storage.session.store, items);
        },
        get: async (keys: any) => {
          const result: Record<string, unknown> = {};
          const klist = Array.isArray(keys) ? keys : [keys];
          klist.forEach((key: string) => {
            result[key] = (globalThis as any).chrome.storage.session.store[key];
          });
          return result;
        },
        clear: async () => {
          (globalThis as any).chrome.storage.session.store = {};
        },
      },
    },
    runtime: {
      // Use no-op placeholders here; tests will replace with `jest.fn()` in
      // `setupTests.ts` (which runs after the Jest environment is available).
      sendMessage: (..._args: any[]) => {},
      lastError: undefined,
      onMessage: {
        addListener: (..._args: any[]) => {},
        removeListener: (..._args: any[]) => {},
      },
    },
  } as any;
}

// Provide a resilient fetch shim that exposes the jest-style helpers
// (`mockResolvedValue`, `mockRejectedValue`) even before Jest is available.
// When `mockResolvedValue` is called later (during tests), it will upgrade
// the global `fetch` into a real `jest.fn()` mock if Jest exists at that time.
{
  const nativeFetch = (globalThis as any).fetch;

  const _f: any = (...args: any[]) => {
    if (_f._rej) return Promise.reject(_f._rej);
    if (_f._res !== undefined) return Promise.resolve(_f._res);
    // Fallback to native fetch if available
    if (typeof nativeFetch === "function") return nativeFetch(...args);
    return Promise.resolve({ ok: true, json: async () => ({}) });
  };

  _f.mockResolvedValue = (v: any) => {
    // If Jest is available now, replace with a real jest mock for richer API
    if (typeof (globalThis as any).jest === "object" && typeof (globalThis as any).jest.fn === "function") {
      const m = (globalThis as any).jest.fn().mockResolvedValue(v);
      (globalThis as any).fetch = m;
      return m;
    }
    _f._res = v;
    return _f;
  };

  _f.mockRejectedValue = (v: any) => {
    if (typeof (globalThis as any).jest === "object" && typeof (globalThis as any).jest.fn === "function") {
      const m = (globalThis as any).jest.fn().mockRejectedValue(v);
      (globalThis as any).fetch = m;
      return m;
    }
    _f._rej = v;
    return _f;
  };

  (globalThis as any).fetch = _f;
}

// Provide a clipboard mock for tests that interact with navigator.clipboard
if (!(globalThis as any).navigator) (globalThis as any).navigator = {};
if (!(globalThis as any).navigator.clipboard) {
  // Provide a promise-returning stub; tests will replace with a jest mock.
  (globalThis as any).navigator.clipboard = { writeText: (_: string) => Promise.resolve(undefined) };
}
