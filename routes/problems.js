const axios = require("axios");
const express = require("express");
const { connectDB } = require("../db");


const router = express.Router();

// GET all problems with optional filters
router.get("/", async (req, res) => {
  try {
    const db = await connectDB();
    const problemCollection = db.collection("problems");

    const { difficulty, category } = req.query;
    const query = {};
    if (difficulty) query.difficulty = difficulty;
    if (category) query.category = category;

    const problems = await problemCollection.find(query).sort({ createdAt: -1 }).toArray();
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

// monaco Editor with javascript, python, java and c
    router.post("/run-code", async (req, res) => {
      const { code, language, input } = req.body;

      const languageMap = {
        javascript: 63,
        python: 71,
        java: 62,
        c: 50, // Judge0 C language
        cpp: 54,
      };

      const language_id = languageMap[language.toLowerCase()];
      if (!language_id)
        return res.status(400).json({ error: "Invalid language" });

      const payload = {
        source_code: Buffer.from(code).toString("base64"),
        language_id,
        stdin: input ? Buffer.from(input).toString("base64") : "",
      };

      try {
        const response = await axios.post(
          `${process.env.JUDGE0_API_URL}submissions?wait=true&base64_encoded=true`,
          payload,
          {
            headers: {
              "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
              "X-RapidAPI-Host": "judge0-ce.p.rapidapi.com",
              "Content-Type": "application/json",
            },
          }
        );

        const output = response.data;

        // ✅ Decode all outputs
        const decodedOutput = {
          stdout: output.stdout
            ? Buffer.from(output.stdout, "base64").toString("utf8")
            : "",
          stderr: output.stderr
            ? Buffer.from(output.stderr, "base64").toString("utf8")
            : "",
          compile_output: output.compile_output
            ? Buffer.from(output.compile_output, "base64").toString("utf8")
            : "",
          status: output.status.description,
        };

        res.json(decodedOutput);
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Something went wrong" });
      }
    });

    // api for submitting solution
    router.post("/submissions", async (req, res) => {
      try {
        const db = await connectDB();
        const submissionsCollection = db.collection("submissions");
        const {
          userEmail,
          userName,
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


module.exports = router;
