/**
 * Minimal line-based diff — enough for `launchrail diff` to preview upstream
 * changes without a dependency. LCS is quadratic, which is fine at the size
 * of the files Launchrail manages.
 */

export interface DiffOp {
  kind: "context" | "del" | "add";
  text: string;
}

function splitLines(text: string): string[] {
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

export function diffOps(oldText: string, newText: string): DiffOp[] {
  const a = splitLines(oldText);
  const b = splitLines(newText);
  const n = a.length;
  const m = b.length;
  const table: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    const row = table[i]!;
    const next = table[i + 1]!;
    for (let j = m - 1; j >= 0; j--) {
      row[j] = a[i] === b[j] ? next[j + 1]! + 1 : Math.max(next[j]!, row[j + 1]!);
    }
  }

  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ kind: "context", text: a[i]! });
      i += 1;
      j += 1;
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
      ops.push({ kind: "del", text: a[i]! });
      i += 1;
    } else {
      ops.push({ kind: "add", text: b[j]! });
      j += 1;
    }
  }
  while (i < n) ops.push({ kind: "del", text: a[i++]! });
  while (j < m) ops.push({ kind: "add", text: b[j++]! });
  return ops;
}

const PREFIX: Record<DiffOp["kind"], string> = { context: " ", del: "-", add: "+" };

/** Unified-diff hunks (no ---/+++ header). Empty string when the texts match. */
export function formatUnifiedDiff(oldText: string, newText: string, context = 3): string {
  if (oldText === newText) return "";
  const ops = diffOps(oldText, newText);
  const changed = ops.reduce<number[]>((acc, op, index) => {
    if (op.kind !== "context") acc.push(index);
    return acc;
  }, []);
  if (changed.length === 0) return "(only a trailing-newline difference)\n";

  const ranges: Array<[number, number]> = [];
  for (const index of changed) {
    const start = Math.max(0, index - context);
    const end = Math.min(ops.length - 1, index + context);
    const last = ranges[ranges.length - 1];
    if (last && start <= last[1] + 1) last[1] = end;
    else ranges.push([start, end]);
  }

  const lines: string[] = [];
  let oldPos = 1;
  let newPos = 1;
  let cursor = 0;
  for (const [start, end] of ranges) {
    for (; cursor < start; cursor++) {
      const op = ops[cursor]!;
      if (op.kind !== "add") oldPos += 1;
      if (op.kind !== "del") newPos += 1;
    }
    const hunk = ops.slice(start, end + 1);
    const oldCount = hunk.filter((op) => op.kind !== "add").length;
    const newCount = hunk.filter((op) => op.kind !== "del").length;
    lines.push(`@@ -${oldCount === 0 ? oldPos - 1 : oldPos},${oldCount} +${newCount === 0 ? newPos - 1 : newPos},${newCount} @@`);
    for (; cursor <= end; cursor++) {
      const op = ops[cursor]!;
      lines.push(PREFIX[op.kind] + op.text);
      if (op.kind !== "add") oldPos += 1;
      if (op.kind !== "del") newPos += 1;
    }
  }
  return lines.join("\n") + "\n";
}
