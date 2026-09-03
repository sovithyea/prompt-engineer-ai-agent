import type { Target } from "../shared/types";

export interface EvalCase {
  id: string;
  rawPrompt: string;
  target: Target;
  expectedNeedsClarification: boolean;
  dimension: string;
}

export const EVAL_CASES: EvalCase[] = [
  {
    id: "vague-email",
    rawPrompt: "Write me an email.",
    target: "gpt",
    expectedNeedsClarification: true,
    dimension: "missing format/recipient/tone",
  },
  {
    id: "vague-scope-party",
    rawPrompt: "Help me plan a birthday party.",
    target: "gemini",
    expectedNeedsClarification: true,
    dimension: "missing scope (whose, budget, date, guests)",
  },
  {
    id: "vague-audience-ml",
    rawPrompt: "Explain machine learning to me.",
    target: "claude",
    expectedNeedsClarification: true,
    dimension: "missing audience/depth",
  },
  {
    id: "reasonable-default-palindrome",
    rawPrompt: "Write a function to check if a string is a palindrome.",
    target: "gpt",
    expectedNeedsClarification: false,
    dimension: "no language specified, but a reasonable default (e.g. Python) is an acceptable assumption",
  },
  {
    id: "vague-format-earbuds",
    rawPrompt: "Write a product description for wireless earbuds.",
    target: "claude",
    expectedNeedsClarification: true,
    dimension: "missing audience/tone/length/features",
  },
  {
    id: "vague-missing-content-resume",
    rawPrompt: "Give me feedback on my resume.",
    target: "gemini",
    expectedNeedsClarification: true,
    dimension: "missing source content + target role",
  },
  {
    id: "vague-maximal",
    rawPrompt: "Make this better.",
    target: "gpt",
    expectedNeedsClarification: true,
    dimension: "no subject/content at all",
  },
  {
    id: "specific-dedupe-fn",
    rawPrompt:
      "Write a Python function `dedupe(items: list[int]) -> list[int]` that removes duplicate integers from a list while preserving the original order of first occurrence. Include type hints and a one-line docstring.",
    target: "claude",
    expectedNeedsClarification: false,
    dimension: "fully specified",
  },
  {
    id: "specific-summary",
    rawPrompt:
      'Summarize this in exactly 3 bullet points, written for a general news audience with no finance background: "Acme Corp reported Q2 revenue of $412M, up 18% year-over-year, driven by strong cloud subscription growth. Net income fell to $22M due to a one-time $40M restructuring charge tied to the closure of two regional offices. The company raised its full-year revenue guidance to $1.7B-$1.75B and announced a $200M share buyback program."',
    target: "gemini",
    expectedNeedsClarification: false,
    dimension: "format + length + audience + source content given",
  },
  {
    id: "specific-apology-email",
    rawPrompt:
      "Write a formal, 2-paragraph apology email to our client Jordan Lee for the shipping delay on order #4471, offering a 15% discount code SORRY15 on their next order.",
    target: "gpt",
    expectedNeedsClarification: false,
    dimension: "recipient/tone/length/content given",
  },
];
