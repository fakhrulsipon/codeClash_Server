const express = require("express");
const { ObjectId } = require("mongodb");
const { connectDB } = require("../db");
const { verifyFBToken } = require("../middlewares/authMiddleware");
const { verifyAdmin } = require("../middlewares/verifyAdmin");

const router = express.Router();

// Helper function to safely convert to ObjectId
const safeObjectId = (id) => {
  if (!id) return null;
  if (ObjectId.isValid(id)) {
    return new ObjectId(id);
  }
  return id; // Return as string if not valid ObjectId
};

// POST: Add participant to contest
router.post("/", verifyFBToken, async (req, res) => {
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

    // Insert participant - store contestId as provided (string)
    const result = await collection.insertOne({
      contestId: contestId,
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

// GET participant counts for multiple contests
router.get("/counts", verifyFBToken, verifyAdmin, async (req, res) => {
  try {
    const db = await connectDB();
    const participantsCollection = db.collection("contestParticipants");

    const { contestIds } = req.query;

    // console.log("🔍 Request received for contestIds:", contestIds);

    let contestIdArray = [];
    if (contestIds) {
      contestIdArray = contestIds.split(',');
    }

    // console.log(" Contest IDs to search for:", contestIdArray);

    // Convert string IDs to ObjectIds for querying
    const objectIdArray = contestIdArray
      .filter(id => ObjectId.isValid(id))
      .map(id => new ObjectId(id));

    // console.log(" Converted to ObjectIds:", objectIdArray);

    // If no contest IDs provided, get counts for all contests
    let matchStage = {};
    if (objectIdArray.length > 0) {
      matchStage = { contestId: { $in: objectIdArray } };
    }

    console.log("🎯 MongoDB match stage:", JSON.stringify(matchStage));

    const participantCounts = await participantsCollection.aggregate([
      {
        $match: matchStage
      },
      {
        $group: {
          _id: "$contestId",
          participantCount: { $sum: 1 }
        }
      }
    ]).toArray();

    console.log("✅ Aggregation result:", participantCounts);

    // Create a map for quick lookup - convert ObjectId back to string for frontend
    const countsMap = {};
    participantCounts.forEach(count => {
      countsMap[count._id.toString()] = count.participantCount;
    });

    console.log("📈 Final counts map:", countsMap);

    res.json({
      success: true,
      data: countsMap
    });

  } catch (error) {
    console.error("❌ Error in /counts endpoint:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching participant counts",
      error: error.message
    });
  }
});

// GET all participants with advanced filtering (for admin)
router.get("/", async (req, res) => {
  try {
    const db = await connectDB();
    const participantsCollection = db.collection("contestParticipants");
    const contestsCollection = db.collection("contests");

    const { page = 1, limit = 50, contestId, search, type } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let query = {};

    // Filter by contest
    if (contestId && contestId !== 'all') {
      query.contestId = contestId;
    }

    // Filter by type (individual/team)
    if (type && type !== 'all') {
      query.type = type;
    }

    // Search by user name or email
    if (search) {
      query.$or = [
        { userName: { $regex: search, $options: 'i' } },
        { userEmail: { $regex: search, $options: 'i' } },
        { userId: { $regex: search, $options: 'i' } }
      ];
    }

    const participants = await participantsCollection.find(query)
      .sort({ joinedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .toArray();

    // Get contest details for each participant - SIMPLIFIED VERSION
    const participantsWithContests = await Promise.all(
      participants.map(async (participant) => {
        try {
          let contest;

          // Try to find contest by string ID first
          contest = await contestsCollection.findOne({
            _id: participant.contestId
          });

          // If not found and it's a valid ObjectId, try as ObjectId
          if (!contest && ObjectId.isValid(participant.contestId)) {
            contest = await contestsCollection.findOne({
              _id: new ObjectId(participant.contestId)
            });
          }

          return {
            ...participant,
            contestName: contest?.title || contest?.name || 'Unknown Contest',
            contestDate: contest?.startTime || contest?.date || contest?.createdAt || 'Unknown Date'
          };
        } catch (error) {
          console.error("Error fetching contest details for participant:", participant._id, error);
          return {
            ...participant,
            contestName: 'Unknown Contest',
            contestDate: 'Unknown Date'
          };
        }
      })
    );

    const total = await participantsCollection.countDocuments(query);

    res.json({
      participants: participantsWithContests,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error("Error fetching participants:", error);
    res.status(500).json({ message: "Error fetching participants", error: error.message });
  }
});

// GET unique contests for filter dropdown
router.get("/contests/list", verifyFBToken, verifyAdmin, async (req, res) => {
  try {
    const db = await connectDB();
    const participantsCollection = db.collection("contestParticipants");
    const contestsCollection = db.collection("contests");

    const contestIds = await participantsCollection.distinct("contestId");

    // Try to find contests with string IDs first
    let contests = await contestsCollection.find({
      _id: { $in: contestIds }
    }).project({ title: 1, name: 1, _id: 1, startTime: 1, date: 1, createdAt: 1 }).toArray();

    res.json(contests);
  } catch (error) {
    console.error("Error fetching contests:", error);
    res.status(500).json({ message: "Error fetching contests", error: error.message });
  }
});

// GET participant statistics
router.get("/stats", verifyFBToken, verifyAdmin, async (req, res) => {
  try {
    const db = await connectDB();
    const participantsCollection = db.collection("contestParticipants");

    const stats = await participantsCollection.aggregate([
      {
        $facet: {
          totalParticipants: [{ $count: "count" }],
          participantsByType: [
            { $group: { _id: "$type", count: { $sum: 1 } } }
          ],
          participantsByContest: [
            { $group: { _id: "$contestId", count: { $sum: 1 } } }
          ],
          recentRegistrations: [
            { $sort: { joinedAt: -1 } },
            { $limit: 10 }
          ]
        }
      }
    ]).toArray();

    res.json(stats[0]);
  } catch (error) {
    console.error("Error fetching participant statistics:", error);
    res.status(500).json({ message: "Error fetching statistics", error: error.message });
  }
});

// Other endpoints remain the same...
router.delete("/duplicates", verifyFBToken, verifyAdmin, async (req, res) => {
  try {
    const db = await connectDB();
    const participantsCollection = db.collection("contestParticipants");

    const duplicates = await participantsCollection.aggregate([
      {
        $group: {
          _id: { userId: "$userId", contestId: "$contestId" },
          count: { $sum: 1 },
          entries: {
            $push: {
              _id: "$_id",
              joinedAt: "$joinedAt"
            }
          }
        }
      },
      {
        $match: {
          count: { $gt: 1 }
        }
      },
      {
        $project: {
          entries: {
            $sortArray: {
              input: "$entries",
              sortBy: { joinedAt: 1 }
            }
          }
        }
      }
    ]).toArray();

    let deletedCount = 0;
    const deletionPromises = [];

    for (const duplicate of duplicates) {
      const keepId = duplicate.entries[0]._id;
      const deleteIds = duplicate.entries.slice(1).map(entry => entry._id);

      if (deleteIds.length > 0) {
        deletionPromises.push(
          participantsCollection.deleteMany({
            _id: { $in: deleteIds }
          })
        );
        deletedCount += deleteIds.length;
      }
    }

    await Promise.all(deletionPromises);

    res.json({
      message: `Removed ${deletedCount} duplicate entries`,
      duplicatesRemoved: deletedCount,
      duplicateGroups: duplicates.length
    });
  } catch (error) {
    console.error("Error removing duplicates:", error);
    res.status(500).json({ message: "Error removing duplicates", error: error.message });
  }
});

// DELETE single participant
router.delete("/:participantId", verifyFBToken, verifyAdmin, async (req, res) => {
  try {
    const db = await connectDB();
    const participantsCollection = db.collection("contestParticipants");

    const { participantId } = req.params;
    const result = await participantsCollection.deleteOne({
      _id: new ObjectId(participantId)
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "Participant not found" });
    }

    res.json({ message: "Participant removed successfully" });
  } catch (error) {
    console.error("Error deleting participant:", error);
    res.status(500).json({ message: "Error deleting participant", error: error.message });
  }
});

// GET participant by ID
router.get("/:participantId", verifyFBToken, async (req, res) => {
  try {
    const db = await connectDB();
    const participantsCollection = db.collection("contestParticipants");
    const contestsCollection = db.collection("contests");

    const { participantId } = req.params;

    console.log("🔍 Fetching participant with ID:", participantId);
    console.log("📏 ID length:", participantId?.length);
    console.log("🔢 Is valid ObjectId?", ObjectId.isValid(participantId));

    // Only convert to ObjectId if it's valid
    let participant;
    if (ObjectId.isValid(participantId)) {
      participant = await participantsCollection.findOne({
        _id: new ObjectId(participantId)
      });
    } else {
      // If not a valid ObjectId, try to find by string (if your _id is sometimes string)
      participant = await participantsCollection.findOne({
        _id: participantId
      });
    }

    if (!participant) {
      return res.status(404).json({ message: "Participant not found" });
    }

    // Get contest details - handle both ObjectId and string contestIds
    let contest;
    if (ObjectId.isValid(participant.contestId)) {
      contest = await contestsCollection.findOne({
        _id: new ObjectId(participant.contestId)
      });
    } else {
      contest = await contestsCollection.findOne({
        _id: participant.contestId
      });
    }

    res.json({
      ...participant,
      contestDetails: contest
    });
  } catch (error) {
    console.error("Error fetching participant:", error);
    res.status(500).json({ message: "Error fetching participant", error: error.message });
  }
});

// Debug endpoint to see actual contestIds in participants collection
router.get("/debug-participants", verifyFBToken, async (req, res) => {
  try {
    const db = await connectDB();
    const participantsCollection = db.collection("contestParticipants");

    const sampleParticipants = await participantsCollection.find().limit(10).toArray();

    const debugData = sampleParticipants.map(p => ({
      _id: p._id,
      contestId: p.contestId,
      contestIdType: typeof p.contestId,
      contestIdConstructor: p.contestId?.constructor?.name,
      userId: p.userId,
      userName: p.userName
    }));

    res.json({
      success: true,
      sampleParticipants: debugData,
      totalCount: await participantsCollection.countDocuments()
    });
  } catch (error) {
    console.error("Debug error:", error);
    res.status(500).json({
      success: false,
      message: "Debug error"
    });
  }
});

module.exports = router;