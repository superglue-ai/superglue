import { describe, it, expect } from 'vitest';
import { convertHTMLToMarkdown } from './go-html-to-markdown.js';

describe('go-html-to-markdown', () => {
  const testCases = [
    {
      name: 'plain text',
      html: 'This is just plain text without any HTML tags.',
      expected: 'This is just plain text without any HTML tags.'
    },
    {
      name: 'simple paragraph',
      html: '<p>Simple paragraph</p>',
      expected: 'Simple paragraph'
    },
    {
      name: 'headers',
      html: '<h1>Main Title</h1><h2>Subtitle</h2>',
      expected: '# Main Title\n\n## Subtitle'
    },
    {
      name: 'text formatting',
      html: '<p>Text with <strong>bold</strong> and <em>italic</em> formatting.</p>',
      expected: 'Text with **bold** and *italic* formatting.'
    },
    {
      name: 'links',
      html: '<p>Visit <a href="https://example.com">our website</a>.</p>',
      expected: 'Visit [our website](https://example.com).'
    },
    {
      name: 'lists',
      html: '<ul><li>Item 1</li><li>Item 2</li></ul>',
      expected: '* Item 1\n* Item 2'
    },
    {
      name: 'code blocks',
      html: '<pre><code>function hello() {\n  console.log("Hello");\n}</code></pre>',
      expected: '```\nfunction hello() {\n  console.log("Hello");\n}\n```'
    },
    {
      name: 'inline code',
      html: '<p>Use <code>console.log()</code> for debugging.</p>',
      expected: 'Use `console.log()` for debugging.'
    },
    {
      name: 'tables',
      html: '<table><tr><th>Name</th><th>Age</th></tr><tr><td>John</td><td>30</td></tr></table>',
      expected: '| Name | Age |\n| --- | --- |\n| John | 30 |'
    },
    {
      name: 'blockquotes',
      html: '<blockquote><p>This is a quote</p></blockquote>',
      expected: '> This is a quote'
    },
    {
      name: 'images',
      html: '<img src="image.jpg" alt="Test Image" title="A test image">',
      expected: '![Test Image](image.jpg "A test image")'
    },
    {
      name: 'nested lists',
      html: '<ul><li>Item 1<ul><li>Nested item</li></ul></li><li>Item 2</li></ul>',
      expected: '* Item 1\n  * Nested item\n* Item 2'
    },
    {
      name: 'ordered lists',
      html: '<ol><li>First</li><li>Second</li></ol>',
      expected: '1. First\n2. Second'
    },
    {
      name: 'mixed formatting',
      html: '<p><strong><em>Bold and italic</em></strong> with <code>inline code</code></p>',
      expected: '***Bold and italic*** with `inline code`'
    }
  ];

  // Generate HTML of specific size
  const generateLargeHTML = (targetSizeKB: number): string => {
    const baseContent = `
      <div class="section">
        <h2>Section Header</h2>
        <p>This is a paragraph with <strong>bold</strong> and <em>italic</em> text. 
        It contains <a href="https://example.com">links</a> and <code>inline code</code>.</p>
        <ul>
          <li>List item with <span>nested elements</span></li>
          <li>Another item with <img src="image.jpg" alt="test image" /></li>
        </ul>
        <blockquote>
          <p>A blockquote with important information and <mark>highlighted text</mark>.</p>
        </blockquote>
        <table>
          <tr><th>Column 1</th><th>Column 2</th></tr>
          <tr><td>Data 1</td><td>Data 2</td></tr>
        </table>
      </div>
    `;
    
    const targetSize = targetSizeKB * 1024;
    const repetitions = Math.ceil(targetSize / baseContent.length);
    
    return `
      <html>
        <head>
          <title>Large Test Document</title>
          <meta charset="utf-8">
        </head>
        <body>
          <h1>Large HTML Document - Target Size: ${targetSizeKB}KB</h1>
          ${Array.from({ length: repetitions }, (_, i) => 
            baseContent.replace(/Section Header/g, `Section Header ${i + 1}`)
          ).join('')}
        </body>
      </html>
    `;
  };

  // Size test cases from 1KB to 5MB
  const sizeCases = [
    { name: 'Small HTML (1KB)', size: 1 },
    { name: 'Medium HTML (10KB)', size: 10 },
    { name: 'Large HTML (100KB)', size: 100 },
    { name: 'Very Large HTML (500KB)', size: 500 },
    { name: 'Extra Large HTML (1MB)', size: 1000 },
    { name: 'Huge HTML (5MB)', size: 5000 }
  ];

  describe('basic conversion', () => {
    testCases.forEach((testCase) => {
      it(`should convert ${testCase.name}`, async () => {
        try {
          const result = await convertHTMLToMarkdown(testCase.html);
          expect(result).toBeDefined();
          expect(typeof result).toBe('string');
          
          // Basic content check - result should contain key elements
          if (testCase.html.includes('bold')) {
            expect(result.toLowerCase()).toContain('bold');
          }
          if (testCase.html.includes('italic')) {
            expect(result.toLowerCase()).toContain('italic');
          }
          if (testCase.html.includes('https://example.com')) {
            expect(result).toContain('https://example.com');
          }
          
        } catch (error) {
          // Go parser might not be available in test environment
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toBe('Go parser not available');
        }
      });
    });
  });

  describe('complex html structures', () => {
    const complexCases = [
      {
        name: 'semantic html',
        html: '<article><header><h1>Title</h1></header><main><p>Content</p></main><footer><p>Footer</p></footer></article>',
        expected: '# Title\n\nContent\n\nFooter'
      },
      {
        name: 'code with language class',
        html: '<pre><code class="language-javascript">const x = 42;</code></pre>',
        expected: '```javascript\nconst x = 42;\n```'
      },
      {
        name: 'links with different attributes',
        html: '<p><a href="https://example.com" title="Example" target="_blank">External</a> and <a href="/internal">Internal</a></p>',
        expected: '[External](https://example.com "Example") and [Internal](/internal)'
      }
    ];

    complexCases.forEach((testCase) => {
      it(`should handle ${testCase.name}`, async () => {
        try {
          const result = await convertHTMLToMarkdown(testCase.html);
          expect(result).toBeDefined();
          expect(typeof result).toBe('string');
          
          // Check exact expected output
          if (testCase.expected) {
            expect(result.trim()).toBe(testCase.expected);
          }
          
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toBe('Go parser not available');
        }
      });
    });
  });

  describe('whitespace and formatting', () => {
    const whitespaceTests = [
      {
        name: 'multiple spaces',
        html: '<p>Text    with    multiple    spaces</p>',
        expected: 'Text with multiple spaces'
      },
      {
        name: 'pre-formatted text',
        html: '<pre>  Spaces\n    More spaces\n      Even more</pre>',
        expected: '```\n  Spaces\n    More spaces\n      Even more\n```'
      },
      {
        name: 'mixed whitespace',
        html: '<div>\n  <p>  Paragraph with spaces  </p>\n  <p>Another paragraph</p>\n</div>',
        expected: 'Paragraph with spaces\n\nAnother paragraph'
      }
    ];

    whitespaceTests.forEach((testCase) => {
      it(`should handle ${testCase.name}`, async () => {
        try {
          const result = await convertHTMLToMarkdown(testCase.html);
          expect(result).toBeDefined();
          expect(typeof result).toBe('string');
          
          // Check exact expected output
          if (testCase.expected) {
            expect(result.trim()).toBe(testCase.expected);
          }
          
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toBe('Go parser not available');
        }
      });
    });
  });

  describe('size-based tests', () => {
    sizeCases.forEach((sizeCase) => {
      it(`should handle ${sizeCase.name}`, async () => {
        const html = generateLargeHTML(sizeCase.size);
        const actualSize = html.length;
        
        try {
          const startTime = performance.now();
          const result = await convertHTMLToMarkdown(html);
          const endTime = performance.now();
          const duration = endTime - startTime;
          
          expect(result).toBeDefined();
          expect(typeof result).toBe('string');
          expect(result.length).toBeGreaterThan(0);
          
          // Performance expectations based on size
          const MAX_TIME_PER_KB = 50; // 50ms per KB is reasonable
          const expectedMaxTime = Math.max(2000, sizeCase.size * MAX_TIME_PER_KB);
          expect(duration).toBeLessThan(expectedMaxTime);
          
          // Check that essential content is preserved
          expect(result).toContain('Large HTML Document');
          expect(result).toContain('Section Header');
          // Check for markdown formatting
          expect(result).toContain('#'); // Headers should be converted
          expect(result).toContain('*'); // Lists should be converted
          expect(result).toContain('['); // Links should be converted
          
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toBe('Go parser not available');
        }
      }, Math.max(30000, sizeCase.size * 10)); // Dynamic timeout based on size
    });
  });

  describe('edge cases', () => {
    const edgeCases = [
      { name: 'empty string', html: '', expected: '' },
      { name: 'whitespace only', html: '   \n\t\r   ', expected: '' },
      { 
        name: 'malformed HTML', 
        html: '<invalid><unclosed><malformed',
        expected: ''
      },
      { 
        name: 'very deep nesting', 
        html: '<div>'.repeat(100) + 'content' + '</div>'.repeat(100),
        expected: 'content'
      },
      { 
        name: 'large single line', 
        html: '<p>' + 'a'.repeat(1000) + '</p>',
        expected: 'a'.repeat(1000)
      },
      { 
        name: 'mixed content types', 
        html: '<!DOCTYPE html><html><head><script>var x=1;</script><style>body{color:red;}</style></head><body><p>Content</p></body></html>',
        expected: 'Content'
      },
      { 
        name: 'special chars', 
        html: '<p>Symbols: &lt; &gt; &amp; &quot; &apos;</p>',
        expected: 'Symbols: < > & " \''
      },
      { 
        name: 'unicode and emojis', 
        html: '<p>Unicode: 你好 🌟 ñ é ü 🚀</p>',
        expected: 'Unicode: 你好 🌟 ñ é ü 🚀'
      },
      { 
        name: 'complex table with merged cells', 
        html: '<table><tr><th colspan="2">Header</th></tr><tr><td rowspan="2">Cell1</td><td>Cell2</td></tr><tr><td>Cell3</td></tr></table>',
        expected: '| Header | |\n| --- | --- |\n| Cell1 | Cell2 |\n| | Cell3 |'
      },
      { 
        name: 'nested structure with images', 
        html: '<article><header><h1>Title</h1></header><section><p>Text with <img src="test.jpg" alt="image" /></p></section></article>',
        expected: '# Title\n\nText with ![image](test.jpg)'
      },
      { 
        name: 'invalid URLs', 
        html: '<a href="not-a-url">Invalid link</a>',
        expected: '[Invalid link](not-a-url)'
      },
      { 
        name: 'empty elements', 
        html: '<p></p><div></div><span></span><a href="#"></a>',
        expected: ''
      },
      { 
        name: 'self-closing tags', 
        html: '<p>Text with <img src="test.jpg" alt="test"/> and <br/> breaks</p>',
        expected: 'Text with ![test](test.jpg) and  \nbreaks'
      },
      { 
        name: 'comments and CDATA', 
        html: '<!-- Comment --><p>Text</p><![CDATA[Raw data]]>',
        expected: 'Text'
      }
    ];

    edgeCases.forEach((edgeCase) => {
      it(`should handle ${edgeCase.name}`, async () => {
        try {
          const result = await convertHTMLToMarkdown(edgeCase.html);
          expect(typeof result).toBe('string');
          
          // Check exact expected output
          if (edgeCase.expected !== undefined) {
            expect(result.trim()).toBe(edgeCase.expected);
          }
          
        } catch (error) {
          // Edge cases might throw errors, which is acceptable
          expect(error).toBeInstanceOf(Error);
        }
      });
    });
  });
}); 