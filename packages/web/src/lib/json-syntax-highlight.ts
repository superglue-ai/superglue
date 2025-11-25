export type TokenType = 'property' | 'string' | 'number' | 'boolean' | 'null' | 'punctuation' | 'text';

export interface Token {
    type: TokenType;
    value: string;
}

export function tokenizeJSON(input: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;

    while (i < input.length) {
        const char = input[i];

        if (/\s/.test(char)) {
            let whitespace = '';
            while (i < input.length && /\s/.test(input[i])) {
                whitespace += input[i];
                i++;
            }
            tokens.push({ type: 'text', value: whitespace });
            continue;
        }

        if (char === '"') {
            let str = '"';
            i++;
            while (i < input.length && input[i] !== '"') {
                if (input[i] === '\\' && i + 1 < input.length) {
                    str += input[i] + input[i + 1];
                    i += 2;
                } else {
                    str += input[i];
                    i++;
                }
            }
            if (i < input.length) {
                str += '"';
                i++;
            }

            const nextNonWhitespace = input.slice(i).match(/^\s*:/);
            if (nextNonWhitespace) {
                tokens.push({ type: 'property', value: str });
            } else {
                tokens.push({ type: 'string', value: str });
            }
            continue;
        }

        if (/[{}\[\],:]/.test(char)) {
            tokens.push({ type: 'punctuation', value: char });
            i++;
            continue;
        }

        if (/[-\d]/.test(char)) {
            let num = '';
            while (i < input.length && /[-\d.eE+]/.test(input[i])) {
                num += input[i];
                i++;
            }
            tokens.push({ type: 'number', value: num });
            continue;
        }

        if (input.slice(i, i + 4) === 'true') {
            tokens.push({ type: 'boolean', value: 'true' });
            i += 4;
            continue;
        }

        if (input.slice(i, i + 5) === 'false') {
            tokens.push({ type: 'boolean', value: 'false' });
            i += 5;
            continue;
        }

        if (input.slice(i, i + 4) === 'null') {
            tokens.push({ type: 'null', value: 'null' });
            i += 4;
            continue;
        }

        tokens.push({ type: 'text', value: char });
        i++;
    }

    return tokens;
}

