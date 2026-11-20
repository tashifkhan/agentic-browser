// Runs inside the page through chrome.scripting.executeScript (isolated world).
// It must stay self-contained: executeScript serializes the function source,
// so it cannot reference anything outside its own body.
//
// Ref state lives on the isolated world's globalThis, which persists for the
// life of the document. A navigation gives a fresh document and drops every
// ref, so stale refs fail loudly instead of hitting the wrong element.

export type PageOp =
  | "snapshot"
  | "resolve"
  | "click"
  | "hover"
  | "focus"
  | "type"
  | "press"
  | "select"
  | "check"
  | "scroll"
  | "probe"
  | "read";

export function pageAgent(op: PageOp, args: any): { ok: true; v: any } | { ok: false; e: string } {
  try {
    return { ok: true, v: pageAgentImpl() };
  } catch (err: any) {
    return { ok: false, e: String(err?.message ?? err) };
  }

  function pageAgentImpl(): any {
  const G = globalThis as any;
  const state: { refs: Map<string, WeakRef<Element>>; byEl: WeakMap<Element, string>; next: number } =
    G.__agenticBrowser ||
    (G.__agenticBrowser = { refs: new Map(), byEl: new WeakMap(), next: Math.max(1, Number(args?.startAt) || 1) });

  const prefix: string = args?.prefix ?? "";
  const clean = (s: string | null | undefined, max = 120) => {
    const t = (s ?? "").replace(/\s+/g, " ").trim();
    return t.length > max ? t.slice(0, max - 1) + "…" : t;
  };
  const q = (s: string) => JSON.stringify(s);

  const IMPLICIT: Record<string, string> = {
    a: "link", button: "button", select: "combobox", textarea: "textbox", img: "img",
    h1: "heading", h2: "heading", h3: "heading", h4: "heading", h5: "heading", h6: "heading",
    nav: "navigation", main: "main", header: "banner", footer: "contentinfo", aside: "complementary",
    form: "form", table: "table", tr: "row", td: "cell", th: "columnheader", ul: "list", ol: "list",
    li: "listitem", dialog: "dialog", summary: "button", option: "option", article: "article",
    fieldset: "group", progress: "progressbar", details: "group", menu: "list",
  };
  const INPUT_ROLES: Record<string, string> = {
    button: "button", submit: "button", reset: "button", image: "button", checkbox: "checkbox",
    radio: "radio", range: "slider", number: "spinbutton", search: "searchbox", email: "textbox",
    tel: "textbox", text: "textbox", url: "textbox", password: "textbox", "": "textbox",
    date: "textbox", "datetime-local": "textbox", month: "textbox", time: "textbox", week: "textbox",
    color: "button", file: "button",
  };
  const INTERACTIVE = new Set([
    "link", "button", "textbox", "searchbox", "checkbox", "radio", "combobox", "listbox", "option",
    "slider", "spinbutton", "switch", "menuitem", "menuitemcheckbox", "menuitemradio", "tab",
    "treeitem", "clickable",
  ]);
  const LEAF = new Set([
    "button", "textbox", "searchbox", "checkbox", "radio", "combobox", "slider", "spinbutton",
    "switch", "img", "heading", "option", "progressbar", "menuitem", "tab", "link",
  ]);
  const STRUCTURAL = new Set([
    "navigation", "main", "banner", "contentinfo", "complementary", "form", "table", "row", "cell",
    "columnheader", "list", "listitem", "dialog", "alertdialog", "article", "group", "region",
    "tablist", "menu", "menubar", "tree", "grid", "toolbar", "search", "alert", "status", "listbox",
  ]);
  const SKIP_TAGS = new Set(["script", "style", "noscript", "template", "head", "meta", "link", "iframe", "frame"]);

  function roleOf(el: Element): string {
    const explicit = el.getAttribute("role")?.split(" ")[0];
    if (explicit && explicit !== "presentation" && explicit !== "none" && explicit !== "generic") return explicit;
    const tag = el.tagName.toLowerCase();
    if (tag === "input") {
      const type = ((el as HTMLInputElement).type || "").toLowerCase();
      if (type === "hidden") return "";
      return INPUT_ROLES[type] ?? "textbox";
    }
    if (tag === "a") return (el as HTMLAnchorElement).hasAttribute("href") ? "link" : "";
    if (tag === "img") return (el as HTMLImageElement).alt === "" && el.hasAttribute("alt") ? "" : "img";
    if (tag === "select") return (el as HTMLSelectElement).multiple || (el as HTMLSelectElement).size > 1 ? "listbox" : "combobox";
    if (tag === "section" && (el.hasAttribute("aria-label") || el.hasAttribute("aria-labelledby"))) return "region";
    if ((el as HTMLElement).isContentEditable && el.getAttribute("contenteditable") !== null) return "textbox";
    if (tag === "svg") return el.getAttribute("aria-label") ? "img" : "";
    return IMPLICIT[tag] ?? "";
  }

  function textOf(el: Element, max = 120): string {
    return clean((el as HTMLElement).innerText ?? el.textContent, max);
  }

  function nameOf(el: Element, role: string): string {
    const by = el.getAttribute("aria-labelledby");
    if (by) {
      const t = by.split(/\s+/).map((id) => el.ownerDocument.getElementById(id)?.textContent ?? "").join(" ");
      if (clean(t)) return clean(t);
    }
    const aria = el.getAttribute("aria-label");
    if (aria && clean(aria)) return clean(aria);
    const tag = el.tagName.toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") {
      const input = el as HTMLInputElement;
      const labels = input.labels ? Array.from(input.labels).map((l) => l.textContent).join(" ") : "";
      if (clean(labels)) return clean(labels);
      if (["button", "submit", "reset"].includes(input.type) && input.value) return clean(input.value);
      if (input.placeholder) return clean(input.placeholder);
    }
    if (tag === "img") return clean((el as HTMLImageElement).alt || el.getAttribute("title"));
    if (role === "textbox" || role === "searchbox" || role === "combobox" || role === "listbox") {
      return clean(el.getAttribute("title") || el.getAttribute("placeholder") || el.getAttribute("aria-placeholder"));
    }
    if (["list", "table", "navigation", "main", "form", "group", "region", "dialog", "row", "menu", "tablist", "toolbar", "banner", "contentinfo", "complementary", "article", "grid", "tree", "menubar", "search"].includes(role)) {
      return clean(el.getAttribute("title"));
    }
    return textOf(el) || clean(el.getAttribute("title"));
  }

  function visible(el: Element): boolean {
    const anyEl = el as any;
    if (typeof anyEl.checkVisibility === "function") {
      if (!anyEl.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) {
        // display:contents has no box but its children render.
        return getComputedStyle(el).display === "contents";
      }
      return true;
    }
    const st = getComputedStyle(el);
    return st.display !== "none" && st.visibility !== "hidden" && st.opacity !== "0";
  }

  function refFor(el: Element): string {
    let ref = state.byEl.get(el);
    if (!ref) {
      ref = `${prefix}e${state.next++}`;
      state.byEl.set(el, ref);
    }
    state.refs.set(ref, new WeakRef(el));
    return ref;
  }

  function describe(el: Element): string {
    const role = roleOf(el) || el.tagName.toLowerCase();
    const name = nameOf(el, role);
    return name ? `${role} ${q(name)}` : role;
  }

  // ── snapshot ──────────────────────────────────────────────────────────
  type Node = { line: string; kids: Node[]; text?: boolean };

  function attrs(el: Element, role: string): string {
    const out: string[] = [];
    const h = el as HTMLInputElement;
    const ariaChecked = el.getAttribute("aria-checked");
    if (role === "checkbox" || role === "radio" || role === "switch" || role === "menuitemcheckbox") {
      const checked = ariaChecked != null ? ariaChecked === "true" : !!h.checked;
      if (checked) out.push("[checked]");
    }
    if ((h as any).disabled || el.getAttribute("aria-disabled") === "true") out.push("[disabled]");
    const expanded = el.getAttribute("aria-expanded");
    if (expanded != null) out.push(expanded === "true" ? "[expanded]" : "[collapsed]");
    if (el.getAttribute("aria-selected") === "true" || (role === "option" && (el as HTMLOptionElement).selected)) out.push("[selected]");
    if (el.getAttribute("aria-pressed") === "true") out.push("[pressed]");
    if ((h as any).required || el.getAttribute("aria-required") === "true") out.push("[required]");
    if (role === "heading") {
      const lvl = el.getAttribute("aria-level") || el.tagName.match(/^H(\d)$/i)?.[1];
      if (lvl) out.push(`[level=${lvl}]`);
    }
    return out.length ? " " + out.join(" ") : "";
  }

  function valueOf(el: Element, role: string): string {
    const tag = el.tagName.toLowerCase();
    if (tag === "select") {
      const s = el as HTMLSelectElement;
      return clean(Array.from(s.selectedOptions).map((o) => o.label).join(", "), 80);
    }
    if (tag === "input" || tag === "textarea") {
      const i = el as HTMLInputElement;
      if (["checkbox", "radio", "button", "submit", "reset", "image", "file", "color"].includes(i.type)) return "";
      if (!i.value) return "";
      if (i.type === "password" || getComputedStyle(el).getPropertyValue("-webkit-text-security") !== "none" && getComputedStyle(el).getPropertyValue("-webkit-text-security") !== "") {
        return "•".repeat(Math.min(i.value.length, 12));
      }
      return clean(i.value, 200);
    }
    if (role === "textbox" && (el as HTMLElement).isContentEditable) return clean((el as HTMLElement).innerText, 200);
    return "";
  }

  function isPointer(el: Element): boolean {
    if (!(el instanceof HTMLElement)) return false;
    const tag = el.tagName.toLowerCase();
    if (tag !== "div" && tag !== "span" && tag !== "li" && tag !== "i" && tag !== "label" && tag !== "p") return false;
    if (el.tabIndex >= 0 && el.hasAttribute("tabindex")) return true;
    if (getComputedStyle(el).cursor !== "pointer") return false;
    const parent = el.parentElement;
    return !parent || getComputedStyle(parent).cursor !== "pointer";
  }

  function walk(root: ParentNode, out: Node[], budget: { n: number }) {
    const children: ChildNode[] =
      root instanceof HTMLSlotElement ? (root.assignedNodes({ flatten: true }) as ChildNode[]) : Array.from(root.childNodes);
    // A <label> tied to a control already names that control; skip its text.
    const labelText = root instanceof HTMLLabelElement && !!root.control;
    for (const child of children) {
      if (budget.n <= 0) return;
      if (child.nodeType === 3) {
        if (labelText) continue;
        const t = clean(child.textContent, 300);
        if (t) {
          out.push({ line: `text: ${t}`, kids: [], text: true });
          budget.n -= t.length;
        }
        continue;
      }
      if (child.nodeType !== 1) continue;
      const el = child as Element;
      const tag = el.tagName.toLowerCase();
      if (tag === "iframe" || tag === "frame") {
        const src = (el as HTMLIFrameElement).src;
        if (visible(el)) out.push({ line: `iframe${src ? " " + q(clean(src, 80)) : ""} (see frame sections below)`, kids: [] });
        continue;
      }
      if (SKIP_TAGS.has(tag)) continue;
      if (el.getAttribute("aria-hidden") === "true") continue;
      if (!visible(el)) continue;

      let role = roleOf(el);
      if (!role && isPointer(el)) role = "clickable";
      const container: ParentNode = (el as HTMLElement).shadowRoot ?? el;

      if (!role) {
        walk(container, out, budget);
        continue;
      }
      const name = nameOf(el, role);
      let line = name ? `${role} ${q(name)}` : role;
      line += attrs(el, role);
      if (INTERACTIVE.has(role) || role === "img" && name) {
        if (INTERACTIVE.has(role)) line += ` [ref=${refFor(el)}]`;
      }
      const value = valueOf(el, role);
      if (value) line += `: ${value}`;
      if (role === "link") {
        const href = (el as HTMLAnchorElement).getAttribute("href") || "";
        if (href && !href.startsWith("javascript:")) {
          let shown = href;
          try {
            const u = new URL(href, location.href);
            shown = u.origin === location.origin ? u.pathname + u.search + u.hash : u.href;
          } catch { /* keep raw */ }
          line += ` -> ${clean(shown, 100)}`;
        }
      }
      budget.n -= line.length;
      const node: Node = { line, kids: [] };
      if (!LEAF.has(role) && role !== "clickable") walk(container, node.kids, budget);
      if (role === "clickable" && !name) walk(container, node.kids, budget);
      if (STRUCTURAL.has(role) && !name && node.kids.length === 0) continue;
      out.push(node);
    }
  }

  function render(nodes: Node[], depth: number, lines: string[]) {
    for (const n of nodes) {
      const pad = "  ".repeat(depth);
      if (n.kids.length === 1 && n.kids[0].text && n.kids[0].kids.length === 0) {
        lines.push(`${pad}- ${n.line}: ${n.kids[0].line.slice(6)}`);
      } else {
        lines.push(`${pad}- ${n.line}${n.kids.length ? ":" : ""}`);
        render(n.kids, depth + 1, lines);
      }
    }
  }

  // ── target resolution ─────────────────────────────────────────────────
  function find(target: string): Element {
    let t = String(target ?? "").trim();
    const refMatch = t.match(/^\[?(?:ref=)?((?:f\d+)?e\d+)\]?$/);
    if (refMatch) {
      const el = state.refs.get(refMatch[1])?.deref();
      if (!el || !el.isConnected) {
        throw new Error(`Ref ${refMatch[1]} is stale or unknown. Take a new snapshot and use a ref from it.`);
      }
      return el;
    }
    if (/^text=/i.test(t)) {
      const needle = t.slice(5).replace(/^["']|["']$/g, "").toLowerCase();
      const pool = Array.from(document.querySelectorAll("a,button,input[type=submit],input[type=button],[role=button],[role=link],[role=tab],[role=menuitem],[role=option],label,summary"));
      const hit =
        pool.find((el) => visible(el) && textOf(el, 500).toLowerCase() === needle) ??
        pool.find((el) => visible(el) && textOf(el, 500).toLowerCase().includes(needle));
      if (hit) return hit;
      // Fall back to the smallest visible element containing the text.
      let best: Element | null = null;
      for (const el of Array.from(document.body.querySelectorAll("*"))) {
        if (SKIP_TAGS.has(el.tagName.toLowerCase())) continue;
        const txt = (el as HTMLElement).innerText?.toLowerCase() ?? "";
        if (txt.includes(needle) && visible(el) && (!best || best.contains(el))) best = el;
      }
      if (best) return best;
      throw new Error(`No element with text ${q(needle)}`);
    }
    let matches: Element[];
    try {
      matches = Array.from(document.querySelectorAll(t));
    } catch {
      throw new Error(`"${t}" is not a ref (e12), text=..., or a valid CSS selector`);
    }
    const el = matches.find(visible) ?? matches[0];
    if (!el) throw new Error(`No element matches selector ${q(t)}`);
    return el;
  }

  function geometry(el: Element) {
    el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" as ScrollBehavior });
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    let covered: string | undefined;
    const top = document.elementFromPoint(x, y);
    if (top && top !== el && !el.contains(top) && !top.contains(el)) {
      const label = top.closest("label");
      if (!(label && (label as HTMLLabelElement).control === el)) covered = describe(top);
    }
    return {
      x, y, width: r.width, height: r.height, covered,
      inViewport: x >= 0 && y >= 0 && x <= innerWidth && y <= innerHeight,
      desc: describe(el),
      editable: isEditable(el),
    };
  }

  function isEditable(el: Element): boolean {
    const tag = el.tagName.toLowerCase();
    if (tag === "textarea") return !(el as HTMLTextAreaElement).readOnly;
    if (tag === "input") {
      const i = el as HTMLInputElement;
      return !i.readOnly && !["checkbox", "radio", "button", "submit", "reset", "image", "file", "color", "range", "hidden"].includes(i.type);
    }
    return (el as HTMLElement).isContentEditable;
  }

  function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function domClick(el: Element, clickCount = 1) {
    const r = el.getBoundingClientRect();
    const opts = { bubbles: true, cancelable: true, composed: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, view: window };
    el.dispatchEvent(new PointerEvent("pointerdown", opts));
    el.dispatchEvent(new MouseEvent("mousedown", opts));
    (el as HTMLElement).focus?.();
    el.dispatchEvent(new PointerEvent("pointerup", opts));
    el.dispatchEvent(new MouseEvent("mouseup", opts));
    (el as HTMLElement).click();
    if (clickCount > 1) el.dispatchEvent(new MouseEvent("dblclick", opts));
  }

  switch (op) {
    case "snapshot": {
      const budget = { n: Number(args?.maxChars) || 25000 };
      const nodes: Node[] = [];
      walk(document.body ?? document.documentElement, nodes, budget);
      const lines: string[] = [];
      render(nodes, 0, lines);
      const sx = Math.round(scrollX), sy = Math.round(scrollY);
      const maxY = Math.max(0, document.documentElement.scrollHeight - innerHeight);
      return {
        url: location.href,
        title: document.title,
        text: lines.join("\n"),
        truncated: budget.n <= 0,
        scroll: `scroll ${sx},${sy} of ${Math.round(document.documentElement.scrollWidth - innerWidth)},${Math.round(maxY)}; viewport ${innerWidth}x${innerHeight}`,
        area: innerWidth * innerHeight,
        refs: lines.length,
        next: state.next,
      };
    }
    case "resolve":
      return geometry(find(args.target));
    case "click": {
      const el = find(args.target);
      el.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
      domClick(el, args.clickCount || 1);
      return { desc: describe(el) };
    }
    case "hover": {
      const el = find(args.target);
      el.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
      for (const type of ["pointerover", "pointerenter", "mouseover", "mouseenter", "mousemove"]) {
        el.dispatchEvent(new MouseEvent(type, { bubbles: type !== "mouseenter" && type !== "pointerenter", composed: true }));
      }
      return { desc: describe(el) };
    }
    case "focus": {
      const el = find(args.target) as HTMLElement;
      el.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
      if (!args.any && !isEditable(el)) throw new Error(`${describe(el)} is not an editable field`);
      el.focus();
      if (args.any) return { desc: describe(el) };
      if (args.clear) {
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) setNativeValue(el, "");
        else {
          const range = document.createRange();
          range.selectNodeContents(el);
          const sel = getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
          document.execCommand("delete");
        }
      } else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        try {
          const end = el.value.length;
          el.setSelectionRange(end, end);
        } catch { /* some input types disallow selection */ }
      }
      return { desc: describe(el) };
    }
    case "type": {
      // DOM fallback when CDP is unavailable.
      const el = find(args.target) as HTMLElement;
      if (!isEditable(el)) throw new Error(`${describe(el)} is not an editable field`);
      el.focus();
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        setNativeValue(el, (args.clear ? "" : el.value) + args.text);
      } else {
        if (args.clear) {
          document.execCommand("selectAll");
          document.execCommand("delete");
        }
        document.execCommand("insertText", false, args.text);
      }
      if (args.submit) {
        const form = (el as HTMLInputElement).form;
        el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
        if (form) form.requestSubmit ? form.requestSubmit() : form.submit();
      }
      return { desc: describe(el) };
    }
    case "press": {
      const el = (args.target ? find(args.target) : document.activeElement) as HTMLElement | null;
      const target = el ?? document.body;
      for (const type of ["keydown", "keyup"]) {
        target.dispatchEvent(new KeyboardEvent(type, { key: args.key, bubbles: true, cancelable: true }));
      }
      if (args.key === "Enter" && (target as HTMLInputElement).form) {
        const form = (target as HTMLInputElement).form!;
        form.requestSubmit ? form.requestSubmit() : form.submit();
      }
      return { desc: describe(target) };
    }
    case "select": {
      const el = find(args.target);
      if (!(el instanceof HTMLSelectElement)) {
        throw new Error(`${describe(el)} is not a native <select>. Click it, then click the option.`);
      }
      const wanted: string[] = (args.values ?? []).map((v: string) => String(v).toLowerCase());
      const picked: string[] = [];
      for (const opt of Array.from(el.options)) {
        const hit = wanted.includes(opt.value.toLowerCase()) || wanted.includes(clean(opt.label).toLowerCase());
        if (el.multiple) opt.selected = hit;
        if (hit) {
          picked.push(opt.label);
          if (!el.multiple) {
            el.value = opt.value;
            break;
          }
        }
      }
      if (!picked.length) {
        const options = Array.from(el.options).slice(0, 30).map((o) => o.label).join(", ");
        throw new Error(`No option matched ${q(wanted.join(", "))}. Options: ${options}`);
      }
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return { desc: describe(el), selected: picked };
    }
    case "check": {
      const el = find(args.target);
      const aria = el.getAttribute("aria-checked");
      const current = aria != null ? aria === "true" : !!(el as HTMLInputElement).checked;
      return { current, ...geometry(el) };
    }
    case "scroll": {
      if (args.target) {
        const el = find(args.target);
        el.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
        if (args.dx || args.dy) {
          let node: Element | null = el;
          while (node && node.scrollHeight <= node.clientHeight && node.scrollWidth <= node.clientWidth) node = node.parentElement;
          (node ?? document.scrollingElement)?.scrollBy(args.dx || 0, args.dy || 0);
        }
      } else {
        // Scroll the window, or the largest scrollable container in view
        // when the page body does not scroll (common in web apps).
        const se = document.scrollingElement as Element;
        if (se.scrollHeight > innerHeight + 4) window.scrollBy(args.dx || 0, args.dy || 0);
        else {
          let best: Element | null = null;
          let area = 0;
          for (const el of Array.from(document.querySelectorAll("*"))) {
            if (el.scrollHeight > el.clientHeight + 4) {
              const ov = getComputedStyle(el).overflowY;
              if (ov === "auto" || ov === "scroll") {
                const a = el.clientWidth * el.clientHeight;
                if (a > area) { area = a; best = el; }
              }
            }
          }
          (best ?? se).scrollBy(args.dx || 0, args.dy || 0);
        }
      }
      return { scrollX: Math.round(scrollX), scrollY: Math.round(scrollY) };
    }
    case "probe": {
      let matched = true;
      if (args.text) {
        matched &&= (document.body?.innerText ?? "").toLowerCase().includes(String(args.text).toLowerCase());
      }
      if (args.target) {
        try {
          matched &&= visible(find(args.target));
        } catch {
          matched = false;
        }
      }
      return { matched: args.gone ? !matched : matched, ready: document.readyState };
    }
    case "read": {
      const el = args.target ? find(args.target) : document.body;
      const raw = ((el as HTMLElement).innerText ?? "").replace(/\n{3,}/g, "\n\n");
      return { text: raw.length > 50000 ? raw.slice(0, 50000) + "\n… (truncated)" : raw };
    }
  }
  throw new Error(`Unknown page op ${op}`);
}
}
