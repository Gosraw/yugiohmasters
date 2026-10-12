// PostgREST silently caps every select at 1000 rows (Supabase's
// default `max_rows`). Any query that can return more than that -
// a big collection, a league-wide instance list - has to page with
// .range(), or the extra rows just disappear without an error.
//
// It also encodes .in("col", [...]) in the request URL, so a long
// id list must be split into batches or the request fails with
// HTTP 400 once the URL gets too long.

export const SUPABASE_PAGE_SIZE = 1000;

export const IN_FILTER_BATCH_SIZE = 75;

// Loose on purpose: PostgREST builders infer their own row types, so
// callers pick T and we cast once here.
type QueryResult = {
  data: unknown[] | null;
  error: {
    message: string;
  } | null;
};

/**
 * Runs `buildPage(from, to)` repeatedly until a page comes back
 * short, and returns every row. The query MUST have a stable,
 * unique ordering (e.g. end with .order("id")) or rows can be
 * skipped/duplicated between pages.
 */
export async function fetchAllPages<T>(
  buildPage: (
    from: number,
    to: number
  ) => PromiseLike<QueryResult>,
  pageSize = SUPABASE_PAGE_SIZE
): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildPage(
      from,
      from + pageSize - 1
    );

    if (error) {
      throw new Error(error.message);
    }

    const page = (data ?? []) as T[];

    rows.push(
      ...page
    );

    if (page.length < pageSize) {
      return rows;
    }
  }
}

/**
 * Splits `values` into batches small enough for an .in() filter and
 * runs `buildBatch` for each, a few at a time. Each batch is itself
 * paged, so a batch whose matches exceed 1000 rows is still complete.
 */
export async function fetchInBatches<V, T>(
  values: readonly V[],
  buildBatch: (
    batch: V[],
    from: number,
    to: number
  ) => PromiseLike<QueryResult>,
  {
    batchSize = IN_FILTER_BATCH_SIZE,
    concurrency = 4,
  }: {
    batchSize?: number;
    concurrency?: number;
  } = {}
): Promise<T[]> {
  const batches: V[][] = [];

  for (let offset = 0; offset < values.length; offset += batchSize) {
    batches.push(
      values.slice(
        offset,
        offset + batchSize
      )
    );
  }

  const results: T[][] = new Array(batches.length);

  let next = 0;

  async function worker() {
    while (next < batches.length) {
      const index = next;

      next += 1;

      results[index] = await fetchAllPages<T>(
        (from, to) => buildBatch(
          batches[index],
          from,
          to
        )
      );
    }
  }

  await Promise.all(
    Array.from(
      {
        length: Math.min(
          concurrency,
          batches.length
        ),
      },
      worker
    )
  );

  return results.flat();
}
