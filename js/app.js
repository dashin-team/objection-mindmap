import {
  DIMENSIONS,
  applySubmissions,
  categoriesOf,
  findObjection,
  formatSubmission,
  nodePathString,
  parseRoute,
  resolveLayer,
  routeToHash,
  searchObjections,
} from "./logic.js";

const DRAFT_KEY = "wenjuwang-draft-v1";
const SHORT_BANK = { insurance: "保險", finance: "理財", advanced: "進階" };

const state = {
  bank: null,
  communityError: "",
  endpoint: "",
  query: "",
  draft: loadDraft(),
  formError: "",
  sending: false,
  result: null,
};

const app = document.getElementById("app");
let composing = false;
let lastRoute = "";

function loadDraft() {
  const blank = {
    submitter: "",
    bank: "insurance",
    category: "",
    title: "",
    C: "",
    A: "",
    R: "",
    question: "",
    dimension: "需求",
    clientSays: "",
    followUp: "",
    company: "",
  };
  try {
    return { ...blank, ...JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "{}") };
  } catch {
    return blank;
  }
}

function saveDraft() {
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify(state.draft));
}

function endpoint() {
  const value = String((window.APP_CONFIG && window.APP_CONFIG.SUBMIT_ENDPOINT) || "").trim();
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return "";
    return value;
  } catch {
    return "";
  }
}

function h(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (value == null || value === false) return;
    if (key === "class") node.className = value;
    else if (key === "value" && (tag === "textarea" || tag === "input" || tag === "select")) node.value = String(value);
    else if (key === "checked") node.checked = Boolean(value);
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value === true) node.setAttribute(key, "");
    else node.setAttribute(key, String(value));
  });
  const list = Array.isArray(children) ? children : [children];
  list.forEach((child) => {
    if (child == null || child === false) return;
    if (typeof child === "string" || typeof child === "number") node.append(document.createTextNode(String(child)));
    else node.append(child);
  });
  return node;
}

function highlight(text, query) {
  const frag = document.createDocumentFragment();
  const source = String(text || "");
  const needle = String(query || "").trim();
  if (!needle) {
    frag.append(document.createTextNode(source));
    return frag;
  }
  const lower = source.toLowerCase();
  const q = needle.toLowerCase();
  let cursor = 0;
  let at = lower.indexOf(q);
  while (at >= 0) {
    frag.append(document.createTextNode(source.slice(cursor, at)));
    frag.append(h("mark", {}, source.slice(at, at + needle.length)));
    cursor = at + needle.length;
    at = lower.indexOf(q, cursor);
  }
  frag.append(document.createTextNode(source.slice(cursor)));
  return frag;
}

function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

function captureUi() {
  const active = document.activeElement;
  let focus = null;
  if (active && active.id && app.contains(active)) {
    focus = { id: active.id };
    try {
      focus.start = active.selectionStart;
      focus.end = active.selectionEnd;
    } catch {
      /* 按鈕沒有選取範圍 */
    }
  }
  return {
    opening: Boolean(document.getElementById("opening")?.open),
    openingFor: document.getElementById("opening")?.dataset.for || "",
    details: [...document.querySelectorAll("details[id]")].filter((node) => node.open).map((node) => node.id),
    focus,
  };
}

function restoreUi(saved) {
  if (!saved) return;
  saved.details.forEach((id) => {
    const node = document.getElementById(id);
    if (node) node.open = true;
  });
  const opening = document.getElementById("opening");
  if (opening && saved.opening && opening.dataset.for === saved.openingFor) opening.open = true;
  if (!saved.focus) return;
  const node = document.getElementById(saved.focus.id);
  if (!node) return;
  node.focus();
  if (saved.focus.start != null && node.setSelectionRange) {
    node.setSelectionRange(saved.focus.start, saved.focus.end);
  }
}

function menuRow() {
  return h("nav", { class: "menu-row" }, [
    h("a", { href: "#/library" }, "九宮格／五宮格"),
    h("a", { href: "#/submit" }, "投稿"),
  ]);
}

function renderBack(route) {
  let href = "#/";
  let label = "回到首頁";
  if (route.name === "objection") {
    const objection = findObjection(state.bank, route.id);
    href = objection ? `#/b/${objection.bank}` : "#/";
    label = "回到列表";
  }
  return h("header", { class: "topbar" }, [
    h("a", { class: "back-link", href, "aria-label": label }, "←"),
  ]);
}

