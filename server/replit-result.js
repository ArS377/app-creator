function textBlocks(result) {
  return (result?.content || [])
    .filter((item) => item?.type === "text" && typeof item.text === "string")
    .map((item) => item.text);
}

function parseJson(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(source);
  } catch {
    const start = source.indexOf("{");
    const end = source.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(source.slice(start, end + 1));
      } catch {}
    }
    return null;
  }
}

export function toolResultData(result) {
  if (result?.structuredContent && typeof result.structuredContent === "object") {
    return result.structuredContent;
  }
  for (const block of textBlocks(result)) {
    const parsed = parseJson(block);
    if (parsed) return parsed;
  }
  return { text: textBlocks(result).join("\n\n") };
}

export function toolResultText(result) {
  const blocks = textBlocks(result);
  if (blocks.length) return blocks.join("\n\n");
  return result?.structuredContent ? JSON.stringify(result.structuredContent) : "";
}

export function findValue(candidate, names) {
  if (!candidate || typeof candidate !== "object") return null;
  for (const name of names) {
    if (candidate[name] !== undefined && candidate[name] !== null) return candidate[name];
  }
  for (const value of Object.values(candidate)) {
    if (value && typeof value === "object") {
      const found = findValue(value, names);
      if (found !== null) return found;
    }
  }
  return null;
}
