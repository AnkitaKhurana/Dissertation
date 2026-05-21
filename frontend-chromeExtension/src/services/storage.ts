type StorageValue = string | number | boolean | Record<string, unknown> | Array<unknown> | null;

const memoryStore = new Map<string, StorageValue>();
const sessionMemoryStore = new Map<string, StorageValue>();

const isChromeStorageAvailable = () => typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;
const isChromeSessionAvailable = () => typeof chrome !== "undefined" && chrome.storage && chrome.storage.session;

export async function savePreference(key: string, value: StorageValue): Promise<void> {
  if (isChromeStorageAvailable()) {
    await chrome.storage.local.set({ [key]: value });
    return;
  }
  memoryStore.set(key, value);
}

export async function loadPreference<T extends StorageValue>(key: string): Promise<T | null> {
  if (isChromeStorageAvailable()) {
    const result = await chrome.storage.local.get([key]);
    return (result[key] as T) ?? null;
  }
  return (memoryStore.get(key) as T) ?? null;
}

export async function saveSessionValue(key: string, value: StorageValue): Promise<void> {
  if (isChromeSessionAvailable()) {
    await chrome.storage.session.set({ [key]: value });
    return;
  }
  sessionMemoryStore.set(key, value);
}

export async function loadSessionValue<T extends StorageValue>(key: string): Promise<T | null> {
  if (isChromeSessionAvailable()) {
    const result = await chrome.storage.session.get([key]);
    return (result[key] as T) ?? null;
  }
  return (sessionMemoryStore.get(key) as T) ?? null;
}

export async function clearPreferences(): Promise<void> {
  if (isChromeStorageAvailable()) {
    await chrome.storage.local.clear();
    return;
  }
  memoryStore.clear();
}

export async function clearSession(): Promise<void> {
  if (isChromeSessionAvailable()) {
    await chrome.storage.session.clear();
    return;
  }
  sessionMemoryStore.clear();
}
