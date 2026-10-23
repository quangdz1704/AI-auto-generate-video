import {
  runTemplatePipeline,
  type PipelineOptions,
} from "../render/template-pipeline.js";

process.once(
  "message",
  async (task: { scriptPath: string; options: PipelineOptions }) => {
    try {
      await runTemplatePipeline(task.scriptPath, {
        ...task.options,
        onProgress: (event) => {
          process.send?.({ type: "progress", ...event });
        },
      });
      process.send?.({ type: "done" });
      process.disconnect?.();
    } catch (error) {
      process.send?.({
        type: "error",
        error: error instanceof Error ? error.message : "Không tạo được video.",
      });
      process.exitCode = 1;
      process.disconnect?.();
    }
  },
);
