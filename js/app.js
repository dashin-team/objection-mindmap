import {
  BANK_ORDER,
  DIMENSIONS,
  applySubmissions,
  categoriesOf,
  findObjection,
  formatFive,
  formatSubmission,
  nodePathString,
  parseRoute,
  pathCrumbs,
  pathDimensions,
  resolveLayer,
  routeToHash,
  sanitizeNotes,
  searchObjections,
  snippetAround,
} from "./logic.js";

const NOTES_KEY = "wenjuwang-five-notes-v1";
const DRAFT_KEY = "wenjuwang-draft-v1";

const state = {
  bank: null,
  communityError: "",
  endpoint: "",
  notes: loadNotes(),
  confirmClear: false,
  query: "",
  draft: loadDraft(),
  formError: "",
  sending: false,
  result: null,
};

const app = document.getElementById("app");
let composing = false;
let lastRoute = "";

function loadNotes() {
  try {
    return sanitizeNotes(JSON.parse(localStorage.getItem(NOTES_KEY) || "{}"));
  } catch {
    return sanitizeNotes(null);
  }
}

function saveNotes() {
  localStorage.setItem(NOTES_KEY, JSON.stringify(state.notes));
}

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

function partnerBadge(partner) {
  if (!partner) return null;
  const name = partner.name ? ` · ${partner.name}` : "";
  return h("span", { class: "badge" }, `夥伴分享${name}`);
}

function renderTopbar(route) {
  const onHome = route.name === "home";
  const title = route.name === "objection" ? findObjection(state.bank, route.id)?.title || "" : "";
  return h("header", { class: "topbar" }, [
    onHome
      ? h("a", { class: "brand", href: "#/" }, [h("span", { class: "seal-mark", "aria-hidden": "true" }, "問"), "問句王"])
      : h("a", { class: "brand", href: "#/" }, "‹ 題庫"),
    title ? h("p", { class: "top-title" }, title) : null,
    route.name === "submit"
      ? h("span", { class: "submit-link", "aria-current": "page" }, "投稿")
      : h("a", { class: "submit-link", href: "#/submit" }, "投稿"),
  ]);
}

function renderFooter() {
  const version = state.bank?.version || "";
  return h("footer", { class: "footer" }, [
    h("p", {}, "筆記只存在這支手機，不會上傳。請不要把客戶的姓名、電話寫進格子或投稿。"),
    h("p", {}, [
      version ? `題庫版本 ${version}。` : "",
      " ",
      h("a", { href: "https://github.com/dashin-team/objection-mindmap#readme", target: "_blank", rel: "noopener noreferrer" }, "如何改題庫"),
    ]),
  ]);
}

