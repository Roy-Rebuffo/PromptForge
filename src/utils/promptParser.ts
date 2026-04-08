export interface PromptSection {
  tag: string;       // 'system' | 'user' | 'context' | 'full'
  content: string;
  startLine: number;
  endLine: number;
}

export interface ParsedPrompt {
  hasSections: boolean;
  sections: PromptSection[];
  fullContent: string;
}

const SECTION_REGEX = /^\[(system|user|context)\]\s*$/im;

export function parsePromptFile(content: string): ParsedPrompt {
  const lines = content.split('\n');
  const sectionStarts: { tag: string; line: number }[] = [];

  // Find all section tags
  lines.forEach((line, index) => {
    const match = line.trim().match(/^\[(system|user|context)\]$/i);
    if (match) {
      sectionStarts.push({ tag: match[1].toLowerCase(), line: index });
    }
  });

  // No sections found — treat as simple prompt
  if (sectionStarts.length === 0) {
    return {
      hasSections: false,
      sections: [{
        tag: 'full',
        content: content.trim(),
        startLine: 0,
        endLine: lines.length - 1,
      }],
      fullContent: content.trim(),
    };
  }

  // Extract content for each section
  const sections: PromptSection[] = sectionStarts.map((section, i) => {
    const startLine = section.line + 1;
    const endLine = i < sectionStarts.length - 1
      ? sectionStarts[i + 1].line - 1
      : lines.length - 1;

    const sectionContent = lines
      .slice(startLine, endLine + 1)
      .join('\n')
      .trim();

    return {
      tag: section.tag,
      content: sectionContent,
      startLine,
      endLine,
    };
  });

  return {
    hasSections: true,
    sections,
    fullContent: content.trim(),
  };
}

// Builds a combined prompt from sections for evaluation
export function buildCombinedPrompt(parsed: ParsedPrompt): string {
  if (!parsed.hasSections) {
    return parsed.fullContent;
  }

  return parsed.sections
    .map(s => `[${s.tag.toUpperCase()}]\n${s.content}`)
    .join('\n\n');
}

// Returns a human-readable description of the prompt structure
export function describePromptStructure(parsed: ParsedPrompt): string {
  if (!parsed.hasSections) {
    return 'simple prompt';
  }
  const tags = parsed.sections.map(s => `[${s.tag}]`).join(' + ');
  return `structured prompt: ${tags}`;
}