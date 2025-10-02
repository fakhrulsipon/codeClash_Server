require("dotenv").config();
const express = require("express");
const app = express();
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { default: axios } = require("axios");
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.zffyl01.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    const db = client.db("codeClash");
    const problemCollection = db.collection("problems");
    const contestCollection = db.collection("contests");
    const usersCollection = db.collection("users");
    const submissionsCollection = db.collection("submissions");

    // api for sorting problem data with difficulty and category
    app.get("/api/problems", async (req, res) => {
      try {
        const { difficulty, category } = req.query;

        const query = {};
        if (difficulty) query.difficulty = difficulty;
        if (category) query.category = category;

        const problems = await problemCollection
          .find(query)
          .sort({ createdAt: -1 })
          .toArray();

        res.json(problems);
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server Error" });
      }
    });

    // API to create a new contest
    app.post("/api/contests", async (req, res) => {
      try {
        const { title, startTime, endTime, problems, type } = req.body;

        // basic validation
        if (!title || !startTime || !endTime || !problems || !type) {
          return res.status(400).json({
            message:
              "All fields are required: title, startTime, endTime, problems, type",
          });
        }

        // create contest object
        const newContest = {
          title,
          startTime: new Date(startTime),
          endTime: new Date(endTime),
          problems, // array of problem _id strings
          type, // "individual" or "team"
          createdAt: new Date(),
        };

        const result = await contestCollection.insertOne(newContest);

        res.status(201).json({ ...newContest, _id: result.insertedId });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server Error" });
      }
    });

    // api for getting contests with problems
    app.get("/api/contests", async (req, res) => {
      try {
        const contests = await contestCollection
          .find()
          .sort({ startTime: 1 })
          .toArray();

        const contestsWithProblems = await Promise.all(
          contests.map(async (contest) => {
            const problems = await problemCollection
              .find({ _id: { $in: contest.problems } })
              .toArray();

            return {
              ...contest,
              problems,
            };
          })
        );

        res.status(200).json(contestsWithProblems);
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server Error" });
      }
    });

    // Get single contest by ID

    app.get("/api/contests/:id", async (req, res) => {
      try {
        const id = req.params.id;
        let contest;

        // Try as ObjectId (for dynamically created contests)
        if (ObjectId.isValid(id)) {
          contest = await contestCollection.findOne({ _id: new ObjectId(id) });
        }

        // If not found, try as string (for static contests)
        if (!contest) {
          contest = await contestCollection.findOne({ _id: id });
        }

        if (!contest)
          return res.status(404).json({ message: "Contest not found" });

        // populate problems
        const problems = await problemCollection
          .find({
            _id: {
              $in: contest.problems.map((pid) =>
                ObjectId.isValid(pid) ? new ObjectId(pid) : pid
              ),
            },
          })
          .toArray();

        res.status(200).json({ ...contest, problems });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
      }
    });

    // get single problem
    app.get("/api/problems/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const problem = await problemCollection.findOne({
          _id: id,
        });

        if (!problem) return res.status(404).send("Problem not found");

        res.send(problem);
      } catch (err) {
        res.status(500).send("Server error");
      }
    });

    // Get submissions of a single user by email
    app.get("/api/submissions/:email", async (req, res) => {
      try {
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
    app.get("/api/points/:email", async (req, res) => {
      const { email } = req.params;

      try {
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

    // api for adding a new user
    app.post("/api/users", async (req, res) => {
      try {
        const { userName, userEmail, userImage, userRole } = req.body;

        // basic validation
        if (!userName || !userEmail || !userImage || !userRole) {
          return res.status(400).json({
            message:
              "All fields are required: userName, userEmail, userImage, userRole",
          });
        }

        // check if user already exists by email
        const existingUser = await usersCollection.findOne({ userEmail });
        if (existingUser) {
          return res.status(200).json({
            message: "User already exists",
            user: existingUser,
          });
        }

        // create new user object
        const newUser = {
          userName,
          userEmail,
          userImage,
          userRole,
          createdAt: new Date(),
        };

        // insert new user
        const result = await usersCollection.insertOne(newUser);

        res.status(201).json({
          message: "User added successfully",
          userId: result.insertedId,
          user: newUser,
        });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server Error" });
      }
    });

    // api for submitting solution
    app.post("/api/submissions", async (req, res) => {
      try {
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

    //monaco Editor with javascript, python, java and c
    app.post("/run-code", async (req, res) => {
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
          `${process.env.JUDGE0_API_URL}/submissions?wait=true&base64_encoded=true`,
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

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Wellcome to my codeClash");
});

app.listen(port, () => {
  console.log(`Wellcome to my codeClash app on port ${port}`);
});
