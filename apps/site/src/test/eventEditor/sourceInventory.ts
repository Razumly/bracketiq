import ts from 'typescript';

// These declarations are public editor state. Local function variables are not fields.
export const kotlinProperties = (declaration: string): string[] => {
  const fields: string[] = [];
  let annotations: string[] = [];
  declaration.split(/\r?\n/).forEach((raw) => {
    const line = raw.trim();
    const property = line.replace(/^(@[\w:.]+(?:\([^)]*\))?\s+)*/, '');
    if (/^(?:override\s+)?(?:val|var)\s+\w+\s*:/.test(property)) {
      fields.push([...annotations, line].join(' ').replace(/,$/, '').replace(/\s+/g, ' '));
      annotations = [];
    } else if (line.startsWith('@')) annotations.push(line);
    else if (line) annotations = [];
  });
  return fields.sort();
};

export const kotlinDeclaration = (source: string, name: string): string => {
  const match = new RegExp(`(?:data class|interface) ${name}\\b[^({]*([({])`).exec(source);
  if (!match) throw new Error(`Missing Kotlin declaration: ${name}`);
  const opening = match[1];
  const closing = opening === '(' ? ')' : '}';
  const start = match.index + match[0].length;
  let depth = 1;
  let hasString = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"' && source[index - 1] !== '\\') hasString = !hasString;
    if (hasString) continue;
    if (character === opening) depth += 1;
    if (character === closing) depth -= 1;
    if (depth === 0) return source.slice(start, index);
  }
  throw new Error(`Unclosed Kotlin declaration: ${name}`);
};

export const kotlinBodyProperties = (source: string, name: string): string[] => {
  if (!new RegExp(`data class ${name}\\b`).test(source)) return [];
  const constructor = kotlinDeclaration(source, name);
  const tail = source.slice(source.indexOf(constructor) + constructor.length);
  const body = /^\)[^\n{]*(?:\n\s*)?\{([\s\S]*?)\n}/.exec(tail)?.[1];
  if (!body) return [];
  return kotlinProperties(body.split(/\r?\n/).filter((line) => /^ {4}\S/.test(line)).join('\n'));
};

export const webProperties = (source: string, name: string): string[] => {
  const file = ts.createSourceFile('editor.ts', source, ts.ScriptTarget.Latest, true);
  const declaration = file.statements.find((node): node is ts.TypeAliasDeclaration => ts.isTypeAliasDeclaration(node) && node.name.text === name);
  if (!declaration) throw new Error(`Missing web declaration: ${name}`);
  const fields: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isPropertySignature(node)) fields.push(node.getText(file).replace(/\s+/g, ' ').replace(/;$/, ''));
    else ts.forEachChild(node, visit);
  };
  visit(declaration.type);
  return fields.sort();
};