function renderHome() {
  const query = state.query.trim();
  const results = query ? searchObjections(state.bank.objections, query) : [];
  const nodes = [
    h("h1", { class: "home-title" }, "問句王"),
    h("form", { class: "search big", role: "search", onsubmit: (event) => event.preventDefault() }, [
      h("label", { class: "sr", for: "search" }, "搜尋反對問題或問句"),
      h("input", {
        id: "search",
        type: "search",
        enterkeyhint: "search",
        placeholder: "搜尋反對問題或問句",
        value: state.query,
        autocomplete: "off",
        oninput: onSearch,
        oncompositionstart: () => { composing = true; },
        oncompositionend: onSearch,
      }),
      state.query ? h("button", { type: "button", onclick: clearSearch, "aria-label": "清除搜尋" }, "清除") : null,
    ]),
  ];
  if (state.communityError) {
    nodes.push(h("p", { class: "hint" }, "夥伴分享暫時讀不到，先顯示題庫原文。"));
  }
  if (query) {
    if (!results.length) nodes.push(h("p", { class: "hint" }, "沒有符合的題目。"));
    results.forEach(({ objection }) => {
      const link = h("a", { class: "plain-link", href: `#/o/${objection.id}` });
      link.append(highlight(objection.title, query));
      nodes.push(link);
    });
  } else {
    (state.bank.banks || []).forEach((bank) => {
      const count = state.bank.objections.filter((item) => item.bank === bank.id).length;
      const short = SHORT_BANK[bank.id] || bank.title;
      nodes.push(h("a", {
        class: "bank-btn",
        href: `#/b/${bank.id}`,
        "data-bank": bank.id,
        "aria-label": `${bank.title}，${count} 題`,
      }, [
        h("span", {}, short),
        h("span", { class: "count" }, String(count)),
      ]));
    });
  }
  nodes.push(menuRow());
  return nodes;
}

function onSearch(event) {
  state.query = event.target.value;
  if (event.type === "compositionend") composing = false;
  if (!composing) render();
}

function clearSearch() {
  state.query = "";
  render();
  document.getElementById("search")?.focus();
}

function renderBankPage(id) {
  const bank = (state.bank.banks || []).find((item) => item.id === id);
  if (!bank) {
    return [h("h1", {}, "找不到這個題庫"), h("a", { href: "#/" }, "回首頁")];
  }
  const groups = categoriesOf(state.bank.objections, bank.id);
  document.title = `${bank.title}｜問句王`;
  return [
    h("h1", {}, SHORT_BANK[bank.id] || bank.title),
    ...groups.map((group) => h("details", { class: "cat", id: `cat-${bank.id}-${group.category}` }, [
      h("summary", {}, [group.category, h("span", { class: "count" }, String(group.items.length))]),
      ...group.items.map((item) => h("a", { class: "plain-link", href: `#/o/${item.id}` }, item.title)),
    ])),
    menuRow(),
  ];
}

function renderEItem(text) {
  const match = /^(外部|內部)｜(.*)$/.exec(text);
  if (!match) return h("li", {}, text);
  return h("li", {}, [h("span", { class: "tag" }, match[1]), match[2]]);
}

function renderCare(cell) {
  return h("div", { class: "care" }, [
    cell.purpose ? h("p", { class: "purpose" }, cell.purpose) : null,
    cell.C ? h("div", {}, [h("span", { class: "kicker" }, "C 同理"), cell.C]) : null,
    cell.A ? h("div", {}, [h("span", { class: "kicker" }, "A 確認"), cell.A]) : null,
    cell.R ? h("div", {}, [h("span", { class: "kicker" }, "R 延伸"), cell.R]) : null,
    h("div", {}, [
      h("span", { class: "kicker" }, "E 探詢"),
      h("ol", { class: "e-list" }, (cell.E || []).map(renderEItem)),
    ]),
  ]);
}

function renderLibrary() {
  document.title = "九宮格／五宮格｜問句王";
  const nodes = [h("h1", {}, "九宮格／五宮格")];
  (state.bank.frameworks || []).forEach((framework) => {
    nodes.push(h("article", { class: "framework" }, [
      h("h2", {}, framework.name),
      framework.note ? h("p", { class: "purpose" }, framework.note) : null,
      ...framework.cells.map((cell) => h("details", { class: "cell", id: `fw-${framework.id}-${cell.no}` }, [
        h("summary", {}, cell.name),
        renderCare(cell),
      ])),
      framework.tip ? h("p", { class: "callout" }, framework.tip) : null,
    ]));
  });
  nodes.push(menuRow());
  return nodes;
}

