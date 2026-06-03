const UUID_PATTERN =
  /^\/equipment\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

export const parsePublicEquipmentPath = (pathname: string): string | null => {
  const match = UUID_PATTERN.exec(pathname);
  return match?.[1] ?? null;
};
