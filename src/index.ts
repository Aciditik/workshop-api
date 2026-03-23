import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth";
import tournamentRoutes from "./routes/tournaments";
import matchRoutes from "./routes/matches";
import publicRoutes from "./routes/public";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "5mb" }));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/tournaments", tournamentRoutes);
app.use("/api/tournaments", matchRoutes);
app.use("/api/public", publicRoutes);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Tournament API running on http://localhost:${PORT}`);
});
