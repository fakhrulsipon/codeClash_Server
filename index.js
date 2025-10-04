require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { connectDB } = require("./db");

const problemsRouter = require("./routes/problems");
const contestsRouter = require("./routes/contests");
const usersRouter = require("./routes/users");
const teamsRouter = require("./routes/teams");

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Routes
app.use("/api/problems", problemsRouter);
app.use("/api/contests", contestsRouter);
app.use("/api/users", usersRouter);
app.use("/api/teams", teamsRouter);

// Root route
app.get("/", (req, res) => {
  res.send("Welcome to CodeClash API 🚀");
});

// Connect DB once when deployed
(async () => {
  try {
    await connectDB();
    console.log("✅ MongoDB connected successfully");

    if (process.env.NODE_ENV !== "production") {
      app.listen(port, () => {
        console.log(`Server running locally on port ${port}`);
      });
    }
  } catch (err) {
    console.error("❌ Failed to connect DB", err);
    process.exit(1);
  }
})();

module.exports = app;
