const express = require("express");
const { ObjectId } = require("mongodb");
const { connectDB } = require("../db"); // make sure your db connection file is correct

const router = express.Router();

// POST: Add participant to contest
router.post("/", async (req, res) => {
  const { contestId, userId, userName, userEmail, type } = req.body;

  if (!contestId || !userId || !type) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    const db = await connectDB();
    const collection = db.collection("contestParticipants");

    // Check if user already joined this contest
    const existing = await collection.findOne({ contestId, userId });
    if (existing) {
      return res.status(409).json({ message: "User already joined this contest" });
    }

    // Insert participant
    const result = await collection.insertOne({
      contestId: new ObjectId(contestId),
      userId,
      userName,
      userEmail,
      type,
      joinedAt: new Date(),
    });

    res.status(201).json({ message: "Joined contest successfully", participantId: result.insertedId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// GET all participants (for testing only)
router.get("/", async (req, res) => {
  try {
    const db = await connectDB();
    const participants = await db.collection("contestParticipants").find({}).toArray();
    res.json(participants);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});


module.exports = router;