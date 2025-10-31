const axios = require("axios");
const express = require("express");
const { connectDB } = require("../db");

const router = express.Router();

// Add a new problem
router.post("/", async (req, res) => {
  try {
    const db = await connectDB();
    const problemCollection = db.collection("problems");

    const { title, description, category, difficulty, languages, starterCode, testCases } = req.body;

    if (!title || !description || !category || !difficulty) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Find the current maximum _id
    const lastProblem = await problemCollection.find().sort({ _id: -1 }).limit(1).toArray();
    let nextId = 1;
    if (lastProblem.length > 0) {
      nextId = parseInt(lastProblem[0]._id) + 1;
    }

    const newProblem = {
      _id: nextId.toString(),
      title,
      description,
      category,
      difficulty,
      languages,
      starterCode,
      testCases,
      createdAt: new Date(),
    };

    const result = await problemCollection.insertOne(newProblem);

    res.status(201).json({
      message: "Problem added successfully",
      problemId: newProblem._id,
      problem: newProblem,
    });
  } catch (error) {
    console.error("Error adding problem:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// GET all problems with optional filters and search
router.get("/", async (req, res) => {
  try {
    const db = await connectDB();
    const problemCollection = db.collection("problems");

    const { difficulty, category, title } = req.query;
    const query = {};

    if (difficulty) query.difficulty = difficulty;
    if (category) query.category = category;
    if (title) query.title = { $regex: title, $options: "i" };

    const problems = await problemCollection
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    res.json(problems);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server Error" });
  }
});

// GET single problem
router.get("/:id", async (req, res) => {
  try {
    const db = await connectDB();
    const problemCollection = db.collection("problems");
    const problem = await problemCollection.findOne({ _id: req.params.id });
    if (!problem) return res.status(404).send("Problem not found");

    res.json(problem);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

// Run code endpoint - FIXED: Only one definition
router.post("/run-code", async (req, res) => {
  console.log("🔍 Run-code endpoint called");

  const { code, language, input } = req.body;

  // Validate required fields
  if (!code || !language) {
    return res.status(400).json({
      error: "Missing required fields: code and language are required"
    });
  }

  const languageMap = {
    javascript: 63,
    python: 71,
    java: 62,
    c: 50,
    cpp: 54,
  };

  const language_id = languageMap[language.toLowerCase()];
  if (!language_id) {
    return res.status(400).json({
      error: "Invalid language. Supported: javascript, python, java, c, cpp"
    });
  }

  // Check environment variables
  if (!process.env.JUDGE0_API_URL || !process.env.RAPIDAPI_KEY) {
    console.error("❌ Missing environment variables");
    return res.status(500).json({
      error: "Server configuration error",
      details: "Missing JUDGE0_API_URL or RAPIDAPI_KEY environment variables"
    });
  }

  const payload = {
    source_code: Buffer.from(code).toString("base64"),
    language_id,
    stdin: input ? Buffer.from(input).toString("base64") : "",
  };

  console.log("🚀 Sending to Judge0 API...");

  try {
    const response = await axios.post(
      `https://judge0-ce.p.rapidapi.com/submissions?wait=true&base64_encoded=true`,
      payload,
      {
        headers: {
          "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
          "X-RapidAPI-Host": "judge0-ce.p.rapidapi.com",
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );

    const output = response.data;

    // Decode outputs
    const decodedOutput = {
      stdout: output.stdout ? Buffer.from(output.stdout, "base64").toString("utf8") : "",
      stderr: output.stderr ? Buffer.from(output.stderr, "base64").toString("utf8") : "",
      compile_output: output.compile_output ? Buffer.from(output.compile_output, "base64").toString("utf8") : "",
      message: output.message || "",
      status: output.status?.description || "Unknown",
      time: output.time || "",
      memory: output.memory || ""
    };

    console.log("✅ Judge0 response success");
    res.json(decodedOutput);

  } catch (err) {
    console.error("❌ Judge0 API Error:", err.message);

    // Fallback to mock execution
    console.log("🔄 Using mock execution");
    const mockResult = {
      stdout: `✓ ${language} code executed (Mock Mode)\nInput: ${input || "None"}\nCode length: ${code.length} chars`,
      stderr: "",
      status: "Success",
      message: "Running in mock mode - configure Judge0 for real execution"
    };

    res.json(mockResult);
  }
});

// API for submitting solution
router.post("/submissions", async (req, res) => {
  try {
    const db = await connectDB();
    const submissionsCollection = db.collection("submissions");
    const {
      userEmail,
      userName,
      userPhoto,
      status,
      problemTitle,
      problemDifficulty,
      problemCategory,
      point,
    } = req.body;

    if (
      !userEmail ||
      !userName ||
      !status ||
      !problemTitle ||
      !problemDifficulty ||
      !problemCategory ||
      point === undefined
    ) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const submission = {
      userEmail,
      userName,
      userPhoto: userPhoto || "",
      status,
      problemTitle,
      problemDifficulty,
      problemCategory,
      point,
      submittedAt: new Date(),
    };

    const result = await submissionsCollection.insertOne(submission);

    res.status(201).json({
      message: "Submission saved",
      submissionId: result.insertedId,
      submission,
    });
  } catch (err) {
    console.error("Error saving submission:", err);
    res.status(500).json({ message: "Server Error" });
  }
});

// DELETE problem by ID
router.delete("/:id", async (req, res) => {
  try {
    const db = await connectDB();
    const problemCollection = db.collection("problems");

    const { id } = req.params;

    const result = await problemCollection.deleteOne({ _id: id });

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "Problem not found" });
    }

    res.json({ message: "Problem deleted successfully" });
  } catch (error) {
    console.error("Error deleting problem:", error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;