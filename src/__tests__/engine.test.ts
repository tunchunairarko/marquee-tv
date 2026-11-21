import { describe, expect, it } from "vitest";
import { liveStart } from "../lib/engine";

/** Feed buffered-end samples taken every 250 ms; return [sample index, start time]. */
function run(ends: number[], start = 0): [number, number] | undefined {
  let prev = 0;
  let waited = 0;
  for (const [i, end] of ends.entries()) {
    const at = liveStart(prev, end, start, waited);
    if (at !== undefined) return [i, at];
    if (end > 0) waited += 0.25;
    prev = end;
  }
}

describe("liveStart", () => {
  it("waits out a connect-time backlog burst, then starts once near the edge", () => {
    // Buffered end as measured on a real provider: ~24 s of backlog lands in ~1 s.
    expect(run([0, 2.5, 12.3, 22.1, 22.1, 23.9], 0.08)).toEqual([4, 22.1 - 3]);
  });

  it("starts a channel without a burst after one check", () => {
    expect(run([0, 0, 0.5, 0.7], 0.1)).toEqual([3, 0.1]);
  });

  it("gives up waiting on a burst that never settles", () => {
    const ends = Array.from({ length: 30 }, (_, i) => i * 2);
    const [i, at] = run(ends)!;
    expect(i).toBeLessThanOrEqual(14); // 3 s after first data
    expect(at).toBe(ends[i] - 3);
  });

  it("keeps waiting while nothing is buffered", () => {
    expect(run([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toBeUndefined();
  });
});
