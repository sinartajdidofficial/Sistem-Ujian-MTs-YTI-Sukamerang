import app, { initSchema } from "./app.js";

const PORT = Number(process.env.PORT || 8787);

app.listen(PORT, "0.0.0.0", async () => {
  console.log(`[api] listening on :${PORT}`);
  await initSchema();
});
