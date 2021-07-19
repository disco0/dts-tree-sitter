import * as fs from "fs";
import * as pathlib from "path";

//#region dedent

/**
 * @NOTE This can all be removed if dedent package is added to dependencies
 */

export namespace is
{
    function regex(obj: unknown): obj is RegExp
    {
        return !!obj && obj instanceof RegExp;
    }

    export function String(obj: unknown): obj is string
    {
        return typeof obj === 'string'
    }

    export function StringWithChar(obj: unknown): obj is string
    {
        return is.String(obj) && obj.length > 0
    }

    export const RegExp = regex;
}

function indentRegexFromRawIndent(whitespaceString: string): RegExp
{
    return new RegExp(String.raw`^${whitespaceString.replace(/\t/g, String.raw`\t`)}`, "")
}

function dedent(str: string, indent?: string | RegExp): string
{
    let indentPattern: RegExp | undefined = undefined;

    // (If no argument passed)
    if(typeof indent === 'undefined')
    {
        const indentRegex = /^(?<indent>[ \t]+)/;
        let firstIndent: string | undefined;
        // Iterate through lines until capture group result, return true to stop
        for(const line of str.split(/\r?\n/gm))
        {
            const groups = indentRegex.exec(line)?.groups ?? {};

            if(is.StringWithChar(groups.indent))
            {
                firstIndent = indent
                break
            }
        }

        if(firstIndent === undefined)
        {
            throw new Error('TODO: Handle failure to find first indent')
        }

        indentPattern = indentRegexFromRawIndent(firstIndent)
    }
    else if(is.RegExp(indent))
    {
        indentPattern = indent;
    }
    else if(is.String(indent))
    {
        if(is.StringWithChar(indent))
        {
            if(/^([^\n])(?:\1)*$/.test(indent))
            {
                indentPattern = new RegExp(String.raw`^(?:${indent[0]}){0,${indent.length}}`, "");
            }
            else
            {
                throw new Error(`Invalid indent parameter: Malformed string content (Input: "${str}")`);
            }
        }
    }
    else
    {
        throw new Error(`Fall through on conditial block. (Input: "${str}")`)
    }

    if(is.RegExp(indentPattern))
        return str.replace(/(?<![\s\S])\n+/m, '').split(/\n/gm).map(line => line.replace(indentPattern!, '')).join('\n');
    else
        throw new Error('Failed to resolve an indent pattern regex.')
        // return str
}

//#endregion dedent

export namespace NodeType
{
    export interface Ref {
        type: string;
        named: boolean;
        isError?: boolean;
    }

    export interface Entry extends NodeType.Ref {
        subtypes?: NodeType.Ref[];
        fields?: Record<string, NodeType.Children>;
        children?: NodeType.Children;
    }

    export interface Children {
        multiple: boolean;
        required: boolean;
        types: NodeType.Ref[];
    }
}

export class Printer
{
    private indentation = '';

    indent(): this {
        this.indentation += '  ';
        return this;
    }
    deindent(): this {
        this.indentation = this.indentation.substring(0, this.indentation.length - 2);
        return this;
    }
    println(str?: string, options: Printer.PrintLnOptions = {}): this
    {
        if (str == null) {
            console.log();
        } else {
            // Sanitize options parameter (probably unnecessary after getting this working)
            options = typeof options === 'object' ? options : { };

            // Dedent option: apply non-instance dedent function and then indent each line of `str`
            if(options.dedent === true)
            {
                console.log(Printer.IndentLines(str, this.indentation))
            }
            else
            {
                console.log(this.indentation + str);
            }
        }
        return this;
    }
    printEach(items: (string | void)[] | void): this {
        if (items == null) return this;
        for (let item of items) {
            if (item == null) continue;
            this.println(item);
        }
        return this;
    }
    forEach<U>(items: U[] | void, fn: (item: NonNullable<U>, printer: Printer) => void): this {
        if (items == null) return this;
        for (let item of items) {
            if (item == null) continue;
            fn(item!, this);
        }
        return this;
    }
    forEachInRecord<U>(items: Record<string, U> | void, fn: (key: string, item: NonNullable<U>, printer: Printer) => void): this {
        if (items == null) return this;
        for (let key of Object.keys(items)) {
            let item = items[key];
            if (item == null) continue;
            fn(key, item!, this);
        }
        return this;
    }
}

export namespace Printer
{
    export interface PrintLnOptions
    {
        dedent?: boolean
    }

    /**
     * Apply string `indentation` as indent to each line of string `str`
     */
    export function IndentLines(str: string, indentation: string): string
    {
        return str.replace(/^/gm, indentation);
    }
}

// (Intentially separate from other `is` namespace declaration)
export namespace is
{
    // @NOTE: Not sure if matching any ECMAScript identifier would be ideal?
    //        /^[$_\p{ID_Start}][$_\u200C\u200D\p{ID_Continue}]*$/u
    export function Identifier(str: string) : boolean
    {
        return /^[a-z$_][a-z0-9$_]*$/i.test(str);
    }
}

