const express = require("express");
const { connectDB } = require("../db");

const router = express.Router();

// Add user
router.post("/", async (req, res) => {
  try {
    const db = await connectDB();
    const usersCollection = db.collection("users");

    const { userName, userEmail, userImage, userRole } = req.body;
    if (!userName || !userEmail || !userImage || !userRole) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const existingUser = await usersCollection.findOne({ userEmail });
    if (existingUser) {
      return res.status(200).json({ message: "User already exists", user: existingUser });
    }

    const newUser = {
      userName,
      userEmail,
      userImage,
      userRole,
      createdAt: new Date(),
    };

    const result = await usersCollection.insertOne(newUser);
    res.status(201).json({ message: "User added successfully", userId: result.insertedId, user: newUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server Error" });
  }
});

// GET all users
router.get("/", async (req, res) => {
  try {
    const db = await connectDB();
    const usersCollection = db.collection("users");

    const users = await usersCollection.find().toArray();
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server Error" });
  }
});


// GET user by is email
router.get("/:email", async (req, res) => {
  try {
    const db = await connectDB();
    const usersCollection = db.collection("users");

    const { email } = req.params;
    const user = await usersCollection.findOne({ userEmail: email });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server Error" });
  }
});



// Get submissions of a single user by email
    router.get("/submissions/:email", async (req, res) => {
      try {
        const db = await connectDB();
        const submissionsCollection = db.collection("submissions");

        const email = req.params.email;

        if (!email) {
          return res.status(400).json({ message: "Email is required" });
        }

        // find submissions by userEmail
        const submissions = await submissionsCollection
          .find({ userEmail: email })
          .sort({ submittedAt: -1 })
          .toArray();

        if (!submissions || submissions.length === 0) {
          return res.status(404).json({ message: "No submissions found" });
        }

        res.status(200).json(submissions);
      } catch (err) {
        console.error("Error fetching submissions:", err);
        res.status(500).json({ message: "Server Error" });
      }
    });


    // get single user total point + success/failure + growth
    router.get("/profile/:email", async (req, res) => {
      const { email } = req.params;

      try {const db = await connectDB();
        const submissionsCollection = db.collection("submissions");
        const result = await submissionsCollection
          .aggregate([
            { $match: { userEmail: email } },
            {
              $group: {
                _id: "$userEmail",
                totalPoints: { $sum: "$point" },
                totalSubmissions: { $sum: 1 },
                successCount: {
                  $sum: { $cond: [{ $eq: ["$status", "Success"] }, 1, 0] },
                },
                failureCount: {
                  $sum: { $cond: [{ $eq: ["$status", "Failure"] }, 1, 0] },
                },
                growth: {
                  $push: {
                    date: {
                      $dateToString: {
                        format: "%Y-%m-%d",
                        date: "$submittedAt",
                      },
                    },
                    count: 1,
                  },
                },
              },
            },
          ])
          .toArray();

        if (result.length === 0) {
          return res
            .status(404)
            .json({ message: "User not found or no submissions" });
        }

        // growthMap type annotation সরিয়ে দেওয়া
        const growthMap = {};
        result[0].growth.forEach((g) => {
          growthMap[g.date] = (growthMap[g.date] || 0) + g.count;
        });

        const growth = Object.keys(growthMap)
          .sort()
          .map((date) => ({ date, count: growthMap[date] }));
        res.json({
          email: result[0]._id,
          totalPoints: result[0].totalPoints,
          totalSubmissions: result[0].totalSubmissions,
          successCount: result[0].successCount,
          failureCount: result[0].failureCount,
          growth,
        });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server Error" });
      }
    });



module.exports = router;