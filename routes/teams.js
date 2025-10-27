const express = require("express");
const { ObjectId } = require("mongodb");
const { connectDB } = require("../db");
const { verifyFBToken } = require("../middlewares/authMiddleware");
const { verifyAdmin } = require("../middlewares/verifyAdmin");

const router = express.Router();

// Helper: safely parse ObjectId
const safeObjectId = (id) => {
  if (!id) return null;
  return ObjectId.isValid(id) ? new ObjectId(id) : id;
};

// Helper: generate 6-char alphanumeric code
const generateTeamCode = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

// Create team
router.post("/", verifyFBToken, async (req, res) => {
  try {
    const db = await connectDB();
    const teamCollection = db.collection("teams");

    const { name, contestId, userId, userName, userImage } = req.body;

    if (!name || !contestId || !userId) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Generate unique team code
    let code = generateTeamCode();
    let exists = await teamCollection.findOne({ code });
    while (exists) {
      code = generateTeamCode();
      exists = await teamCollection.findOne({ code });
    }

    const team = {
      name: name,
      contestId: new ObjectId(contestId),
      code: code,
      createdBy: userId,
      members: [
        {
          userId: userId,
          userName: userName,
          userImage: userImage,
          role: "leader",
          ready: false,
          joinedAt: new Date(),
        },
      ],
      status: "waiting",
      readyAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await teamCollection.insertOne(team);
    res.status(201).json({ message: "Team created", teamCode: code });
  } catch (error) {
    console.error("Error creating team:", error);
    res.status(500).json({ message: "Failed to create team" });
  }
});

// Join team using teamCode
router.post("/join", verifyFBToken, async (req, res) => {
  try {
    const db = await connectDB();
    const teamCollection = db.collection("teams");

    const { code, userId, userName, userImage } = req.body;

    if (!code || !userId) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const team = await teamCollection.findOne({ code });
    if (!team) {
      return res.status(404).json({ message: "Team not found" });
    }

    const alreadyMember = team.members.some((m) => m.userId === userId);
    if (alreadyMember) {
      return res.status(409).json({ message: "Already in this team" });
    }

    await teamCollection.updateOne(
      { code },
      {
        $push: {
          members: {
            userId,
            userName,
            userImage,
            role: "member",
            ready: false,
            joinedAt: new Date(),
          },
        },
        $set: {
          updatedAt: new Date(),
          status: "waiting",
          readyAt: null,
        },
      }
    );

    res.status(200).json({ message: "Joined team successfully!" });
  } catch (error) {
    console.error("Error joining team:", error);
    res.status(500).json({ message: "Failed to join team" });
  }
});

// Get team by userId and contestId - returns most recent team
router.get("/user/:userId", async (req, res) => {
  try {
    const db = await connectDB();
    const teamCollection = db.collection("teams");

    const { userId } = req.params;
    const { contestId } = req.query;

    if (!userId || !contestId) {
      return res.status(400).json({ message: "Missing userId or contestId" });
    }

    const queryContestId = ObjectId.isValid(contestId) ? new ObjectId(contestId) : contestId;

    const teams = await teamCollection.find({
      contestId: queryContestId,
      "members.userId": userId,
    }).sort({ createdAt: -1 }).toArray();

    if (!teams || teams.length === 0) {
      return res.status(404).json({ message: "Team not found" });
    }

    const mostRecentTeam = teams[0];
    res.json(mostRecentTeam);
  } catch (error) {
    console.error("Error fetching team by user:", error);
    res.status(500).json({ message: "Failed to fetch team" });
  }
});

// Get team by code
router.get("/code/:teamCode", async (req, res) => {
  try {
    const db = await connectDB();
    const teamCollection = db.collection("teams");
    
    const { teamCode } = req.params;
    const team = await teamCollection.findOne({ code: teamCode });
    
    if (!team) {
      return res.status(404).json({ message: "Team not found" });
    }
    
    res.json(team);
  } catch (error) {
    console.error("Error fetching team by code:", error);
    res.status(500).json({ message: "Failed to fetch team" });
  }
});

// Update member ready state
router.patch("/:teamCode/ready", verifyFBToken, async (req, res) => {
  try {
    const db = await connectDB();
    const teamCollection = db.collection("teams");

    const { teamCode } = req.params;
    const { userId, ready } = req.body;

    // Update user's ready state
    await teamCollection.updateOne(
      { code: teamCode, "members.userId": userId },
      {
        $set: {
          "members.$.ready": ready,
          updatedAt: new Date(),
        },
      }
    );

    // Fetch updated team
    const team = await teamCollection.findOne({ code: teamCode });
    if (!team) return res.status(404).json({ message: "Team not found" });

    // Check if all members are ready
    const allReady = team.members.every((m) => m.ready === true);
    await teamCollection.updateOne(
      { code: teamCode },
      { $set: { status: allReady ? "ready" : "waiting", readyAt: allReady ? new Date() : null } }
    );

    const updatedTeam = await teamCollection.findOne({ code: teamCode });
    res.json(updatedTeam);
  } catch (error) {
    console.error("Error updating ready state:", error);
    res.status(500).json({ message: "Failed to update ready state" });
  }
});

// Start contest (leader)
router.patch("/:teamCode/start", verifyFBToken, async (req, res) => {
  try {
    const db = await connectDB();
    const teamCollection = db.collection("teams");

    const { teamCode } = req.params;
    const { userId } = req.body;

    const team = await teamCollection.findOne({ code: teamCode });
    if (!team) return res.status(404).json({ message: "Team not found" });

    if (team.createdBy !== userId) {
      return res.status(403).json({ message: "Only the leader can start the contest" });
    }

    if (!team.members.every((m) => m.ready)) {
      return res.status(400).json({ message: "All members must be ready" });
    }

    await teamCollection.updateOne(
      { code: teamCode },
      { $set: { status: "started", updatedAt: new Date() } }
    );

    const updatedTeam = await teamCollection.findOne({ code: teamCode });
    res.json({ message: "Contest started", team: updatedTeam });
  } catch (error) {
    console.error("Error starting contest:", error);
    res.status(500).json({ message: "Failed to start contest" });
  }
});

// ==================== ADMIN ROUTES ====================

// Get all teams (for admin)
router.get("/", async (req, res) => {
  try {
    const db = await connectDB();
    const teamCollection = db.collection("teams");
    
    // Optional: Add pagination, sorting, filtering
    const { page = 1, limit = 50, status, search } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    let query = {};
    
    // Filter by status
    if (status && status !== 'all') {
      query.status = status;
    }
    
    // Search by team name or code
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
        { "members.userName": { $regex: search, $options: 'i' } }
      ];
    }
    
    const teams = await teamCollection.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .toArray();
    
    const total = await teamCollection.countDocuments(query);
    
    res.json({
      teams,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error("Error fetching teams:", error);
    res.status(500).json({ message: "Error fetching teams", error: error.message });
  }
});

// Get team by ID (for admin)
router.get("/:teamId", verifyFBToken, verifyAdmin, async (req, res) => {
  try {
    const db = await connectDB();
    const teamCollection = db.collection("teams");
    
    const { teamId } = req.params;
    const team = await teamCollection.findOne({ _id: safeObjectId(teamId) });
    
    if (!team) {
      return res.status(404).json({ message: "Team not found" });
    }
    
    res.json(team);
  } catch (error) {
    console.error("Error fetching team:", error);
    res.status(500).json({ message: "Failed to fetch team" });
  }
});

// Update team status (admin)
router.patch("/:teamId/status", verifyFBToken, verifyAdmin, async (req, res) => {
  try {
    const db = await connectDB();
    const teamCollection = db.collection("teams");

    const { teamId } = req.params;
    const { status } = req.body;

    if (!status || !["waiting", "ready", "started", "completed"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const result = await teamCollection.updateOne(
      { _id: safeObjectId(teamId) },
      { 
        $set: { 
          status: status,
          updatedAt: new Date(),
          ...(status === "completed" && { completedAt: new Date() })
        } 
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "Team not found" });
    }

    const updatedTeam = await teamCollection.findOne({ _id: safeObjectId(teamId) });
    res.json({ message: "Team status updated", team: updatedTeam });
  } catch (error) {
    console.error("Error updating team status:", error);
    res.status(500).json({ message: "Failed to update team status" });
  }
});

// Delete team (admin)
router.delete("/:teamId", verifyFBToken, verifyAdmin, async (req, res) => {
  try {
    const db = await connectDB();
    const teamCollection = db.collection("teams");

    const { teamId } = req.params;
    const result = await teamCollection.deleteOne({ _id: safeObjectId(teamId) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "Team not found" });
    }

    res.json({ message: "Team deleted successfully" });
  } catch (error) {
    console.error("Error deleting team:", error);
    res.status(500).json({ message: "Failed to delete team" });
  }
});

// Get team statistics (for admin dashboard)
router.get("/stats/summary", verifyFBToken, verifyAdmin, async (req, res) => {
  try {
    const db = await connectDB();
    const teamCollection = db.collection("teams");

    const stats = await teamCollection.aggregate([
      {
        $facet: {
          totalTeams: [{ $count: "count" }],
          statusCounts: [
            { $group: { _id: "$status", count: { $sum: 1 } } }
          ],
          teamsByDate: [
            {
              $group: {
                _id: {
                  $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
                },
                count: { $sum: 1 }
              }
            },
            { $sort: { _id: 1 } },
            { $limit: 30 }
          ],
          averageMembers: [
            {
              $group: {
                _id: null,
                averageMembers: { $avg: { $size: "$members" } }
              }
            }
          ]
        }
      }
    ]).toArray();

    res.json(stats[0]);
  } catch (error) {
    console.error("Error fetching team statistics:", error);
    res.status(500).json({ message: "Failed to fetch team statistics" });
  }
});

module.exports = router;