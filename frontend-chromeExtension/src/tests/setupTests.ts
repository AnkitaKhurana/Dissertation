import "@testing-library/jest-dom";
import { setupServer } from "msw/node";

import { handlers } from "./msw/handlers";

declare global {
  // eslint-disable-next-line no-var
  var chrome: any;
}

const server = setupServer(...handlers);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

if (!global.chrome) {
  global.chrome = {
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
      session: {
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
}

if (!global.fetch) {
  global.fetch = jest.fn();
}
