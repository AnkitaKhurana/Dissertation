import { ExtensionMessage } from "../extension/types";

export function sendMessage<T = unknown>(message: ExtensionMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!chrome?.runtime?.sendMessage) {
      reject(new Error("Chrome runtime unavailable"));
      return;
    }

    chrome.runtime.sendMessage(message, (response: T) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(lastError);
      } else {
        resolve(response);
      }
    });
  });
}
