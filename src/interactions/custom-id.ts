/**
 * Splits a component/modal customId of the form `id:resourceId` into its
 * parts. `resourceId` is undefined when no separator is present.
 */
export function parseCustomIdSegments(customId: string, separator = ':'): { id: string; resourceId?: string } {
  const separatorIndex = customId.indexOf(separator);
  if (separatorIndex === -1) {
    return { id: customId };
  }
  return {
    id: customId.substring(0, separatorIndex),
    resourceId: customId.substring(separatorIndex + separator.length),
  };
}
