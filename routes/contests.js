const express = require("express");
const { ObjectId } = require("mongodb");
const { connectDB } = require("../db");

const router = express.Router();

// Create contest
router.post("/", async (req, res) => {
  try {
    const db = await connectDB();
    const contestCollection = db.collection("contests");

    const { title, startTime, endTime, problems, type } = req.body;
    if (!title || !startTime || !endTime || !problems || !type) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const newContest = {
      title,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      problems,
      type,
      createdAt: new Date(),
    };

    const result = await contestCollection.insertOne(newContest);
    res.status(201).json({ ...newContest, _id: result.insertedId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server Error" });
  }
});

// Get all contests with problems
router.get("/", async (req, res) => {
  try {
    const db = await connectDB();
    const contestCollection = db.collection("contests");
    const problemCollection = db.collection("problems");

    const contests = await contestCollection.find().sort({ startTime: 1 }).toArray();

    const contestsWithProblems = await Promise.all(
      contests.map(async (contest) => {
        const problems = await problemCollection
          .find({ _id: { $in: contest.problems.map(pid => ObjectId.isValid(pid) ? new ObjectId(pid) : pid) } })
          .toArray();
        return { ...contest, problems };
      })
    );

    res.json(contestsWithProblems);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server Error" });
  }
});

// Get single contest by ID
router.get("/:id", async (req, res) => {
  try {
    const db = await connectDB();
    const contestCollection = db.collection("contests");
    const problemCollection = db.collection("problems");

    let contest;
    const id = req.params.id;

    if (ObjectId.isValid(id)) {
      contest = await contestCollection.findOne({ _id: new ObjectId(id) });
    } else {
      contest = await contestCollection.findOne({ _id: id });
    }

    if (!contest) return res.status(404).json({ message: "Contest not found" });

    const problems = await problemCollection
      .find({ _id: { $in: contest.problems.map(pid => ObjectId.isValid(pid) ? new ObjectId(pid) : pid) } })
      .toArray();

    res.json({ ...contest, problems });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
