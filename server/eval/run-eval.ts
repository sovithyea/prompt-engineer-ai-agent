import { analyze, rewrite } from "../src/engine";
import { EVAL_CASES } from "./prompts";

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("Set ANTHROPIC_API_KEY in the environment before running the eval.");
    process.exit(1);
  }

  let passed = 0;
  let failed = 0;

  for (const evalCase of EVAL_CASES) {
    console.log(`\n=== ${evalCase.id} (${evalCase.dimension}) ===`);
    console.log(`prompt: ${evalCase.rawPrompt}`);
    console.log(`target: ${evalCase.target}`);

    try {
      const result = await analyze({ rawPrompt: evalCase.rawPrompt, target: evalCase.target }, apiKey);
      console.log("analyze result:", JSON.stringify(result));

      const questionCountOk = !result.needsClarification || (result.questions !== undefined && result.questions.length >= 1 && result.questions.length <= 2);

      if (result.needsClarification === evalCase.expectedNeedsClarification && questionCountOk) {
        console.log(`PASS (expected needsClarification=${evalCase.expectedNeedsClarification})`);
        passed++;
      } else {
        console.log(`FAIL (expected needsClarification=${evalCase.expectedNeedsClarification}, got ${result.needsClarification})`);
        failed++;
      }

      if (!evalCase.expectedNeedsClarification) {
        const rewriteResult = await rewrite({ rawPrompt: evalCase.rawPrompt, target: evalCase.target }, apiKey);
        console.log("rewrite result:", JSON.stringify(rewriteResult, null, 2));
      }
    } catch (err) {
      console.error("ERROR:", err);
      failed++;
    }
  }

  console.log(`\n=== ${passed}/${passed + failed} structural checks passed ===`);
  console.log("Manually review the printed questions/rewrites above for semantic quality.");
}

main();