function renderHome(route) {
  const query = state.query.trim();
  const banks = state.bank.banks || [];
  const results = query ? searchObjections(state.bank.objections, query) : [];
  const shared = state.bank.objections.filter((item) => item.partner).length;
  const nodes = [
    h("p", { class: "eyebrow" }, "富邦人壽業務夥伴"),
    h("h1", {}, "問句王"),
    h("p", { class: "lede" }, "一次只看一句。點客戶可能的回答，就換到下一句；問到哪個面向，五宮格就亮哪一格。"),
    h("form", { class: "search", role: "search", onsubmit: (event) => event.preventDefault() }, [
      h("label", { class: "sr", for: "search" }, "搜尋反對問題或問句"),
      h("input", {
        id: "search",
        type: "search",
        enterkeyhint: "search",
        placeholder: "搜尋反對問題，或任何一句問法",
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
    nodes.push(h("p", { class: "notice error" }, "夥伴分享暫時讀不到，目前顯示題庫原文。重新整理可以再試一次。"));
  } else if (shared) {
    nodes.push(h("p", { class: "notice" }, `已載入夥伴分享 ${shared} 則。`));
  }
  if (query) {
    nodes.push(h("h2", { style: "margin-top:16px" }, results.length ? `找到 ${results.length} 題` : "沒有符合的題目"));
    if (!results.length) {
      nodes.push(h("p", { class: "hint" }, "可以換個說法，或清除搜尋，改從下面的題庫找。"));
    }
    results.forEach(({ objection, snippet }) => {
      const title = h("span", { class: "says" });
      title.append(highlight(objection.title, query));
      const link = h("a", { class: "result-link", href: routeToHash({ name: "objection", id: objection.id, path: [], mode: "tree" }) }, [
        h("span", { class: "meta" }, `${objection.bankTitle} · ${objection.category}`),
        title,
        objection.partner ? h("span", { class: "partner-line" }, [partnerBadge(objection.partner)]) : null,
      ]);
      if (snippet) {
        const line = h("p", { class: "snippet" });
        line.append(highlight(snippet, query));
        link.append(line);
      }
      nodes.push(link);
    });
  } else {
    banks.forEach((bank) => nodes.push(renderBank(bank)));
    nodes.push(renderFrameworks());
    if (route.scroll === "frameworks") {
      nodes.push(h("span", { id: "frameworks-mark" }));
    }
  }
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

function renderBank(bank) {
  const groups = categoriesOf(state.bank.objections, bank.id);
  return h("section", { class: "bank", "data-bank": bank.id }, [
    h("div", { class: "bank-head" }, [
      h("h2", {}, bank.title),
      h("span", { class: "count" }, `${groups.reduce((sum, group) => sum + group.items.length, 0)} 題`),
    ]),
    ...groups.map((group) => h("details", { class: "cat", id: `cat-${bank.id}-${group.category}` }, [
      h("summary", {}, [group.category, h("span", { class: "count" }, String(group.items.length))]),
      ...group.items.map((item) => h("a", { class: "obj-link", href: `#/o/${item.id}` }, [
        item.n < 10000 ? h("span", { class: "meta" }, `${item.n}. `) : null,
        item.title,
        item.partner ? h("span", { class: "partner-line" }, [partnerBadge(item.partner)]) : null,
      ])),
    ])),
  ]);
}

function renderEItem(text) {
  const match = /^(外部|內部)｜(.*)$/.exec(text);
  if (!match) return h("li", {}, text);
  return h("li", {}, [h("span", { class: "tag" }, match[1]), match[2]]);
}

function renderCare(cell) {
  return h("div", { class: "care" }, [
    h("p", { class: "purpose" }, cell.purpose || ""),
    cell.C ? h("div", {}, [h("span", { class: "kicker" }, "C 同理"), cell.C]) : null,
    cell.A ? h("div", {}, [h("span", { class: "kicker" }, "A 確認"), cell.A]) : null,
    cell.R ? h("div", {}, [h("span", { class: "kicker" }, "R 延伸"), cell.R]) : null,
    h("div", {}, [
      h("span", { class: "kicker" }, "E 探詢"),
      h("ol", { class: "e-list" }, (cell.E || []).map(renderEItem)),
    ]),
  ]);
}

function renderFrameworks() {
  const five = state.bank.frameworks.find((item) => item.id === "goal-five-grid");
  const nine = state.bank.frameworks.find((item) => item.id === "nine-grid");
  return h("section", { class: "frameworks", id: "frameworks" }, [
    h("div", { class: "section-head" }, [h("h2", {}, "九宮格／五宮格 問句庫")]),
    h("p", { class: "lede" }, "面談時搭配的 CARE。C 同理、A 確認、R 延伸，E 才是真正要問到的資訊。"),
    five ? renderFiveLibrary(five) : null,
    nine ? renderNineLibrary(nine) : null,
  ]);
}

function positionMap() {
  const spot = (dim, area) => h("div", { class: `key ${area}`, "data-dim": dim }, dim);
  return h("div", { class: "five five-key", "aria-hidden": "true" }, [
    spot("需求", "need"),
    spot("決策流程", "decision"),
    spot("資源分配", "resource"),
    spot("競爭情報", "compete"),
    spot("目標", "goal"),
  ]);
}

function renderFiveLibrary(framework) {
  const byName = new Map(framework.cells.map((cell) => [cell.name, cell]));
  const order = ["目標", "需求", "資源分配", "決策流程", "競爭情報"];
  return h("article", { class: "framework" }, [
    h("h3", {}, framework.name),
    h("p", { class: "purpose" }, framework.note || ""),
    positionMap(),
    h("p", { class: "hint" }, "紙本上目標在中間，需求在左上，決策流程在右上，資源分配在左下，競爭情報在右下。"),
    ...order.map((name) => {
      const cell = byName.get(name);
      if (!cell) return null;
      return h("details", { class: "cell", id: `fw-${framework.id}-${cell.no}` }, [
        h("summary", {}, [h("span", { "data-dim": name, class: "pill" }, name)]),
        renderCare(cell),
      ]);
    }),
    framework.tip ? h("p", { class: "callout" }, framework.tip) : null,
  ]);
}

function renderNineLibrary(framework) {
  return h("article", { class: "framework" }, [
    h("h3", {}, framework.name),
    h("p", { class: "purpose" }, framework.note || ""),
    ...framework.cells.map((cell) => h("details", { class: "cell", id: `fw-${framework.id}-${cell.no}` }, [
      h("summary", {}, [
        `${cell.no}. ${cell.name}`,
        cell.no === 1 ? h("span", { class: "badge" }, "中心格") : null,
      ]),
      renderCare(cell),
    ])),
    framework.tip ? h("p", { class: "callout" }, framework.tip) : null,
  ]);
}

function boxState(dim, dims, current) {
  if (current && dim === current) return "current";
  const previous = current ? dims.slice(0, -1) : dims;
  if (previous.includes(dim)) return "visited";
  return "idle";
}

function renderTracker(current, dims) {
  const place = [
    ["需求", "need"],
    ["決策流程", "decision"],
    ["資源分配", "resource"],
    ["競爭情報", "compete"],
    ["目標", "goal"],
  ];
  const intro = current
    ? `現在這句是「${current}」，那一格會亮起來。邊談邊把客戶的回答記在格子裡。`
    : "收尾不對應五宮格。剛才問過的面向還留著顏色。";
  return h("section", { class: "tracker", id: "tracker" }, [
    h("div", { class: "tracker-head" }, [
      h("h2", {}, "目標五宮格"),
      h("p", {}, intro),
    ]),
    h("div", { class: "five", id: "five" }, place.map(([dim, area]) => {
      const fieldId = `note-${dim}`;
      return h("section", { class: `box ${area}`, "data-dim": dim, "data-state": boxState(dim, dims, current) }, [
        h("label", { class: "box-name", for: fieldId }, dim),
        h("textarea", {
          id: fieldId,
          rows: "2",
          placeholder: "記下客戶說的話",
          "aria-label": `${dim}的筆記`,
          value: state.notes[dim] || "",
          oninput: (event) => {
            state.notes[dim] = event.target.value;
            saveNotes();
          },
        }),
      ]);
    })),
    h("div", { class: "row actions" }, [
      h("button", { type: "button", class: "btn primary", id: "copy-five", onclick: copyFive }, "複製五宮格"),
      state.confirmClear
        ? h("button", { type: "button", class: "btn", onclick: clearNotes }, "確定清除")
        : h("button", { type: "button", class: "btn ghost", onclick: () => { state.confirmClear = true; render(); } }, "清除筆記"),
      state.confirmClear
        ? h("button", { type: "button", class: "btn ghost", onclick: () => { state.confirmClear = false; render(); } }, "取消")
        : null,
    ]),
    h("p", { class: "hint" }, "複製後可貼到 LINE。換下一位客戶前，請先複製或清除。"),
  ]);
}

async function copyFive(event) {
  const text = formatFive(state.notes);
  const ok = await copyText(text);
  const button = event.currentTarget;
  if (!ok) {
    let box = document.getElementById("five-copy");
    if (!box) {
      box = h("textarea", { id: "five-copy", class: "copy-box", readonly: true });
      button.parentElement.after(box);
    }
    box.value = text;
    box.focus();
    box.select();
  }
  button.textContent = ok ? "已複製" : "請長按框裡的文字複製";
  setTimeout(() => { button.textContent = "複製五宮格"; }, 1600);
}

function clearNotes() {
  state.notes = sanitizeNotes(null);
  saveNotes();
  state.confirmClear = false;
  render();
}

function renderObjection(route) {
  const objection = findObjection(state.bank, route.id);
  if (!objection) {
    return [
      h("h1", {}, "找不到這題"),
      h("p", { class: "lede" }, "可能編號不對，或這題已經從題庫拿掉了。"),
      h("a", { class: "btn", href: "#/" }, "回題庫"),
    ];
  }
  const layer = resolveLayer(objection.tree, route.path);
  if (layer.path.join(",") !== route.path.join(",")) {
    route.path = layer.path.slice();
    const hash = routeToHash(route);
    if (location.hash !== hash) history.replaceState(null, "", hash);
  }
  const dims = pathDimensions(objection.tree, layer.path);
  const closingOnly = route.mode === "closing";
  const current = closingOnly ? "" : layer.dimension;
  const crumbs = pathCrumbs(objection.tree, layer.path);
  const nodes = [
    h("p", { class: "obj-kicker" }, `${objection.bankTitle} · ${objection.category}${objection.n < 10000 ? ` · 第 ${objection.n} 題` : ""}`),
    h("h1", {}, objection.title),
    objection.partner ? partnerBadge(objection.partner) : null,
    renderOpening(objection),
    h("div", { id: "layer" }, [
      renderCrumbs(route, crumbs, closingOnly),
      h("div", { class: "row" }, [
        h("button", {
          type: "button",
          class: "btn",
          id: "back",
          disabled: !closingOnly && layer.path.length === 0,
          onclick: () => go(backHash(route)),
        }, "上一步"),
        !closingOnly && !(layer.ended && objection.closing)
          ? h("button", { type: "button", class: "btn primary", onclick: () => go(routeToHash({ ...route, mode: "closing" })) }, "進入收尾")
          : null,
        h("a", {
          class: "btn ghost",
          href: routeToHash({ name: "submit", kind: "branch", id: objection.id, path: closingOnly ? layer.path : layer.path }),
        }, "在這句下面投稿"),
      ]),
      closingOnly ? renderClosing(objection, true) : renderLayer(objection, layer),
    ]),
    renderTracker(current, closingOnly ? dims : dims),
  ];
  document.title = `${objection.title}｜問句王`;
  return nodes;
}

function renderOpening(objection) {
  const blocks = [
    objection.C ? ["C 同理", objection.C] : null,
    objection.A ? ["A 確認", objection.A] : null,
    objection.R ? ["R 延伸", objection.R] : null,
  ].filter(Boolean);
  if (!blocks.length) return null;
  return h("details", { class: "opening", id: "opening", "data-for": objection.id }, [
    h("summary", {}, "開場話術"),
    h("div", { class: "scripts" }, blocks.map(([label, text]) => h("div", { class: "script" }, [
      h("span", { class: "kicker" }, label),
      text,
    ]))),
  ]);
}

function renderCrumbs(route, crumbs, closingOnly) {
  const nodes = [];
  crumbs.forEach((crumb, index) => {
    if (index) nodes.push(h("span", { class: "sep" }, "›"));
    const last = index === crumbs.length - 1 && !closingOnly;
    if (last) nodes.push(h("span", { class: "crumb-now", title: crumb.label }, crumb.label));
    else {
      nodes.push(h("button", {
        type: "button",
        title: crumb.label,
        onclick: () => go(routeToHash({ name: "objection", id: route.id, path: crumb.path, mode: "tree" })),
      }, crumb.label));
    }
  });
  if (closingOnly) {
    nodes.push(h("span", { class: "sep" }, "›"));
    nodes.push(h("span", { class: "crumb-now" }, "收尾"));
  }
  return h("nav", { class: "crumbs", "aria-label": "問句路徑" }, nodes);
}

function backHash(route) {
  if (route.mode === "closing") return routeToHash({ ...route, mode: "tree" });
  if (route.path.length) return routeToHash({ ...route, path: route.path.slice(0, -1), mode: "tree" });
  return "#/";
}

function renderLayer(objection, layer) {
  const partner = layer.isRoot ? null : layer.partner;
  const nodes = [];
  if (!layer.isRoot && layer.clientSays) {
    nodes.push(h("p", { class: "echo" }, `客戶這邊：「${layer.clientSays}」`));
  }
  nodes.push(h("article", { class: "qcard", id: "current-question", "data-dim": layer.dimension || "需求" }, [
    layer.dimension ? h("span", { class: "pill" }, layer.dimension) : null,
    h("p", { class: "ask" }, layer.text),
    partner ? h("p", { class: "partner-line" }, [partnerBadge(partner)]) : null,
  ]));
  if (layer.branches.length) {
    nodes.push(h("p", { class: "hint" }, "客戶可能會怎麼說？點一下，看下一句。"));
    nodes.push(h("div", { class: "replies" }, layer.branches.map((branch, index) => h("button", {
      type: "button",
      class: "reply",
      "data-dim": branch.dimension,
      "data-index": String(index),
      onclick: () => go(routeToHash({
        name: "objection",
        id: objection.id,
        path: layer.path.concat(index),
        mode: "tree",
      })),
    }, [
      h("span", { class: "who" }, `下一句 · ${branch.dimension}`),
      h("span", { class: "says" }, branch.clientSays),
      branch.partner ? h("span", { class: "partner-line" }, [partnerBadge(branch.partner)]) : null,
    ]))));
  } else {
    nodes.push(h("p", { class: "end-note" }, "這一支問完了。下面是收尾。"));
    nodes.push(renderClosing(objection, false));
  }
  return h("div", {}, nodes);
}

function renderClosing(objection, standalone) {
  const closing = objection.closing;
  const body = [h("h2", {}, "收尾")];
  if (!closing || !closing.bridge) {
    body.push(h("p", { class: "end-note" }, "這題還沒有收尾話術。"));
  } else {
    body.push(h("article", { class: "qcard bridge" }, [
      h("span", { class: "kicker" }, "橋接"),
      h("p", { class: "ask" }, closing.bridge),
    ]));
    body.push(h("div", { class: "replies" }, (closing.replies || []).map((reply) => h("article", { class: "reply" }, [
      h("span", { class: "who" }, "客戶可能會說"),
      h("span", { class: "says" }, reply.clientSays),
      h("span", { class: "follow" }, [h("span", { class: "kicker" }, "接著問"), reply.followUp]),
    ]))));
    if (closing.nextStep) {
      body.push(h("div", { class: "next-step" }, [
        h("span", { class: "kicker" }, "邀請下一步"),
        h("p", {}, closing.nextStep),
      ]));
    }
  }
  return h("section", { class: "closing-block", id: "closing" }, body.concat(
    standalone ? [] : [],
  ));
}

function renderSubmit(route) {
  document.title = "投稿｜問句王";
  const nodes = [
    h("p", { class: "eyebrow" }, "夥伴投稿"),
    h("h1", {}, route.kind === "new" ? "新的反對問題" : route.kind === "branch" ? "幫現有的題目加一句" : "把你用過的問法留下來"),
  ];
  if (route.kind === "choose") {
    nodes.push(h("p", { class: "lede" }, "送出後先給負責人看過，核可了才會出現在題庫，並標上你的名字。"));
    nodes.push(h("div", { class: "replies" }, [
      h("a", { class: "reply", href: "#/submit/new" }, [
        h("span", { class: "who" }, "新的一題"),
        h("span", { class: "says" }, "客戶常說的一句話，題庫裡還沒有。"),
      ]),
      h("a", { class: "reply", href: "#/submit/branch" }, [
        h("span", { class: "who" }, "加在某一句下面"),
        h("span", { class: "says" }, "補上客戶可能的回答，以及我們接著問的那一句。"),
      ]),
    ]));
    if (!state.endpoint) {
      nodes.push(h("p", { class: "notice" }, "還沒接上試算表。填完後會產生一段文字，複製貼給負責人即可。"));
    }
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
  const list = query ? searchObjections(state.bank.objections, query) : state.bank.objections.slice(0, 12).map((objection) => ({ objection, snippet: "" }));
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
      class: "result-link",
      href: routeToHash({ name: "submit", kind: "branch", id: objection.id, path: [] }),
    }, [
      h("span", { class: "meta" }, objection.bankTitle),
      h("span", { class: "says" }, objection.title),
    ])),
    query ? null : h("p", { class: "hint" }, "先列出前面幾題。輸入關鍵字可以找完全部 240 題。"),
  ]);
}

function renderSubmitForm(route) {
  const branch = route.kind === "branch";
  const objection = branch ? findObjection(state.bank, route.id) : null;
  if (branch && !objection) {
    return h("p", { class: "end-note" }, "找不到要補充的題目。");
  }
  const layer = branch ? resolveLayer(objection.tree, route.path) : null;
  const nodes = [h("form", { class: "form", id: "post-form", onsubmit: onSubmit }, [])];
  const form = nodes[0];
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
          bank.title.replace("反對問題", ""),
        ]))),
      ]),
      field("分類", "category", "text", "例如：不信任類，可選也可自填"),
      categoryList(),
      field("客戶的反對問題", "title", "textarea", "客戶會怎麼說"),
      field("同理（可空白）", "C", "textarea", "先接住情緒的一句"),
      field("確認（可空白）", "A", "textarea", ""),
      field("延伸（可空白）", "R", "textarea", ""),
      field("主問句（可空白）", "question", "textarea", "你接著想問的那一句"),
      dimensionPicker(),
    );
  } else {
    add(
      h("p", { class: "hint" }, "走到你要補充的那一句。新的回答會加在它下面。"),
      h("article", { class: "qcard", "data-dim": layer.dimension || "需求" }, [
        layer.dimension ? h("span", { class: "pill" }, layer.dimension) : null,
        h("p", { class: "ask" }, layer.text),
      ]),
      layer.branches.length ? h("p", { class: "hint" }, "點下面的回答可以再往下一層。") : h("p", { class: "hint" }, "這句下面目前沒有分支，新的回答會從這裡開始。"),
      h("div", { class: "replies" }, layer.branches.map((item, index) => h("a", {
        class: "reply",
        "data-dim": item.dimension,
        href: routeToHash({ name: "submit", kind: "branch", id: objection.id, path: layer.path.concat(index) }),
      }, [
        h("span", { class: "who" }, "走到下一層"),
        h("span", { class: "says" }, item.clientSays),
      ]))),
      layer.path.length ? h("button", {
        type: "button",
        class: "btn",
        onclick: () => go(routeToHash({ name: "submit", kind: "branch", id: objection.id, path: layer.path.slice(0, -1) })),
      }, "上一步") : null,
      field("客戶可能會說", "clientSays", "textarea", "口語，像客戶真的會講的"),
      field("我們接著問", "followUp", "textarea", "接這句回答之後要問的話"),
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
  return h("div", {}, [h("p", { class: "lede" }, branch ? `題目：${objection.title}` : "請不要填寫客戶的姓名、電話或其他個資。"), ...nodes]);
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
    h("legend", {}, "這一問屬於五宮格的哪一面"),
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
  if (!payload.submitter) return "請留下你的名字，夥伴分享才知道是誰補的。";
  if (route.kind === "branch") {
    if (!payload.clientSays) return "請寫客戶可能會說的話。";
    if (!payload.followUp) return "請寫我們接著要問的那一句。";
    if (!payload.dimension) return "請選這一問屬於哪一面。";
    return "";
  }
  if (!payload.category) return "請寫分類，或從清單選一個。";
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
    return h("div", { class: "notice" }, [
      h("p", {}, "已送出，謝謝。負責人在試算表勾了審核之後，這則就會出現，並標上「夥伴分享」。"),
    ]);
  }
  const failed = state.result.kind === "error";
  return h("div", {}, [
    h("p", { class: failed ? "notice error" : "notice" }, failed
      ? "連不上試算表。請改把下面的文字貼給負責人，內容還在。"
      : "還沒接上試算表。請把下面的文字貼給負責人。"),
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
      const timeout = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("copy-timeout")), 1200);
      });
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
  else if (route.name === "submit") body = renderSubmit(route);
  else {
    document.title = "問句王｜富邦人壽業務夥伴";
    body = renderHome(route);
  }
  app.replaceChildren(
    renderTopbar(route),
    h("main", { class: "page" }, body),
    renderFooter(),
  );
  restoreUi(saved);
  const routeKey = `${location.hash}|${state.query && route.name === "home" ? "q" : ""}`;
  if (routeKey !== lastRoute) {
    const previous = lastRoute;
    lastRoute = routeKey;
    const sameSearch = previous.startsWith(`${location.hash}|`) && route.name === "home";
    if (!sameSearch) {
      const deep = route.name === "objection" && (route.path.length || route.mode === "closing");
      if (route.scroll === "frameworks" && !state.query) {
        document.getElementById("frameworks")?.scrollIntoView();
      } else if (deep) {
        document.getElementById("layer")?.scrollIntoView({ block: "start" });
      } else {
        window.scrollTo(0, 0);
      }
    }
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
    const merged = applySubmissions(state.base, data.items);
    state.bank = merged.bank;
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
