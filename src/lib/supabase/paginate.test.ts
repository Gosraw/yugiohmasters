import {
  describe,
  expect,
  it,
} from "vitest";

import {
  fetchAllPages,
  fetchInBatches,
} from "./paginate";

function fakeTable(
  rowCount: number
) {
  return Array.from(
    {
      length: rowCount,
    },
    (_, index) => ({
      id: index,
    })
  );
}

describe("fetchAllPages", () => {
  it("returns every row past the 1000-row cap", async () => {
    const table = fakeTable(2345);

    const rows = await fetchAllPages<{ id: number }>(
      async (from, to) => ({
        data: table.slice(from, to + 1),
        error: null,
      })
    );

    expect(rows).toHaveLength(2345);
    expect(rows.at(-1)).toEqual({
      id: 2344,
    });
  });

  it("stops after one call for a small result", async () => {
    let calls = 0;

    const rows = await fetchAllPages(
      async () => {
        calls += 1;

        return {
          data: fakeTable(3),
          error: null,
        };
      }
    );

    expect(rows).toHaveLength(3);
    expect(calls).toBe(1);
  });

  it("does one extra call when the total is an exact page multiple", async () => {
    const table = fakeTable(2000);

    let calls = 0;

    const rows = await fetchAllPages(
      async (from, to) => {
        calls += 1;

        return {
          data: table.slice(from, to + 1),
          error: null,
        };
      }
    );

    expect(rows).toHaveLength(2000);
    expect(calls).toBe(3);
  });

  it("throws instead of silently returning partial data", async () => {
    await expect(
      fetchAllPages(
        async () => ({
          data: null,
          error: {
            message: "boom",
          },
        })
      )
    ).rejects.toThrow("boom");
  });
});

describe("fetchInBatches", () => {
  it("splits values into batches and keeps every match in order", async () => {
    const ids = Array.from(
      {
        length: 200,
      },
      (_, index) => index
    );

    const seenBatchSizes: number[] = [];

    const rows = await fetchInBatches<number, { id: number }>(
      ids,
      async (batch) => {
        seenBatchSizes.push(batch.length);

        return {
          data: batch.map((id) => ({
            id,
          })),
          error: null,
        };
      },
      {
        batchSize: 75,
      }
    );

    expect(rows.map((row) => row.id)).toEqual(ids);
    expect(seenBatchSizes.sort()).toEqual([50, 75, 75]);
  });

  it("returns nothing and makes no calls for an empty list", async () => {
    let calls = 0;

    const rows = await fetchInBatches(
      [],
      async () => {
        calls += 1;

        return {
          data: [],
          error: null,
        };
      }
    );

    expect(rows).toEqual([]);
    expect(calls).toBe(0);
  });
});