function renderObjection(route) {
  const objection = findObjection(state.bank, route.id);
  if (!objection) {
    return [
      h("h1", {}, "找不到這題"),
      h("a", { class: "plain-link", href: "#/" }, "回首頁"),
    ];
  }
  const layer = resolveLayer(objection.tree, route.path);
  if (layer.path.join(",") !== route.path.join(",")) {
    route.path = layer.path.slice();
  }
  if (layer.ended && route.mode !== "closing") route.mode = "closing";
  const hash = routeToHash(route);
  if (location.hash !== hash) history.replaceState(null, "", hash);

  document.title = `${objection.title}｜問句王`;
  const nodes = [
    h("h1", { class: "obj-title" }, objection.title),
    renderOpening(objection),
  ];
  if (route.mode === "closing") nodes.push(renderClosing(objection));
  else nodes.push(renderQuestion(objection, layer));
  if (route.path.length) {
    nodes.push(h("button", {
      type: "button",
      class: "btn step-back",
      id: "back",
      onclick: () => go(stepBack(route, objection)),
    }, "上一步"));
  }
  return nodes;
}

function stepBack(route, objection) {
  const parent = route.path.slice(0, -1);
  const parentLayer = resolveLayer(objection.tree, parent);
  if (parentLayer.ended) return `#/b/${objection.bank}`;
  return routeToHash({ name: "objection", id: objection.id, path: parent, mode: "tree" });
}

function renderOpening(objection) {
  const blocks = [
    objection.C ? ["C 同理", objection.C] : null,
    objection.A ? ["A 確認", objection.A] : null,
    objection.R ? ["R 延伸", objection.R] : null,
  ].filter(Boolean);
  if (!blocks.length) return null;
  return h("details", { class: "opening subtle", id: "opening", "data-for": objection.id }, [
    h("summary", {}, "開場話術"),
    h("div", { class: "scripts" }, blocks.map(([label, text]) => h("p", { class: "script" }, [
      h("span", { class: "kicker" }, label),
      text,
    ]))),
  ]);
}

function renderQuestion(objection, layer) {
  return h("div", { id: "layer" }, [
    h("article", { class: "qcard", id: "current-question", "data-dim": layer.dimension || "需求" }, [
      layer.dimension ? h("span", { class: "dim-tag" }, `問：${layer.dimension}`) : null,
      h("p", { class: "ask" }, layer.text),
    ]),
    h("div", { class: "replies" }, layer.branches.map((branch, index) => h("button", {
      type: "button",
      class: "reply",
      "data-index": String(index),
      onclick: () => openBranch(objection, layer, index),
    }, branch.clientSays))),
  ]);
}

function openBranch(objection, layer, index) {
  const next = resolveLayer(objection.tree, layer.path.concat(index));
  go(routeToHash({
    name: "objection",
    id: objection.id,
    path: next.path,
    mode: next.ended ? "closing" : "tree",
  }));
}

function renderClosing(objection) {
  const closing = objection.closing;
  const nodes = [];
  if (!closing || !closing.bridge) {
    nodes.push(h("p", { class: "hint", id: "closing" }, "這題還沒有收尾。"));
    return h("div", {}, nodes);
  }
  nodes.push(h("article", { class: "qcard", id: "closing" }, [
    h("span", { class: "dim-tag" }, "收尾"),
    h("p", { class: "ask" }, closing.bridge),
  ]));
  nodes.push(h("div", { class: "replies" }, (closing.replies || []).map((reply) => h("article", { class: "reply" }, [
    h("span", { class: "says" }, reply.clientSays),
    reply.followUp ? h("span", { class: "follow" }, reply.followUp) : null,
  ]))));
  if (closing.nextStep) nodes.push(h("p", { class: "next-step", id: "next-step" }, closing.nextStep));
  return h("div", {}, nodes);
}

