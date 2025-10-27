const express = require("express");
const { connectDB } = require("../db");

const router = express.Router();

// POST: submit contest problem
router.post("/", async (req, res) => {
  try {
    const db = await connectDB();
    const contestSubmissions = db.collection("contestSubmissions");

    const { contestId, problemId, userEmail, userName, code, status, output, point } = req.body;

    if (!contestId || !problemId || !userEmail || !userName || !status) {
      return res.status(400).json({ message: "All required fields are missing" });
    }

    const newSubmission = {
      contestId,
      problemId,
      userEmail,
      userName,
      code: code || "",
      status,
      output: output || "",
      point: point || 0,
      submittedAt: new Date(),
    };

    const result = await contestSubmissions.insertOne(newSubmission);
    res.status(201).json({ message: "Submission saved", submissionId: result.insertedId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET leaderboard for a contest
router.get("/leaderboard/:contestId", async (req, res) => {
  try {
    const db = await connectDB();
    const contestSubmissions = db.collection("contestSubmissions");

    const { contestId } = req.params;

    // Aggregate total points per user
    const leaderboard = await contestSubmissions
      .aggregate([
        { $match: { contestId } },
        { 
          $group: {
            _id: "$userEmail",
            userName: { $first: "$userName" },
            totalPoints: { $sum: "$point" },
            submissions: { 
              $push: {
                problemId: "$problemId",
                status: "$status",
                point: "$point",
                submittedAt: "$submittedAt"
              }
            }
          }
        },
        { $sort: { totalPoints: -1 } }
      ])
      .toArray();

    res.status(200).json(leaderboard);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
