"use client";

import AI_Prompt from "@/components/kokonutui/ai-prompt";

export function AiPromptDemo() {
  return (
    <AI_Prompt
      headerText="ui-demo"
      headerAction="Kokonut UI"
      onSubmit={(value, model) => console.log("[ui-demo] ai-prompt submit", { value, model })}
    />
  );
}