function renderSubmit(route) {
  document.title = "投稿｜問句王";
  const nodes = [
    h("h1", {}, route.kind === "new" ? "新的反對問題" : route.kind === "branch" ? "幫現有的題目加一句" : "投稿"),
  ];
  if (route.kind === "choose") {
    nodes.push(h("p", { class: "lede" }, "送出後先給負責人看過，核可了才會出現在題庫。"));
    nodes.push(h("div", { class: "replies" }, [
      h("a", { class: "reply", href: "#/submit/new" }, "新的一題"),
      h("a", { class: "reply", href: "#/submit/branch" }, "加在某一句下面"),
    ]));
    if (!state.endpoint) nodes.push(h("p", { class: "hint" }, "還沒接上試算表。填完後會產生一段文字，複製貼給負責人。"));
    return nodes;
  }
  if (route.kind === "branch" && !route.id) {
    nodes.push(h("p", { class: "lede" }, "先找到那一題。"));
    nodes.push(renderPickList());
    return nodes;
  }
  nodes.push(renderSubmitForm(route));
  return nodes;
}

function renderPickList() {
  const query = state.query.trim();
  const list = query
    ? searchObjections(state.bank.objections, query)
    : state.bank.objections.slice(0, 12).map((objection) => ({ objection }));
  return h("div", {}, [
    h("form", { class: "search", onsubmit: (event) => event.preventDefault() }, [
      h("label", { class: "sr", for: "search" }, "找要補充的題目"),
      h("input", {
        id: "search",
        type: "search",
        placeholder: "輸入反對問題或問句",
        value: state.query,
        oninput: onSearch,
        oncompositionstart: () => { composing = true; },
        oncompositionend: onSearch,
      }),
    ]),
    ...list.map(({ objection }) => h("a", {
      class: "plain-link",
      href: routeToHash({ name: "submit", kind: "branch", id: objection.id, path: [] }),
    }, objection.title)),
  ]);
}

function renderSubmitForm(route) {
  const branch = route.kind === "branch";
  const objection = branch ? findObjection(state.bank, route.id) : null;
  if (branch && !objection) return h("p", { class: "hint" }, "找不到要補充的題目。");
  const layer = branch ? resolveLayer(objection.tree, route.path) : null;
  const form = h("form", { class: "form", id: "post-form", onsubmit: onSubmit });
  const add = (...children) => {
    children.forEach((child) => {
      if (child != null && child !== false) form.append(child);
    });
  };
  add(field("你的名字", "submitter", "text", "同事怎麼稱呼你"));
  if (!branch) {
    add(
      h("fieldset", { class: "field" }, [
        h("legend", {}, "放進哪一本"),
        h("div", { class: "choices" }, (state.bank.banks || []).map((bank) => h("label", { class: "choice" }, [
          h("input", {
            type: "radio",
            name: "bank",
            value: bank.id,
            checked: state.draft.bank === bank.id,
            onchange: () => { state.draft.bank = bank.id; saveDraft(); render(); },
          }),
          SHORT_BANK[bank.id] || bank.title,
        ]))),
      ]),
      field("分類", "category", "text", "例如：不信任類"),
      categoryList(),
      field("客戶的反對問題", "title", "textarea", "客戶會怎麼說"),
      field("同理（可空白）", "C", "textarea", ""),
      field("確認（可空白）", "A", "textarea", ""),
      field("延伸（可空白）", "R", "textarea", ""),
      field("主問句（可空白）", "question", "textarea", ""),
      dimensionPicker(),
    );
  } else {
    add(
      h("p", { class: "hint" }, objection.title),
      h("p", { class: "ask" }, layer.text),
      layer.branches.length ? h("p", { class: "hint" }, "點一句，走到你要補充的地方。") : null,
      h("div", { class: "replies" }, layer.branches.map((item, index) => h("a", {
        class: "reply",
        href: routeToHash({ name: "submit", kind: "branch", id: objection.id, path: layer.path.concat(index) }),
      }, item.clientSays))),
      layer.path.length ? h("button", {
        type: "button",
        class: "btn",
        onclick: () => go(routeToHash({ name: "submit", kind: "branch", id: objection.id, path: layer.path.slice(0, -1) })),
      }, "上一步") : null,
      field("客戶可能會說", "clientSays", "textarea", ""),
      field("我們接著問", "followUp", "textarea", ""),
      dimensionPicker(),
    );
  }
  add(
    h("div", { class: "hp", "aria-hidden": "true" }, [
      h("label", {}, ["公司", h("input", {
        tabindex: "-1",
        autocomplete: "off",
        value: state.draft.company,
        oninput: (event) => { state.draft.company = event.target.value; },
      })]),
    ]),
    state.formError ? h("p", { class: "notice error" }, state.formError) : null,
    h("button", { type: "submit", class: "btn primary", disabled: state.sending }, state.sending ? "送出中…" : (state.endpoint ? "送出投稿" : "產生投稿文字")),
  );
  if (state.result) form.append(renderResult());
  return h("div", {}, [
    h("p", { class: "lede" }, branch ? "請不要填寫客戶的姓名或電話。" : "請不要填寫客戶的姓名、電話或其他個資。"),
    form,
  ]);
}

