import "@testing-library/jest-dom";
import { setupServer } from "msw/node";

import { handlers } from "./msw/handlers";

const server = setupServer(...handlers);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// Force fetch to be a real Jest mock after the environment is ready.
Object.defineProperty(globalThis, "fetch", {
  configurable: true,
  writable: true,
  value: jest.fn(),
});

// Provide a clipboard mock for tests that interact with navigator.clipboard.
if (!(globalThis as any).navigator) (globalThis as any).navigator = {};
Object.defineProperty((globalThis as any).navigator, "clipboard", {
  configurable: true,
  writable: true,
  value: {
    writeText: jest.fn().mockResolvedValue(undefined),
  },
});

// Strengthen the chrome mock with Jest spies now that they are available.
const chromeMock = (globalThis as any).chrome;
if (chromeMock) {
  chromeMock.runtime.sendMessage = jest.fn();
  chromeMock.runtime.onMessage.addListener = jest.fn();
  chromeMock.runtime.onMessage.removeListener = jest.fn();
}


