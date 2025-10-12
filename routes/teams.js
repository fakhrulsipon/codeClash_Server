const express = require("express");
const { connectDB } = require("../db");
const { ObjectId } = require("mongodb");


const router = express.Router();

// ---------------------------
// Create a new team
// ---------------------------
router.post("/", async (req, res) => {
  try {
    const { name, contestId } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Team name is required" });
    }

    const db = await connectDB();
    const teamCollection = db.collection("teams");

    const newTeam = {
      name,
      createdBy: new ObjectId(req.userId), // ✅ use token
      members: [{ userId: new ObjectId(req.userId), role: "leader" }],
      contestId: contestId ? new ObjectId(contestId) : null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await teamCollection.insertOne(newTeam);

    res.status(201).json({
      message: "Team created successfully",
      teamId: result.insertedId,
      team: newTeam,
    });
  } catch (error) {
    console.error("Error creating team:", error);
    res.status(500).json({ message: "Error creating team", error: error.message });
  }
});

// ---------------------------
// Join a team
// ---------------------------
router.put("/:id/join", async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId; // ✅ use token

    const db = await connectDB();
    const teamCollection = db.collection("teams");

    const result = await teamCollection.updateOne(
      { _id: new ObjectId(id), "members.userId": { $ne: new ObjectId(userId) } },
      { $push: { members: { userId: new ObjectId(userId), role: "member" } } }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ message: "Team not found or already joined" });
    }

    res.json({ message: "Joined team successfully" });
  } catch (error) {
    console.error("Error joining team:", error);
    res.status(500).json({ message: "Error joining team", error: error.message });
  }
});

module.exports = router;
