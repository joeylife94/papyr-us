/**
 * The tag change a bulk request asks for, as `DBStorage.mergePageTags` takes it. A list that the
 * request does not carry is passed as nothing, not as an empty list: adding (even nothing)
 * collapses a page's existing duplicate tags, as building a Set of them always did, while a
 * request that only removes tags leaves the others as they are.
 */
export function bulkTagChange(
  addTags: unknown,
  removeTags: unknown
): { add?: string[]; remove?: string[] } {
  return {
    add: Array.isArray(addTags) ? addTags : undefined,
    remove: Array.isArray(removeTags) ? removeTags : undefined,
  };
}
