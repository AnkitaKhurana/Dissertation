import { clearPreferences, loadPreference, savePreference } from "../services/storage";

describe("storage", () => {
  beforeEach(async () => {
    await clearPreferences();
  });

  it("persists and loads values", async () => {
    await savePreference("flag", true);
    const value = await loadPreference<boolean>("flag");
    expect(value).toBe(true);
  });
});
