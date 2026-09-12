// Resolve only a stable-version conflict in Git's already-merged manifest.
// Keep all other merged fields; ambiguous/non-version conflicts need a person.
export function resolveUpstreamManifestConflict(contents: string): string {
  const conflict =
    /^<<<<<<<[^\r\n]*\r?\n([\s\S]*?)^=======\r?\n([\s\S]*?)^>>>>>>>[^\r\n]*(?:\r?\n|$)/gm;
  const versionLine =
    /^(\s*"version"\s*:\s*")((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))("\s*,?\s*)$/;
  let resolvedVersion: string | undefined;
  let count = 0;
  const result = contents.replace(conflict, (_block, ours: string, theirs: string) => {
    const left = versionLine.exec(ours.trimEnd());
    const right = versionLine.exec(theirs.trimEnd());
    if (!left || !right || ++count !== 1) {
      throw new Error("Manual merge required: conflict is not a single stable version field.");
    }
    const a = left[2]!.split(".").map(BigInt);
    const b = right[2]!.split(".").map(BigInt);
    const difference = a.findIndex((value, index) => value !== b[index]);
    const useOurs = difference === -1 || a[difference]! > b[difference]!;
    resolvedVersion = useOurs ? left[2]! : right[2]!;
    return useOurs ? ours : theirs;
  });
  if (count !== 1 || /^(?:<{7}|={7}|>{7}|\|{7})/m.test(result)) {
    throw new Error("Manual merge required: unresolved or unsupported conflict markers.");
  }
  const manifest: unknown = JSON.parse(result);
  if (
    typeof manifest !== "object" ||
    manifest === null ||
    !("version" in manifest) ||
    manifest.version !== resolvedVersion
  ) {
    throw new Error("Manual merge required: resolved manifest version is inconsistent.");
  }
  return result;
}
