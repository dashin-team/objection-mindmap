import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applySubmissions,
  formatFive,
  formatSubmission,
  isApproved,
  parseRoute,
  pathDimensions,
  questionTexts,
  resolveLayer,
  routeToHash,
  searchObjections,
} from "../js/logic.js";

const bank = JSON.parse(readFileSync(new URL("../data/bank.json", import.meta.url), "utf8"));

assert.equal(bank.objections.length, 240);
assert.equal(bank.frameworks.find((item) => item.id === "nine-grid").cells.length, 9);
assert.equal(bank.frameworks.find((item) => item.id === "goal-five-grid").cells.length, 5);
for (const objection of bank.objections) {
  const dims = new Set();
  const walk = (node) => {
    dims.add(node.dimension);
    assert.ok(node.dimension, objection.id);
    const count = (node.branches || []).length;
    if (count) assert.ok(count >= 2 && count <= 3, `${objection.id} branches ${count}`);
    (node.branches || []).forEach(walk);
  };
  walk(objection.tree);
  assert.ok(dims.size >= 3, objection.id);
  assert.equal(objection.closing.replies.length, 2);
  assert.ok(questionTexts(objection).length >= 1);
}

const titleHit = searchObjections(bank.objections, "為什麼要跟你買保險");
assert.equal(titleHit[0].objection.id, "ins-001");
assert.equal(titleHit[0].titleHit, true);

const nested = bank.objections[0].tree.branches[0].branches[0].followUp;
const nestedHit = searchObjections(bank.objections, nested.slice(0, 12));
assert.ok(nestedHit.some((item) => item.objection.id === "ins-001"));

const empathyOnly = bank.objections[0].C;
assert.equal(searchObjections(bank.objections, empathyOnly).length, 0);

const layer = resolveLayer(bank.objections[0].tree, [0]);
assert.equal(layer.clientSays.includes("可信"), true);
assert.equal(layer.branches.length, 2);
assert.equal(layer.ended, false);
const leaf = resolveLayer(bank.objections[0].tree, [0, 0]);
assert.equal(leaf.ended, true);
assert.equal(leaf.dimension.length > 0, true);
assert.deepEqual(resolveLayer(bank.objections[0].tree, [9, 9]).path, []);
assert.deepEqual(resolveLayer(bank.objections[0].tree, [99, 0]).path, []);
assert.ok(pathDimensions(bank.objections[0].tree, [0, 1]).length >= 2);

const route = parseRoute("#/o/fin-003/1/0/closing/1");
assert.equal(route.id, "fin-003");
assert.deepEqual(route.path, [1, 0]);
assert.equal(route.mode, "closing");
assert.equal(route.reply, 1);
assert.equal(routeToHash(route), "#/o/fin-003/1/0/closing/1");
assert.equal(parseRoute("#/submit/branch/adv-010/0").kind, "branch");
assert.deepEqual(parseRoute("#/frameworks"), { name: "library" });
assert.equal(parseRoute("#/b/finance").id, "finance");
assert.equal(routeToHash({ name: "bank", id: "insurance" }), "#/b/insurance");

assert.equal(isApproved({ approved: true }), true);
assert.equal(isApproved({ approved: "TRUE" }), true);
assert.equal(isApproved({ approved: false }), false);
assert.equal(isApproved({ approved: "" }), false);
assert.equal(isApproved({}), true);

const merged = applySubmissions(bank, [
  { id: "a", type: "new_objection", approved: "TRUE", submitter: "林夥伴", bank: "finance", category: "資金與預算", title: "我再想想", question: "你主要是在想時間，還是在想金額？", dimension: "決策流程" },
  { id: "b", type: "branch", approved: true, submitter: "陳夥伴", objectionId: "ins-001", nodePath: "", clientSays: "我現在不方便講", followUp: "那我們約一個你比較方便的時間，你希望先談哪一件事？", dimension: "目標" },
  { id: "c", type: "branch", approved: "FALSE", submitter: "不該出現", objectionId: "ins-001", nodePath: "", clientSays: "秘密", followUp: "不該併入", dimension: "需求" },
  { id: "d", type: "branch", approved: "TRUE", objectionId: "missing", clientSays: "有", followUp: "問", dimension: "需求" },
]);
assert.equal(merged.report.objections, 1);
assert.equal(merged.report.branches, 1);
assert.ok(merged.report.skipped >= 2);
const shared = merged.bank.objections.find((item) => item.title === "我再想想");
assert.equal(shared.partner.name, "林夥伴");
assert.equal(shared.bank, "finance");
const host = merged.bank.objections.find((item) => item.id === "ins-001");
assert.equal(host.tree.branches.length, 4);
assert.equal(host.tree.branches[3].partner.name, "陳夥伴");
assert.equal(host.tree.branches.some((branch) => branch.clientSays === "秘密"), false);

const text = formatFive({ 目標: "退休", 需求: "", 資源分配: "每月一萬", 決策流程: "", 競爭情報: "" });
assert.match(text, /目標：退休/);
assert.match(text, /需求：（未填）/);
assert.match(text, /資源分配：每月一萬/);
assert.equal(formatFive({ 目標: "x".repeat(900) }).split("\n")[1].length < 820, true);

const posted = formatSubmission({
  type: "new_objection",
  submitter: "林夥伴",
  bankTitle: "保險反對問題",
  category: "不信任類",
  title: "我再看看",
  question: "你最在意的是哪一點？",
  dimension: "需求",
});
assert.match(posted, /投稿人：林夥伴/);
assert.match(posted, /主問句（需求）/);

console.log("logic tests ok", bank.objections.length);
