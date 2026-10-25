export const iterateCursorPages = async function* <T extends { id: string }>(
  fetchPage: (cursorId: string | undefined, take: number) => Promise<T[]>,
  pageSize = 500,
): AsyncGenerator<T> {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) {
    throw new RangeError('pageSize must be a positive safe integer');
  }

  let cursorId: string | undefined;
  while (true) {
    const page = await fetchPage(cursorId, pageSize);
    if (page.length > pageSize) {
      throw new RangeError('fetchPage returned more rows than requested');
    }
    if (page.length === 0) {
      return;
    }

    for (const item of page) {
      yield item;
    }

    if (page.length < pageSize) {
      return;
    }
    cursorId = page[page.length - 1]!.id;
  }
};
