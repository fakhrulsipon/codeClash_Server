const express = require("express");
const { connectDB } = require("../db");
const router = express.Router();

// Submit review after problem submission
router.post("/submit-review", async (req, res) => {
  try {
    const db = await connectDB();
    const reviewsCollection = db.collection("reviews");
    
    const { 
      userEmail, 
      problemId, 
      rating, 
      comment, 
      submissionId,
      experience,
      userName,
      userPhoto 
    } = req.body;

    // Validation
    if (!userEmail || !problemId || !rating || !submissionId) {
      return res.status(400).json({ 
        success: false,
        message: "Missing required fields" 
      });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({ 
        success: false,
        message: "Rating must be between 1 and 5" 
      });
    }

    // Check if user already reviewed this problem
    const existingReview = await reviewsCollection.findOne({ 
      userEmail, 
      problemId 
    });

    if (existingReview) {
      return res.status(400).json({ 
        success: false,
        message: "You have already reviewed this problem" 
      });
    }

    // Create new review
    const newReview = {
      userEmail,
      userName: userName || "Anonymous",
      userPhoto: userPhoto || "",
      problemId,
      submissionId,
      rating: parseInt(rating),
      comment: comment || "",
      experience: experience || "positive",
      status: "approved",
      helpfulVotes: 0,
      reported: false,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await reviewsCollection.insertOne(newReview);
    
    res.status(201).json({ 
      success: true,
      message: "Review submitted successfully", 
      reviewId: result.insertedId 
    });
  } catch (error) {
    console.error("Error submitting review:", error);
    res.status(500).json({ 
      success: false,
      message: "Failed to submit review" 
    });
  }
});

// Get reviews for a specific problem
router.get("/problem/:problemId", async (req, res) => {
  try {
    const db = await connectDB();
    const reviewsCollection = db.collection("reviews");
    const { problemId } = req.params;
    const { limit = 10, page = 1 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get approved reviews for the problem
    const reviews = await reviewsCollection
      .find({ 
        problemId, 
        status: "approved" 
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .toArray();

    // Get total count for pagination
    const totalReviews = await reviewsCollection.countDocuments({ 
      problemId, 
      status: "approved" 
    });

    // Calculate average rating
    const ratingStats = await reviewsCollection.aggregate([
      { 
        $match: { 
          problemId, 
          status: "approved" 
        } 
      },
      {
        $group: {
          _id: "$problemId",
          averageRating: { $avg: "$rating" },
          totalRatings: { $sum: 1 },
          ratingDistribution: {
            $push: "$rating"
          }
        }
      }
    ]).toArray();

    const stats = ratingStats[0] || {
      averageRating: 0,
      totalRatings: 0,
      ratingDistribution: []
    };

    res.json({
      success: true,
      reviews,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalReviews,
        pages: Math.ceil(totalReviews / parseInt(limit))
      },
      stats: {
        averageRating: Math.round(stats.averageRating * 10) / 10 || 0,
        totalRatings: stats.totalRatings,
        ratingDistribution: stats.ratingDistribution.reduce((acc, rating) => {
          acc[rating] = (acc[rating] || 0) + 1;
          return acc;
        }, {1: 0, 2: 0, 3: 0, 4: 0, 5: 0})
      }
    });
  } catch (error) {
    console.error("Error fetching reviews:", error);
    res.status(500).json({ 
      success: false,
      message: "Failed to fetch reviews" 
    });
  }
});

// Get user's reviews
router.get("/user/:email", async (req, res) => {
  try {
    const db = await connectDB();
    const reviewsCollection = db.collection("reviews");
    const { email } = req.params;

    const reviews = await reviewsCollection
      .find({ userEmail: email })
      .sort({ createdAt: -1 })
      .toArray();

    res.json({
      success: true,
      reviews
    });
  } catch (error) {
    console.error("Error fetching user reviews:", error);
    res.status(500).json({ 
      success: false,
      message: "Failed to fetch user reviews" 
    });
  }
});

// Get all reviews for admin (with filtering)
router.get("/", async (req, res) => {
  try {
    const db = await connectDB();
    const reviewsCollection = db.collection("reviews");
    
    const { 
      status = "all", 
      page = 1, 
      limit = 10,
      search = "" 
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build query
    let query = {};
    if (status !== "all") {
      query.status = status;
    }
    
    if (search) {
      query.$or = [
        { userName: { $regex: search, $options: "i" } },
        { userEmail: { $regex: search, $options: "i" } },
        { comment: { $regex: search, $options: "i" } }
      ];
    }

    const reviews = await reviewsCollection
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .toArray();

    const total = await reviewsCollection.countDocuments(query);

    res.json({
      success: true,
      reviews,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error("Error fetching all reviews:", error);
    res.status(500).json({ 
      success: false,
      message: "Failed to fetch reviews" 
    });
  }
});

// Update review status (admin only)
router.patch("/:reviewId/status", async (req, res) => {
  try {
    const db = await connectDB();
    const reviewsCollection = db.collection("reviews");
    const { reviewId } = req.params;
    const { status } = req.body;

    if (!["pending", "approved", "rejected"].includes(status)) {
      return res.status(400).json({ 
        success: false,
        message: "Invalid status" 
      });
    }

    const result = await reviewsCollection.updateOne(
      { _id: new ObjectId(reviewId) },
      { 
        $set: { 
          status, 
          updatedAt: new Date() 
        } 
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ 
        success: false,
        message: "Review not found" 
      });
    }

    res.json({
      success: true,
      message: "Review status updated successfully"
    });
  } catch (error) {
    console.error("Error updating review status:", error);
    res.status(500).json({ 
      success: false,
      message: "Failed to update review status" 
    });
  }
});

// Vote helpful for a review
router.post("/:reviewId/helpful", async (req, res) => {
  try {
    const db = await connectDB();
    const reviewsCollection = db.collection("reviews");
    const { reviewId } = req.params;
    const { userEmail } = req.body;

    // In a real app, you'd track which users voted to prevent multiple votes
    const result = await reviewsCollection.updateOne(
      { _id: new ObjectId(reviewId) },
      { $inc: { helpfulVotes: 1 } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ 
        success: false,
        message: "Review not found" 
      });
    }

    res.json({
      success: true,
      message: "Thank you for your feedback"
    });
  } catch (error) {
    console.error("Error voting helpful:", error);
    res.status(500).json({ 
      success: false,
      message: "Failed to submit vote" 
    });
  }
});

module.exports = router;