import express, {
  type Express,
  Request,
  Response,
  NextFunction,
} from "express";
import cors from "cors";
import compression from "compression";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import router from "./routes/index.js";

const app: Express = express();

// ✅ Trust proxy (important for Replit)
app.set("trust proxy", 1);

// ✅ Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false,
}));

// ✅ Compression
app.use(compression());

// ✅ CORS
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    exposedHeaders: ["Content-Length"],
    credentials: false,
  }),
);

// ✅ Body parsers (512kb is plenty for a student app; 2mb was too permissive)
app.use(express.json({ limit: "512kb" }));
app.use(express.urlencoded({ extended: true, limit: "512kb" }));

// ================= RATE LIMITERS =================

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many requests",
    message: "Please try again later",
  },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many auth attempts",
    message: "Please wait before trying again",
  },
});

// ================= CACHE =================

app.use("/api/announcements", (req, res, next) => {
  if (req.method === "GET") {
    res.setHeader("Cache-Control", "private, max-age=30");
  }
  next();
});

app.use("/api/hostels", (req, res, next) => {
  if (req.method === "GET") {
    res.setHeader("Cache-Control", "private, max-age=60");
  }
  next();
});

// ================= ROUTES =================

// ✅ Apply auth limiter only to auth routes
app.use("/api/auth", authLimiter);

// ✅ Apply general limiter
app.use("/api", generalLimiter);

// ✅ MAIN ROUTER
app.use("/api", router);

// ================= HEALTH =================

// ✅ FIXED HEALTH ROUTE
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// ================= ROOT CHECK (OPTIONAL BUT HELPFUL) =================

app.get("/", (_req, res) => {
  res.json({ message: "CampusOps API Running 🚀" });
});

// ================= 404 HANDLER =================

app.use((_req: Request, res: Response) => {
  res.status(404).json({
    error: "Not Found",
    message: "Route not found",
  });
});

// ================= ERROR HANDLER =================

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[ERROR]:", err);

  const status = err?.status || err?.statusCode || 500;

  res.status(status).json({
    error: status === 500 ? "Internal Server Error" : err?.name || "Error",
    message: err?.message || "Something went wrong",
  });
});

export default app;
