import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = '';

export async function parsePDF(buffer: Buffer): Promise<string> {
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

    let markdownContent = '';
    const numPages = pdf.numPages;

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();

        const viewport = page.getViewport({ scale: 1.0 });
        const pageHeight = viewport.height;

        const textItems = textContent.items as any[];
        const enrichedItems = textItems.map(item => ({
            text: item.str,
            x: Math.round(item.transform[4]),
            y: Math.round(item.transform[5]),
            width: item.width,
            height: item.height,
            fontSize: Math.round(Math.sqrt(item.transform[0] * item.transform[0] + item.transform[1] * item.transform[1])),
            fontName: item.fontName || ''
        }));

        const lines: {
            y: number;
            items: typeof enrichedItems;
            avgFontSize: number;
            isBold: boolean;
            minX: number;
            maxX: number;
        }[] = [];

        enrichedItems.forEach(item => {
            if (!item.text.trim()) return;

            let line = lines.find(l => Math.abs(l.y - item.y) < 3);

            if (!line) {
                line = {
                    y: item.y,
                    items: [],
                    avgFontSize: 0,
                    isBold: false,
                    minX: item.x,
                    maxX: item.x + item.width
                };
                lines.push(line);
            }

            line.items.push(item);
            line.minX = Math.min(line.minX, item.x);
            line.maxX = Math.max(line.maxX, item.x + item.width);
        });

        lines.forEach(line => {
            const totalSize = line.items.reduce((sum, item) => sum + item.fontSize, 0);
            line.avgFontSize = totalSize / line.items.length;
            line.isBold = line.items.some(item =>
                item.fontName.toLowerCase().includes('bold') ||
                item.fontName.toLowerCase().includes('heavy')
            );
        });

        lines.sort((a, b) => b.y - a.y);

        const detectTable = (startIdx: number): { rows: string[][], endIdx: number } | null => {
            const potentialRows: typeof lines[0][] = [];
            const columnPositions: number[] = [];

            for (let i = startIdx; i < lines.length; i++) {
                const line = lines[i];
                if (line.items.length < 2) continue;

                const sortedItems = [...line.items].sort((a, b) => a.x - b.x);
                const lineColumns = sortedItems.map(item => item.x);

                if (columnPositions.length === 0) {
                    columnPositions.push(...lineColumns);
                    potentialRows.push(line);
                } else {
                    let matches = 0;
                    for (const pos of lineColumns) {
                        if (columnPositions.some(col => Math.abs(col - pos) < 10)) {
                            matches++;
                        }
                    }

                    if (matches >= lineColumns.length * 0.5) {
                        potentialRows.push(line);
                    } else {
                        break;
                    }
                }

                if (i > startIdx && Math.abs(line.y - lines[i - 1].y) > 50) {
                    break;
                }
            }

            if (potentialRows.length >= 2) {
                const rows = potentialRows.map(line => {
                    const sortedItems = [...line.items].sort((a, b) => a.x - b.x);
                    const cells: string[] = [];

                    let currentCell = '';
                    let lastX = 0;

                    sortedItems.forEach((item, idx) => {
                        if (idx > 0 && item.x - lastX > 20) {
                            cells.push(currentCell.trim());
                            currentCell = item.text;
                        } else {
                            currentCell += (currentCell ? ' ' : '') + item.text;
                        }
                        lastX = item.x + item.width;
                    });

                    if (currentCell) {
                        cells.push(currentCell.trim());
                    }

                    return cells;
                });

                return {
                    rows,
                    endIdx: startIdx + potentialRows.length - 1
                };
            }

            return null;
        };

        const allFontSizes = lines.map(l => l.avgFontSize).filter(s => s > 0);
        const avgPageFontSize = allFontSizes.length > 0
            ? allFontSizes.reduce((a, b) => a + b, 0) / allFontSizes.length
            : 12;

        let pageContent = ``;
        let prevY = null;
        let i = 0;

        while (i < lines.length) {
            const line = lines[i];
            const text = line.items.map(item => item.text).join(' ').trim();

            if (!text) {
                i++;
                continue;
            }

            const tableResult = detectTable(i);
            if (tableResult) {
                const { rows } = tableResult;
                if (rows.length > 0) {
                    pageContent += '| ' + rows[0].join(' | ') + ' |\n';
                    pageContent += '|' + rows[0].map(() => ' --- ').join('|') + '|\n';

                    for (let j = 1; j < rows.length; j++) {
                        pageContent += '| ' + rows[j].join(' | ') + ' |\n';
                    }
                    pageContent += '\n';
                }

                i = tableResult.endIdx + 1;
                prevY = line.y;
                continue;
            }

            if (prevY !== null && prevY - line.y > 25) {
                pageContent += '\n';
            }

            let isHeading = false;
            let headingLevel = 3;

            const sizeRatio = line.avgFontSize / avgPageFontSize;
            if (sizeRatio > 1.5) {
                isHeading = true;
                headingLevel = 1;
            } else if (sizeRatio > 1.3) {
                isHeading = true;
                headingLevel = 2;
            } else if (sizeRatio > 1.15 || line.isBold) {
                isHeading = true;
                headingLevel = 3;
            }

            if (!isHeading && text.length < 80) {
                if (/^\d+(\.\d+)*\.?\s+[A-Z]/.test(text)) {
                    isHeading = true;
                    headingLevel = text.split('.').length + 1;
                }
                else if (text === text.toUpperCase() && text.split(' ').length > 1) {
                    isHeading = true;
                    headingLevel = 3;
                }
                else if (text.endsWith(':') && text.length < 50) {
                    isHeading = true;
                    headingLevel = 4;
                }
            }

            if (isHeading) {
                const prefix = '#'.repeat(Math.min(headingLevel + 2, 6));
                pageContent += `${prefix} ${text}\n\n`;
            } else {
                pageContent += `${text}\n`;
            }

            prevY = line.y;
            i++;
        }

        markdownContent += pageContent + '\n---\n\n';
    }

    return markdownContent.trim();
}

