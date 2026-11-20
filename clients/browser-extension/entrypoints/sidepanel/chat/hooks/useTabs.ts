import { useCallback, useEffect, useState } from "react";
import { browser, type Browser } from "wxt/browser";

/** Open tabs, for @-mentions. Refresh before showing the menu. */
export function useTabs() {
	const [tabs, setTabs] = useState<Browser.tabs.Tab[]>([]);
	const refresh = useCallback(async () => {
		try {
			setTabs((await browser.tabs.query({})) as Browser.tabs.Tab[]);
		} catch (error) {
			console.error("Failed to fetch tabs:", error);
		}
	}, []);
	useEffect(() => {
		refresh();
	}, [refresh]);
	return { tabs, refresh };
}