function categoryList() {
  const names = categoriesOf(state.bank.objections, state.draft.bank).map((group) => group.category);
  return h("datalist", { id: "cat-list" }, names.map((name) => h("option", { value: name })));
}

function field(label, key, type, placeholder) {
  const input = type === "textarea"
    ? h("textarea", {
      id: key,
      rows: "3",
      placeholder,
      value: state.draft[key] || "",
      oninput: (event) => { state.draft[key] = event.target.value; saveDraft(); },
    })
    : h("input", {
      id: key,
      type: "text",
      placeholder,
      list: key === "category" ? "cat-list" : null,
      value: state.draft[key] || "",
      autocomplete: key === "submitter" ? "name" : "off",
      oninput: (event) => { state.draft[key] = event.target.value; saveDraft(); },
    });
  return h("label", { class: "field", for: key }, [label, input]);
}

function dimensionPicker() {
  return h("fieldset", { class: "field" }, [
    h("legend", {}, "這一問屬於哪一面"),
    h("div", { class: "choices" }, DIMENSIONS.map((dim) => h("label", { class: "choice", "data-dim": dim }, [
      h("input", {
        type: "radio",
        name: "dimension",
        value: dim,
        checked: state.draft.dimension === dim,
        onchange: () => { state.draft.dimension = dim; saveDraft(); },
      }),
      dim,
    ]))),
  ]);
}

function payloadFrom(route) {
  const base = {
    submitter: state.draft.submitter.trim(),
    dimension: state.draft.dimension,
    company: state.draft.company.trim(),
  };
  if (route.kind === "branch") {
    const objection = findObjection(state.bank, route.id);
    const layer = resolveLayer(objection.tree, route.path);
    return {
      ...base,
      type: "branch",
      objectionId: objection.id,
      objectionTitle: objection.title,
      nodePath: nodePathString(layer.path),
      parentQuestion: layer.text,
      clientSays: state.draft.clientSays.trim(),
      followUp: state.draft.followUp.trim(),
    };
  }
  const bank = (state.bank.banks || []).find((item) => item.id === state.draft.bank);
  return {
    ...base,
    type: "new_objection",
    bank: state.draft.bank,
    bankTitle: bank ? bank.title : "",
    category: state.draft.category.trim(),
    title: state.draft.title.trim(),
    C: state.draft.C.trim(),
    A: state.draft.A.trim(),
    R: state.draft.R.trim(),
    question: state.draft.question.trim(),
  };
}

function validate(route, payload) {
  if (payload.company) return "";
  if (!payload.submitter) return "請留下你的名字。";
  if (route.kind === "branch") {
    if (!payload.clientSays) return "請寫客戶可能會說的話。";
    if (!payload.followUp) return "請寫我們接著要問的那一句。";
    if (!payload.dimension) return "請選這一問屬於哪一面。";
    return "";
  }
  if (!payload.category) return "請寫分類。";
  if (!payload.title) return "請寫客戶的反對問題。";
  if (payload.question && !payload.dimension) return "有主問句的話，請選它屬於哪一面。";
  return "";
}

async function onSubmit(event) {
  event.preventDefault();
  const route = parseRoute(location.hash);
  const payload = payloadFrom(route);
  const error = validate(route, payload);
  state.formError = error;
  if (error) {
    state.result = null;
    render();
    return;
  }
  if (payload.company) {
    state.result = { kind: "sent" };
    render();
    return;
  }
  const text = formatSubmission(payload);
  if (!state.endpoint) {
    state.result = { kind: "copy", text };
    render();
    return;
  }
  state.sending = true;
  state.result = null;
  render();
  try {
    await sendSubmission(payload);
    state.result = { kind: "sent" };
    state.draft.clientSays = "";
    state.draft.followUp = "";
    state.draft.title = "";
    state.draft.question = "";
    state.draft.C = "";
    state.draft.A = "";
    state.draft.R = "";
    saveDraft();
  } catch {
    state.result = { kind: "error", text };
  } finally {
    state.sending = false;
    render();
  }
}

