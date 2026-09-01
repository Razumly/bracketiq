export const readAffiliateCutoverOption = (
  name: string,
  argv: readonly string[] = process.argv,
): string | undefined => {
  const prefix = `--${name}=`;
  const value = argv.find((argument) => argument.startsWith(prefix));
  return value?.slice(prefix.length).trim() || undefined;
};
