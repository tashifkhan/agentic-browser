/**
 * A soft accent glow around the edges of the page while the agent is acting
 * on it (clicking, typing, scrolling). It fades in when an action starts and
 * fades out shortly after the action ends, so a run with several steps reads
 * as a gentle pulse per action rather than a frame that stays on.
 *
 * The two page functions are injected with `scripting.executeScript`, so each
 * one must be self-contained: no imports, no closures over module values.
 */

const ACCENT = "255, 112, 59";

function glowOnInPage(accent: string) {
	const ID = "__agentic-browser-glow";
	const w = window as any;
	clearTimeout(w.__agenticBrowserGlowHide);
	let host = document.getElementById(ID);
	if (!host) {
		if (!document.getElementById(`${ID}-style`)) {
			const style = document.createElement("style");
			style.id = `${ID}-style`;
			style.textContent = `
				@keyframes __agentic-browser-glow-breathe { 0%, 100% { opacity: .7 } 50% { opacity: 1 } }
				#${ID} > div { animation: __agentic-browser-glow-breathe 2.4s ease-in-out infinite; }
				@media (prefers-reduced-motion: reduce) { #${ID} > div { animation: none; } }
			`;
			document.documentElement.appendChild(style);
		}
		host = document.createElement("div");
		host.id = ID;
		host.setAttribute("aria-hidden", "true");
		host.style.cssText =
			"position:fixed;inset:0;pointer-events:none;z-index:2147483647;opacity:0;transition:opacity .45s ease;";
		const light = document.createElement("div");
		light.style.cssText = [
			"position:absolute;inset:0;",
			`box-shadow: inset 0 0 0 1px rgba(${accent}, .30), inset 0 0 24px 2px rgba(${accent}, .20), inset 0 0 80px 8px rgba(${accent}, .08);`,
			`background: radial-gradient(120% 55% at 50% 112%, rgba(${accent}, .09), transparent 62%);`,
		].join("");
		host.appendChild(light);
		document.documentElement.appendChild(host);
		host.getBoundingClientRect(); // commit opacity 0 so the fade-in runs
	}
	host.style.opacity = "1";
}

function glowOffInPage(lingerMs: number) {
	const ID = "__agentic-browser-glow";
	const w = window as any;
	clearTimeout(w.__agenticBrowserGlowHide);
	w.__agenticBrowserGlowHide = setTimeout(() => {
		const host = document.getElementById(ID);
		if (!host) return;
		host.style.opacity = "0";
		w.__agenticBrowserGlowHide = setTimeout(() => host.remove(), 500);
	}, lingerMs);
}

/** Turn the glow on or off in a tab. Pages that block scripts are skipped. */
export async function setPageGlow(tabId: number, on: boolean, lingerMs = 700): Promise<void> {
	try {
		if (on) await browser.scripting.executeScript({ target: { tabId }, func: glowOnInPage, args: [ACCENT] });
		else await browser.scripting.executeScript({ target: { tabId }, func: glowOffInPage, args: [lingerMs] });
	} catch {
		// chrome:// pages, the web store and similar can't be scripted.
	}
}