async function sendSubmission(payload) {
  const body = JSON.stringify(payload);
  const url = new URL(state.endpoint);
  const encoded = `${url.toString()}${url.search ? "&" : "?"}payload=${encodeURIComponent(body)}&_=${Date.now()}`;
  if (encoded.length < 7000) {
    const response = await fetch(encoded, { method: "GET", cache: "no-store" });
    const data = await readJson(response);
    if (data && data.ok && data.id) return data;
  }
  const response = await fetch(state.endpoint, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body,
    redirect: "follow",
  });
  const data = await readJson(response);
  if (data && data.ok && data.id) return data;
  throw new Error("送出沒有成功");
}

async function readJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function renderResult() {
  if (state.result.kind === "sent") {
    return h("p", { class: "notice" }, "已送出。負責人勾了審核之後，這則會標成夥伴分享。");
  }
  const failed = state.result.kind === "error";
  return h("div", {}, [
    h("p", { class: failed ? "notice error" : "notice" }, failed
      ? "連不上試算表。請改把下面的文字貼給負責人。"
      : "請把下面的文字貼給負責人。"),
    h("textarea", { class: "copy-box", readonly: true, id: "copy-box" }, state.result.text),
    h("button", { type: "button", class: "btn", onclick: copyResult }, "複製投稿文字"),
  ]);
}

async function copyResult(event) {
  const text = document.getElementById("copy-box")?.value || state.result?.text || "";
  const ok = await copyText(text);
  event.currentTarget.textContent = ok ? "已複製" : "請手動選取上面的文字";
}

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      const writing = navigator.clipboard.writeText(text);
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("copy-timeout")), 1200));
      await Promise.race([writing, timeout]);
      return true;
    }
  } catch {
    /* 改用選取 */
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.left = "0";
  area.style.top = "0";
  area.style.opacity = "0";
  document.body.append(area);
  area.focus();
  area.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch { ok = false; }
  area.remove();
  return ok;
}

function renderMissingBank() {
  return [
    h("h1", {}, "題庫讀不到"),
    h("p", { class: "lede" }, "請確認 data/bank.json 有一起發布，然後重新整理。"),
    h("button", { type: "button", class: "btn", onclick: () => boot() }, "再試一次"),
  ];
}

function render() {
  if (!state.bank) return;
  const saved = captureUi();
  const route = parseRoute(location.hash);
  let body = [];
  if (route.name === "objection") body = renderObjection(route);
  else if (route.name === "bank") body = renderBankPage(route.id);
  else if (route.name === "library") body = renderLibrary();
  else if (route.name === "submit") body = renderSubmit(route);
  else {
    document.title = "問句王｜富邦人壽業務夥伴";
    body = renderHome();
  }
  const parts = [h("main", { class: "page" }, body)];
  if (route.name !== "home") parts.unshift(renderBack(route));
  app.replaceChildren(...parts);
  restoreUi(saved);
  const routeKey = `${location.hash}|${state.query && (route.name === "home" || route.name === "submit") ? "q" : ""}`;
  if (routeKey !== lastRoute) {
    const previous = lastRoute;
    lastRoute = routeKey;
    const sameSearch = previous.startsWith(`${location.hash}|`);
    if (!sameSearch) window.scrollTo(0, 0);
  }
}

async function loadCommunity() {
  if (!state.endpoint) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(state.endpoint, { cache: "no-store", signal: controller.signal });
    const data = await readJson(response);
    if (!data || data.ok === false || !Array.isArray(data.items)) throw new Error("bad");
    state.bank = applySubmissions(state.base, data.items).bank;
    state.communityError = "";
    render();
  } catch {
    state.communityError = "讀取失敗";
    render();
  } finally {
    clearTimeout(timer);
  }
}

async function boot() {
  state.endpoint = endpoint();
  try {
    const response = await fetch(new URL("../data/bank.json", import.meta.url));
    if (!response.ok) throw new Error(String(response.status));
    state.base = await response.json();
    state.bank = state.base;
    app.dataset.ready = "1";
    render();
    await loadCommunity();
    app.dataset.community = state.endpoint ? (state.communityError ? "error" : "ok") : "off";
  } catch {
    app.replaceChildren(h("main", { class: "page" }, renderMissingBank()));
  }
}

window.addEventListener("hashchange", () => {
  state.formError = "";
  render();
});

boot();
