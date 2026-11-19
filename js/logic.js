/**
 * 問句王純邏輯：不含畫面。瀏覽器與測試都用這份。
 * 題庫形狀見 README。投稿資料只在審核欄為真時併入。
 */

export const DIMENSIONS = ["目標", "需求", "決策流程", "資源分配", "競爭情報"];

export const BANK_ORDER = ["insurance", "finance", "advanced"];

const APPROVED_YES = new Set(["TRUE", "YES", "Y", "1", "是"]);

export function isApproved(item) {
  if (!item || typeof item !== "object") return false;
  if (!Object.prototype.hasOwnProperty.call(item, "approved")) return true;
  const value = item.approved;
  if (value === true) return true;
  if (value === false || value == null) return false;
  return APPROVED_YES.has(String(value).trim().toUpperCase());
}

export function validDimension(value) {
  const text = String(value || "").trim();
  return DIMENSIONS.includes(text) ? text : "";
}

export function clip(value, max) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return text.slice(0, max);
}

export function parseRoute(hash) {
  const raw = decodeURIComponent(String(hash || "").replace(/^#/, ""));
  const parts = raw.split("/").filter(Boolean);
  if (parts.length === 0) return { name: "home" };
  if (parts[0] === "frameworks") return { name: "home", scroll: "frameworks" };
  if (parts[0] === "o" && parts[1]) {
    const rest = parts.slice(2);
    const path = [];
    let mode = "tree";
    let reply = null;
    for (let i = 0; i < rest.length; i += 1) {
      if (rest[i] === "closing") {
        mode = "closing";
        if (/^\d+$/.test(rest[i + 1] || "")) reply = Number(rest[i + 1]);
        break;
      }
      if (/^\d+$/.test(rest[i])) path.push(Number(rest[i]));
      else break;
    }
    return { name: "objection", id: parts[1], path, mode, reply };
  }
  if (parts[0] === "submit") {
    if (parts[1] === "new") return { name: "submit", kind: "new" };
    if (parts[1] === "branch") {
      const id = parts[2] || "";
      const path = parts.slice(3).filter((part) => /^\d+$/.test(part)).map(Number);
      return { name: "submit", kind: "branch", id, path };
    }
    return { name: "submit", kind: "choose" };
  }
  return { name: "home" };
}

export function routeToHash(route) {
  if (!route || route.name === "home") {
    return route && route.scroll === "frameworks" ? "#/frameworks" : "#/";
  }
  if (route.name === "submit") {
    if (route.kind === "new") return "#/submit/new";
    if (route.kind === "branch") {
      const bits = ["#/submit/branch"];
      if (route.id) bits.push(route.id);
      (route.path || []).forEach((index) => bits.push(String(index)));
      return bits.join("/");
    }
    return "#/submit";
  }
  if (route.name === "objection") {
    const bits = ["#/o", route.id, ...(route.path || []).map(String)];
    if (route.mode === "closing") {
      bits.push("closing");
      if (Number.isInteger(route.reply)) bits.push(String(route.reply));
    }
    return bits.join("/");
  }
  return "#/";
}

export function categoriesOf(objections, bankId) {
  const groups = [];
  const index = new Map();
  objections
    .filter((item) => item.bank === bankId)
    .slice()
    .sort((a, b) => a.n - b.n)
    .forEach((item) => {
      if (!index.has(item.category)) {
        index.set(item.category, groups.length);
        groups.push({ category: item.category, items: [] });
      }
      groups[index.get(item.category)].items.push(item);
    });
  return groups;
}

function pushQuestion(list, text) {
  const value = String(text || "").trim();
  if (value) list.push(value);
}

export function questionTexts(objection) {
  const list = [];
  (objection.E || []).forEach((text) => pushQuestion(list, text));
  const walk = (node, isRoot) => {
    if (!node) return;
    if (isRoot) pushQuestion(list, node.text);
    else pushQuestion(list, node.followUp);
    (node.branches || []).forEach((branch) => walk(branch, false));
  };
  walk(objection.tree, true);
  const closing = objection.closing;
  if (closing) {
    pushQuestion(list, closing.bridge);
    (closing.replies || []).forEach((reply) => pushQuestion(list, reply.followUp));
    pushQuestion(list, closing.nextStep);
  }
  return list;
}

export function snippetAround(text, query) {
  const source = String(text || "").replace(/\s+/g, " ").trim();
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return "";
  const at = source.toLowerCase().indexOf(needle);
  if (at < 0) return "";
  const start = Math.max(0, at - 14);
  const end = Math.min(source.length, at + needle.length + 18);
  let snippet = source.slice(start, end);
  if (start > 0) snippet = `…${snippet}`;
  if (end < source.length) snippet = `${snippet}…`;
  return snippet;
}

export function searchObjections(objections, query) {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return [];
  const found = [];
  objections.forEach((objection) => {
    const title = String(objection.title || "");
    if (title.toLowerCase().includes(needle)) {
      found.push({ objection, snippet: "", titleHit: true });
      return;
    }
    const hit = questionTexts(objection).find((text) => text.toLowerCase().includes(needle));
    if (hit) found.push({ objection, snippet: snippetAround(hit, needle), titleHit: false });
  });
  const order = new Map(BANK_ORDER.map((id, index) => [id, index]));
  found.sort((a, b) => {
    if (a.titleHit !== b.titleHit) return a.titleHit ? -1 : 1;
    const bankDiff = (order.get(a.objection.bank) ?? 9) - (order.get(b.objection.bank) ?? 9);
    if (bankDiff) return bankDiff;
    return a.objection.n - b.objection.n;
  });
  return found;
}

export function resolveLayer(tree, path) {
  const taken = [];
  let node = tree || { text: "", dimension: "", branches: [] };
  const steps = path || [];
  for (let i = 0; i < steps.length; i += 1) {
    const index = steps[i];
    const branches = node.branches || [];
    if (!Number.isInteger(index) || index < 0 || index >= branches.length) break;
    node = branches[index];
    taken.push(index);
  }
  const isRoot = taken.length === 0;
  const branches = node.branches || [];
  return {
    path: taken,
    isRoot,
    text: isRoot ? node.text || "" : node.followUp || "",
    dimension: validDimension(node.dimension),
    branches,
    clientSays: isRoot ? "" : node.clientSays || "",
    partner: node.partner || null,
    ended: branches.length === 0,
  };
}

export function pathCrumbs(tree, path) {
  const crumbs = [{ label: "主問句", path: [] }];
  let node = tree;
  const taken = [];
  const steps = path || [];
  for (let i = 0; i < steps.length; i += 1) {
    const index = steps[i];
    const branches = (node && node.branches) || [];
    if (!Number.isInteger(index) || !branches[index]) break;
    node = branches[index];
    taken.push(index);
    crumbs.push({ label: node.clientSays || "客戶的回答", path: taken.slice() });
  }
  return crumbs;
}

export function pathDimensions(tree, path) {
  const layer = resolveLayer(tree, path);
  const dims = [];
  let node = tree;
  if (node && validDimension(node.dimension)) dims.push(node.dimension);
  layer.path.forEach((index) => {
    node = node.branches[index];
    const dim = validDimension(node.dimension);
    if (dim) dims.push(dim);
  });
  return dims;
}

export function findObjection(bank, id) {
  return (bank.objections || []).find((item) => item.id === id) || null;
}

function partnerMark(item) {
  const name = clip(item.submitter, 40);
  return { name, id: String(item.id || "") };
}

export function applySubmissions(bank, items) {
  const next = JSON.parse(JSON.stringify(bank));
  const report = { objections: 0, branches: 0, skipped: 0 };
  const seen = new Set();
  (items || []).forEach((item) => {
    if (!isApproved(item)) {
      report.skipped += 1;
      return;
    }
    const key = String(item.id || "");
    if (key && seen.has(key)) {
      report.skipped += 1;
      return;
    }
    if (key) seen.add(key);
    const type = String(item.type || "").trim();
    if (type === "new_objection" || type === "objection") {
      const title = clip(item.title, 200);
      if (!title) {
        report.skipped += 1;
        return;
      }
      const bankId = BANK_ORDER.includes(item.bank) ? item.bank : "insurance";
      const bankMeta = (next.banks || []).find((entry) => entry.id === bankId);
      const dimension = validDimension(item.dimension) || "需求";
      const question = clip(item.question, 400);
      const objection = {
        id: `share-${key || `local-${next.objections.length}`}`,
        bank: bankId,
        bankTitle: bankMeta ? bankMeta.title : "保險反對問題",
        category: clip(item.category, 40) || "夥伴分享",
        n: 10000 + report.objections,
        title,
        C: clip(item.C, 400),
        A: clip(item.A, 400),
        R: clip(item.R, 400),
        E: question ? [question] : [],
        tree: {
          dimension,
          text: question || "（這則夥伴分享還沒有主問句，可以先順著反對問題往下聊。）",
          branches: [],
        },
        closing: null,
        partner: partnerMark(item),
      };
      next.objections.push(objection);
      report.objections += 1;
      return;
    }
    if (type === "branch" || type === "reply") {
      const host = findObjection(next, String(item.objectionId || "").trim());
      const clientSays = clip(item.clientSays, 300);
      const followUp = clip(item.followUp, 400);
      if (!host || !host.tree || !clientSays || !followUp) {
        report.skipped += 1;
        return;
      }
      const nodePath = String(item.nodePath || "")
        .split("/")
        .filter(Boolean)
        .map((part) => Number(part));
      const parent = walkToNode(host.tree, nodePath);
      if (!parent) {
        report.skipped += 1;
        return;
      }
      parent.branches = parent.branches || [];
      parent.branches.push({
        clientSays,
        dimension: validDimension(item.dimension) || "需求",
        followUp,
        branches: [],
        partner: partnerMark(item),
      });
      report.branches += 1;
      return;
    }
    report.skipped += 1;
  });
  (next.banks || []).forEach((entry) => {
    entry.count = next.objections.filter((item) => item.bank === entry.id).length;
  });
  return { bank: next, report };
}

function walkToNode(tree, path) {
  let node = tree;
  for (const index of path) {
    if (!node || !node.branches || !node.branches[index]) return null;
    node = node.branches[index];
  }
  return node;
}

export function emptyNotes() {
  return { 目標: "", 需求: "", 決策流程: "", 資源分配: "", 競爭情報: "" };
}

export function sanitizeNotes(value) {
  const notes = emptyNotes();
  if (!value || typeof value !== "object") return notes;
  DIMENSIONS.forEach((dim) => {
    notes[dim] = String(value[dim] ?? "").slice(0, 800);
  });
  return notes;
}

export function formatFive(notes) {
  const safe = sanitizeNotes(notes);
  const lines = ["【問句王｜五宮格】"];
  ["目標", "需求", "資源分配", "決策流程", "競爭情報"].forEach((dim) => {
    const text = safe[dim].replace(/\s+/g, " ").trim();
    lines.push(`${dim}：${text || "（未填）"}`);
  });
  return lines.join("\n");
}

export function formatSubmission(payload) {
  const name = clip(payload.submitter, 40) || "（未留名）";
  if (payload.type === "branch") {
    return [
      "【問句王投稿】在現有題目下補充",
      `投稿人：${name}`,
      `題目：${payload.objectionId || ""} ${payload.objectionTitle || ""}`.trim(),
      `加在這句下面：${payload.parentQuestion || "主問句"}`,
      `位置：${payload.nodePath || "主問句"}`,
      `客戶可能會說：${clip(payload.clientSays, 300)}`,
      `我們接著問（${validDimension(payload.dimension) || "未選面向"}）：${clip(payload.followUp, 400)}`,
    ].join("\n");
  }
  const lines = [
    "【問句王投稿】新的反對問題",
    `投稿人：${name}`,
    `題庫：${payload.bankTitle || payload.bank || ""}`,
    `分類：${clip(payload.category, 40)}`,
    `反對問題：${clip(payload.title, 200)}`,
  ];
  if (clip(payload.C, 400)) lines.push(`同理：${clip(payload.C, 400)}`);
  if (clip(payload.A, 400)) lines.push(`確認：${clip(payload.A, 400)}`);
  if (clip(payload.R, 400)) lines.push(`延伸：${clip(payload.R, 400)}`);
  if (clip(payload.question, 400)) {
    lines.push(`主問句（${validDimension(payload.dimension) || "未選面向"}）：${clip(payload.question, 400)}`);
  }
  return lines.join("\n");
}

export function nodePathString(path) {
  return (path || []).join("/");
}
