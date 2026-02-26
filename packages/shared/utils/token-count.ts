import { Tiktoken } from "js-tiktoken/lite";

let encoder: Tiktoken | null = null;

async function getEncoder(): Promise<Tiktoken> {
  if (!encoder) {
    const rankPath = "js-tiktoken/ranks/cl100k_base"; // path makes TS skip resolution - we need this due to 'Node' resolution of modules in our ts.config
    const { default: cl100k_base } = await import(rankPath); // lazy import makes sense here, this is a few MB on init but gets cached after
    encoder = new Tiktoken(cl100k_base);
  }
  return encoder;
}

export async function estimateTokenCount(text: string): Promise<number> {
  const enc = await getEncoder();
  return enc.encode(text).length;
}