export function mangleNameToIdentifier(str: string) {
    let sb = '$';
    for (let i = 0; i < str.length; ++i) {
        let char = str.charAt(i);
        if (/[a-z0-9_]/i.test(char)) {
            sb += char;
        } else {
            sb += '$' + str.charCodeAt(i) + '$';
        }
    }
    return sb;
}

export function toCapitalCase(str: string) {
    return str.replace(/^[a-z]/, t => t.toUpperCase())
              .replace(/_[a-zA-Z]/g, t => t.substring(1).toUpperCase())
}

export namespace extract
{
    export function TypePrefix(str: string) {
        return is.Identifier(str) ? toCapitalCase(str) : mangleNameToIdentifier(str);
    }

    export function TypeName(str: string) {
        return extract.TypePrefix(str) + 'Node';
    }

    export function SyntaxKind(str: string) {
        return extract.TypePrefix(str);
    }

    export function TypeExprFromRef(ref: NodeType.Ref, index: IndexedData) {
        if (ref.isError) {
            return 'ErrorNode';
        }
        if (!ref.named) {
            let name = index.typeNames.get(ref.type);
            let arg = name != null ? `SyntaxType.${name}` : JSON.stringify(ref.type);
            return `UnnamedNode<${arg}>`;
        }
        return extract.TypeName(ref.type);
    }
}

export interface IndexedData {
    typeNames: Map<string, string>;
}

//#region generate

// (Unused part of doc text) [`Entry`]({@link NodeType.Entry})
/**
 * Contains all functions operating on `node-types.json`
 */
export namespace generate
{
    export function Index(json: NodeType.Entry[]): IndexedData {
        let typeNames = new Map<string, string>();
        for (let entry of json) {
            if (entry.named) {
                let name = extract.SyntaxKind(entry.type);
                typeNames.set(entry.type, name);
            }
        }
        return { typeNames };
    }

    export function Preamble(json: NodeType.Entry[], printer: Printer) {
        printer.println(`
            interface NamedNodeBase extends SyntaxNodeBase {
                isNamed: true;
            }

            /** An unnamed node with the given type string. */
            export interface UnnamedNode<T extends string = string> extends SyntaxNodeBase {
            type: T;
            isNamed: false;
            }

            type PickNamedType<Node, T extends string> = Node extends { type: T; isNamed: true } ? Node : never;

            type PickType<Node, T extends string> = Node extends { type: T } ? Node : never;

            /** A named node with the given \`type\` string. */
            export type NamedNode<T extends SyntaxType = SyntaxType> = PickNamedType<SyntaxNode, T>;

            /**
             * A node with the given \`type\` string.
             *
             * Note that this matches both named and unnamed nodes. Use \`NamedNode<T>\` to pick only named nodes.
             */
            export type NodeOfType<T extends string> = PickType<SyntaxNode, T>;

            interface TreeCursorOfType<S extends string, T extends SyntaxNodeBase> {
              nodeType: S;
              currentNode: T;
            }

            type TreeCursorRecord = { [K in TypeString]: TreeCursorOfType<K, NodeOfType<K>> };

            /**
             * A tree cursor whose \`nodeType\` correlates with \`currentNode\`.
             *
             * The typing becomes invalid once the underlying cursor is mutated.
             *
             * The intention is to cast a \`TreeCursor\` to \`TypedTreeCursor\` before
             * switching on \`nodeType\`.
             *
             * For example:
             * \`\`\`ts
             * let cursor = root.walk();
             * while (cursor.gotoNextSibling()) {
             *   const c = cursor as TypedTreeCursor;
             *   switch (c.nodeType) {
             *     case SyntaxType.Foo: {
             *       let node = c.currentNode; // Typed as FooNode.
             *       break;
             *     }
             *   }
             * }
             * \`\`\`
             */
            export type TypedTreeCursor = TreeCursorRecord[keyof TreeCursorRecord];

            export interface ErrorNode extends NamedNodeBase {
                type: SyntaxType.ERROR;
                hasError(): true;
            }
        `.replace(/^[ ]{0,12}/gm, ''));
    }

    export function TypeEnum(json: NodeType.Entry[], { typeNames }: IndexedData, printer: Printer) {
        printer.
            println('export const enum SyntaxType {')
            .indent()
            .println('ERROR = "ERROR",')
            .forEach(json, entry => {
                if (entry.named && (entry.subtypes == null || entry.subtypes.length === 0)) {
                    let name = extract.SyntaxKind(entry.type);
                    printer.println(`${name} = ${JSON.stringify(entry.type)},`);
                }
            })
            .deindent()
            .println('}')
            .println()
            .println('export type UnnamedType =')
            .indent()
            .forEach(json, entry => {
                if (!entry.named) {
                    let name = typeNames.get(entry.type);
                    if (name != null) {
                        printer.println(`| SyntaxType.${name} // both named and unnamed`);
                    } else {
                        printer.println(`| ${JSON.stringify(entry.type)}`);
                    }
                }
            })
            .println(';')
            .deindent()
            .println()
            .println('export type TypeString = SyntaxType | UnnamedType;')
            .println();
    }

