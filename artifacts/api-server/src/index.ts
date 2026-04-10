import cluster from "cluster";
import { cpus } from "os";
import app from "./app.js";
import { autoSeed } from "./autoSeed.js";

const PORT = Number(process.env.PORT) || 8080;
// Keep local dev single-process for faster startup and predictable logs.
const WORKERS = process.env.NODE_ENV === "development" ? 1 : Math.min(cpus().length, 4);
const SHOULD_AUTO_SEED = process.env.AUTO_SEED === "true";

if (cluster.isPrimary) {
  console.log(`[Cluster] Primary ${process.pid} starting ${WORKERS} workers`);
  for (let i = 0; i < WORKERS; i++) cluster.fork();
  cluster.on("exit", (worker) => {
    console.log(`[Cluster] Worker ${worker.process.pid} died, restarting...`);
    cluster.fork();
  });
} else {
  app.listen(PORT, () => {
    console.log(`[Worker ${process.pid}] Listening on port ${PORT}`);
  });

  if (SHOULD_AUTO_SEED) {
    autoSeed().catch((error) => {
      console.error("[seed] Auto-seed failed:", error);
    });
  }
}
