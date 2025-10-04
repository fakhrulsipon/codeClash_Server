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

app.get("/", (req, res) => {
  res.send("Welcome to my codeClash");
});

// Start server after DB is ready
(async () => {
  try {
    await connectDB();
    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (err) {
    console.error("Failed to connect DB", err);
    process.exit(1);
  }
})();