    export function NamedDeclaration(entry: NodeType.Entry, index: IndexedData, printer: Printer) {
        if (!entry.named)
            return;
        if (entry.subtypes != null && entry.subtypes.length > 0) {
            generate.UnionFromEntry(entry, index, printer);
        } else {
            generate.InterfaceFromEntry(entry, index, printer);
        }
    }

    export function InterfaceFromEntry(entry: NodeType.Entry, index: IndexedData, printer: Printer) {
        let kind = extract.SyntaxKind(entry.type);
        let name = extract.TypeName(entry.type);
        printer
            .println(`export interface ${name} extends NamedNodeBase {`)
            .indent()
            .println(`type: SyntaxType.${kind};`)
            .forEachInRecord(entry.fields, (field, children) => {
                let fieldName = field + 'Node';
                let type = children.types.map(t => extract.TypeExprFromRef(t, index)).join(' | ');
                if (type === '') {
                    type = 'UnnamedNode';
                }
                if (children.multiple) {
                    if (children.types.length > 1) {
                        type = '(' + type + ')';
                    }
                    type += '[]';
                    fieldName += 's';
                }
                let opt = (children.required || children.multiple) ? '' : '?';
                printer.println(`${fieldName}${opt}: ${type};`);
            })
            .deindent()
            .println('}')
            .println();
    }

    export function UnionFromEntry(entry: NodeType.Entry, index: IndexedData, printer: Printer) {
        generate.Union(extract.TypeName(entry.type), entry.subtypes!, index, printer);
    }

    export function RootUnion(json: NodeType.Entry[], index: IndexedData, printer: Printer) {
        let errorType: NodeType.Ref = { type: 'ERROR', named: true, isError: true };
        generate.Union('SyntaxNode', [...json, errorType], index, printer);
    }

    export function Union(name: string, members: NodeType.Ref[], index: IndexedData, printer: Printer) {
        printer
            .println(`export type ${name} = `)
            .indent()
            .forEach(members, ref => {
                printer.println('| ' + extract.TypeExprFromRef(ref, index))
            })
            .println(';')
            .deindent()
            .println();
    }

    export function ModifiedTreeSitterDts(json: NodeType.Entry[], dtsText: string, printer: Printer) {
        let text = dtsText
            .replace(/declare module ['"]tree-sitter['"] {(.*)}/s, (str, p1) => p1.replace(/^  /gm, ''))
            .replace('export = Parser', '')
            .replace(/namespace Parser {(.*)}/s, (str, p1) => p1.replace(/^  /gm, ''))
            .replace(/^\s*(class|interface|namespace)/gm, 'export $1')
            .replace(/\bexport class\b/g, 'export interface')
            .replace(/\bParser\.(\w+)\b/g, "$1")
            .replace('export interface SyntaxNode', 'interface SyntaxNodeBase')
            .replace(/closest\(\w+:.*\): SyntaxNode \| null;/,
                'closest<T extends SyntaxType>(types: T | readonly T[]): NamedNode<T> | null;')
            .replace(/descendantsOfType\(types: [^,]*, (.*)\): Array<SyntaxNode>;/,
                'descendantsOfType<T extends TypeString>(types: T | readonly T[], $1): NodeOfType<T>[];')
            .replace(/\n\n\n+/g, '\n\n')
            .replace(/\n+$/, '')
        printer.println(text);
    }

}
//#endregion generate

export const usageText = `
  Usage: dts-tree-sitter INPUT > OUTPUT.d.ts

  generate.s a .d.ts file to stdout.
export `;

export function fileExists(file: string) {
    try {
        return fs.statSync(file).isFile();
    } catch (e) {
        return false;
    }
}

export function getLookupLocations(input: string) {
    let result = [
        input,
        pathlib.join(input, 'node-types.json'),
        pathlib.join(input, 'src/node-types.json'),
    ];
    if (!input.startsWith('.')) {
        result.push(pathlib.join('node_modules', input, 'src/node-types.json'));
    }
    return result;
}

export function getTreeSitterDts() {
    let entryPoint = require.resolve('tree-sitter');
    let packageDir = pathlib.dirname(entryPoint);
    let file = pathlib.join(packageDir, 'tree-sitter.d.ts');
    return fs.readFileSync(file, 'utf8');
}

export function main() {
    let args = process.argv.slice(2);
    if (args.length !== 1) {
        console.error(usageText);
        process.exit(1);
    }
    let locations = getLookupLocations(args[0]);
    let filename = locations.find(fileExists);
    let treeSitterDtsText = getTreeSitterDts();
    if (filename == null) {
        console.error(`Could not find node-types.json at any of the following locations:`);
        locations.forEach(l => console.log(`  ${l}`));
        process.exit(1);
    }
    let json = JSON.parse(fs.readFileSync(filename, 'utf8')) as NodeType.Entry[];
    let index = generate.Index(json);
    let printer = new Printer();
    generate.ModifiedTreeSitterDts(json, treeSitterDtsText, printer);
    generate.Preamble(json, printer);
    generate.TypeEnum(json, index, printer);
    generate.RootUnion(json, index, printer);
    printer.forEach(json, t => generate.NamedDeclaration(t, index, printer));
}