/**
 * The model picked in the side panel. Agent requests send it as
 * X-Agentic-Provider / X-Agentic-Model headers, and the backend uses it for
 * that request only. null means "whatever the backend's default is".
 */
export type ModelChoice = { provider: string; model: string } | null;

const KEY = "pickedModel";
let current: ModelChoice = null;

export async function loadModelChoice(): Promise<ModelChoice> {
	try {
		const stored = (await browser.storage.local.get(KEY))[KEY] as ModelChoice | undefined;
		current = stored && stored.provider && stored.model ? stored : null;
	} catch {
		current = null;
	}
	return current;
}

export async function saveModelChoice(choice: ModelChoice): Promise<void> {
	current = choice;
	try {
		if (choice) await browser.storage.local.set({ [KEY]: choice });
		else await browser.storage.local.remove(KEY);
	} catch {
		// Not persisted; still used for this panel session.
	}
}

/** Headers for the picked model. Reads storage each time, so it works in
 * whichever extension context makes the request. */
export async function modelHeaders(): Promise<Record<string, string>> {
	const choice = await loadModelChoice();
	return choice ? { "X-Agentic-Provider": choice.provider, "X-Agentic-Model": choice.model } : {};
}
