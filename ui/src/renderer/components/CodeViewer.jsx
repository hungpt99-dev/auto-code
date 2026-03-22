import { useEffect, useRef } from 'react';
import Prism from 'prismjs';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-xml-doc';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-diff';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-csharp';
import 'prismjs/components/prism-php';
import 'prismjs/components/prism-ruby';
import 'prismjs/components/prism-kotlin';
import 'prismjs/components/prism-swift';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';

const EXT_LANG_MAP = {
  // JVM
  java: 'java',
  kt:   'kotlin',
  kts:  'kotlin',
  // JS ecosystem
  js:   'javascript',
  jsx:  'javascript',
  ts:   'typescript',
  tsx:  'typescript',
  // Python
  py:   'python',
  // Go
  go:   'go',
  // Rust
  rs:   'rust',
  // C# / .NET
  cs:   'csharp',
  // PHP
  php:  'php',
  // Ruby
  rb:   'ruby',
  // Swift
  swift:'swift',
  // C / C++
  c:    'c',
  cpp:  'cpp',
  cc:   'cpp',
  h:    'c',
  hpp:  'cpp',
  // Web / config
  xml:  'xml',
  sh:   'bash',
  bash: 'bash',
  diff: 'diff',
  patch:'diff',
  yml:  'yaml',
  yaml: 'yaml',
  sql:  'sql',
  json: 'json',
};

function detectLanguage(filename) {
  const ext = (filename ?? '').split('.').pop().toLowerCase();
  return EXT_LANG_MAP[ext] ?? 'text';
}

export default function CodeViewer({ filename, content, language }) {
  const codeRef = useRef(null);
  const lang = language || detectLanguage(filename);

  useEffect(() => {
    if (codeRef.current) {
      Prism.highlightElement(codeRef.current);
    }
  }, [content, lang]);

  function handleCopy() {
    navigator.clipboard.writeText(content).catch(() => {
      // Fallback for environments where clipboard API is restricted
      const el = document.createElement('textarea');
      el.value = content;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    });
  }

  return (
    <div className="code-viewer">
      <div className="code-header">
        <span className="code-filename">{filename}</span>
        <div className="code-actions">
          <span className="code-lang-badge">{lang}</span>
          <button className="btn btn-ghost btn-sm" onClick={handleCopy}>
            📋 Copy
          </button>
        </div>
      </div>

      <div className="code-body">
        <pre className={`language-${lang}`} style={{ margin: 0 }}>
          <code ref={codeRef} className={`language-${lang}`}>
            {content}
          </code>
        </pre>
      </div>
    </div>
  );
}
