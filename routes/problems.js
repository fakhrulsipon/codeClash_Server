const express = require("express");
const { ObjectId } = require("mongodb");
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

    const problem = await problemCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!problem) return res.status(404).send("Problem not found");

    res.json(problem);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

module.exports = router;
