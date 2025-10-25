const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

const serviceAccount = require("./firebase/serviceAccountKey.json");
const app = express();
const port = process.env.PORT || 3000;

// Middleware
// app.use(cors())
app.use(express.json());

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "https://eduhive-auth-87275.web.app",
  process.env.CLIENT_URL
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    credentials: true,
  })
);

// Firebase Admin Initialization
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// MongoDB connection URI
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.oclat4d.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Verify Firebase Token Middleware
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers?.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
  const token = authHeader.split(" ")[1];
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.decoded = decoded;
    next();
  } catch {
    return res.status(401).send({ message: "Unauthorized access" });
  }
};

// Gamification Helper Functions
const calculateLevel = (points) => {
  // Simple level calculation: every 100 points = 1 level
  return Math.floor(points / 100) + 1;
};

const awardPoints = async (usersCollection, userEmail, points, actionType) => {
  // Update user points and level
  const user = await usersCollection.findOne({ email: userEmail });
  
  if (!user) {
    // Create new user profile if doesn't exist
    await usersCollection.insertOne({
      email: userEmail,
      points: points,
      level: calculateLevel(points),
      badges: [],
      lastActivity: new Date(),
      activities: [{
        type: actionType,
        points: points,
        timestamp: new Date()
      }]
    });
  } else {
    // Update existing user
    const newPoints = (user.points || 0) + points;
    const newLevel = calculateLevel(newPoints);
    
    await usersCollection.updateOne(
      { email: userEmail },
      {
        $inc: { points: points },
        $set: { 
          level: newLevel,
          lastActivity: new Date()
        },
        $push: {
          activities: {
            type: actionType,
            points: points,
            timestamp: new Date()
          }
        }
      }
    );
  }
};

// Adaptive Learning Paths APIs
let articlesCollection, usersCollection, leaderboardCollection, learningPathsCollection, userProgressCollection;

// Get all learning paths
app.get("/learning-paths", async (req, res) => {
  try {
    const paths = await learningPathsCollection.find({}).toArray();
    res.send(paths);
  } catch (error) {
    console.error("Error fetching learning paths:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

// Get a specific learning path by ID
app.get("/learning-paths/:id", async (req, res) => {
  try {
    const path = await learningPathsCollection.findOne({
      _id: new ObjectId(req.params.id)
    });
    
    if (!path) {
      return res.status(404).send({ message: "Learning path not found" });
    }
    
    res.send(path);
  } catch (error) {
    console.error("Error fetching learning path:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

// Get user's learning progress
app.get("/user/progress/:email", verifyToken, async (req, res) => {
  try {
    const email = req.params.email;
    
    if (req.decoded.email !== email) {
      return res.status(403).send({ message: "Forbidden access" });
    }

    const progress = await userProgressCollection.findOne({ userEmail: email });
    
    if (!progress) {
      // Create initial progress record if doesn't exist
      const initialProgress = {
        userEmail: email,
        enrolledPaths: [],
        completedArticles: [],
        lastUpdated: new Date()
      };
      
      await userProgressCollection.insertOne(initialProgress);
      return res.send(initialProgress);
    }
    
    res.send(progress);
  } catch (error) {
    console.error("Error fetching user progress:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

// Enroll user in a learning path
app.post("/user/progress/:email/enroll/:pathId", verifyToken, async (req, res) => {
  try {
    const email = req.params.email;
    const pathId = req.params.pathId;
    
    if (req.decoded.email !== email) {
      return res.status(403).send({ message: "Forbidden access" });
    }

    // Check if path exists
    const path = await learningPathsCollection.findOne({
      _id: new ObjectId(pathId)
    });
    
    if (!path) {
      return res.status(404).send({ message: "Learning path not found" });
    }

    // Check if user is already enrolled
    const userProgress = await userProgressCollection.findOne({ userEmail: email });
    
    if (userProgress && userProgress.enrolledPaths.includes(pathId)) {
      return res.status(400).send({ message: "User already enrolled in this path" });
    }

    // Enroll user in path
    const result = await userProgressCollection.updateOne(
      { userEmail: email },
      {
        $addToSet: { enrolledPaths: pathId },
        $set: { lastUpdated: new Date() }
      },
      { upsert: true }
    );

    // Award points for enrolling in a learning path
    await awardPoints(usersCollection, email, 20, "enroll_learning_path");
    
    res.send({ message: "Successfully enrolled in learning path", modifiedCount: result.modifiedCount });
  } catch (error) {
    console.error("Error enrolling in learning path:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

// Mark article as completed in learning path
app.post("/user/progress/:email/complete/:articleId", verifyToken, async (req, res) => {
  try {
    const email = req.params.email;
    const articleId = req.params.articleId;
    
    if (req.decoded.email !== email) {
      return res.status(403).send({ message: "Forbidden access" });
    }

    // Check if article exists
    const article = await articlesCollection.findOne({
      _id: new ObjectId(articleId)
    });
    
    if (!article) {
      return res.status(404).send({ message: "Article not found" });
    }

    // Mark article as completed
    const result = await userProgressCollection.updateOne(
      { userEmail: email },
      {
        $addToSet: { completedArticles: articleId },
        $set: { lastUpdated: new Date() }
      },
      { upsert: true }
    );

    // Award points for completing an article
    await awardPoints(usersCollection, email, 15, "complete_article");
    
    res.send({ message: "Article marked as completed", modifiedCount: result.modifiedCount });
  } catch (error) {
    console.error("Error marking article as completed:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

// Get user's next recommended article in a learning path
app.get("/user/progress/:email/next/:pathId", verifyToken, async (req, res) => {
  try {
    const email = req.params.email;
    const pathId = req.params.pathId;
    
    if (req.decoded.email !== email) {
      return res.status(403).send({ message: "Forbidden access" });
    }

    // Get user progress
    const userProgress = await userProgressCollection.findOne({ userEmail: email });
    
    if (!userProgress) {
      return res.status(404).send({ message: "User progress not found" });
    }

    // Check if user is enrolled in this path
    if (!userProgress.enrolledPaths.includes(pathId)) {
      return res.status(400).send({ message: "User not enrolled in this learning path" });
    }

    // Get learning path
    const path = await learningPathsCollection.findOne({
      _id: new ObjectId(pathId)
    });
    
    if (!path) {
      return res.status(404).send({ message: "Learning path not found" });
    }

    // Find next article that hasn't been completed
    let nextArticle = null;
    for (const articleId of path.articleSequence) {
      if (!userProgress.completedArticles.includes(articleId)) {
        nextArticle = await articlesCollection.findOne({
          _id: new ObjectId(articleId)
        });
        break;
      }
    }

    if (!nextArticle) {
      // All articles completed
      return res.send({ message: "All articles in this path completed", completed: true });
    }
    
    res.send({ nextArticle });
  } catch (error) {
    console.error("Error fetching next article:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

// Get user's progress for a specific learning path
app.get("/user/progress/:email/path/:pathId", verifyToken, async (req, res) => {
  try {
    const email = req.params.email;
    const pathId = req.params.pathId;
    
    if (req.decoded.email !== email) {
      return res.status(403).send({ message: "Forbidden access" });
    }

    // Get user progress
    const userProgress = await userProgressCollection.findOne({ userEmail: email });
    
    if (!userProgress) {
      return res.status(404).send({ message: "User progress not found" });
    }

    // Check if user is enrolled in this path
    if (!userProgress.enrolledPaths.includes(pathId)) {
      return res.status(400).send({ message: "User not enrolled in this learning path" });
    }

    // Get learning path
    const path = await learningPathsCollection.findOne({
      _id: new ObjectId(pathId)
    });
    
    if (!path) {
      return res.status(404).send({ message: "Learning path not found" });
    }

    // Calculate progress percentage
    const totalArticles = path.articleSequence.length;
    const completedArticles = userProgress.completedArticles.filter(id => 
      path.articleSequence.includes(id)
    ).length;
    
    const progressPercentage = totalArticles > 0 ? 
      Math.round((completedArticles / totalArticles) * 100) : 0;

    res.send({
      path,
      progress: {
        totalArticles,
        completedArticles,
        progressPercentage,
        completedArticleIds: userProgress.completedArticles.filter(id => 
          path.articleSequence.includes(id)
        )
      }
    });
  } catch (error) {
    console.error("Error fetching path progress:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

async function run() {
  try {
    // Connect the client to the server
    await client.connect();
    console.log("Connected to MongoDB");
    
    articlesCollection = client.db("eduHive").collection("articles");
    usersCollection = client.db("eduHive").collection("users"); // For gamification
    leaderboardCollection = client.db("eduHive").collection("leaderboard"); // For leaderboard
    learningPathsCollection = client.db("eduHive").collection("learningPaths"); // For adaptive learning paths
    userProgressCollection = client.db("eduHive").collection("userProgress"); // For tracking user progress

    // Get user gamification data
    app.get("/user/profile/:email", verifyToken, async (req, res) => {
      try {
        const email = req.params.email;
        
        if (req.decoded.email !== email) {
          return res.status(403).send({ message: "Forbidden access" });
        }

        const user = await usersCollection.findOne({ email: email });
        
        if (!user) {
          return res.status(404).send({ message: "User not found" });
        }

        res.send(user);
      } catch (error) {
        console.error("Error fetching user profile:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    // Get leaderboard
    app.get("/leaderboard", async (req, res) => {
      try {
        const leaderboard = await usersCollection
          .find({})
          .sort({ points: -1 })
          .limit(50)
          .toArray();
          
        res.send(leaderboard);
      } catch (error) {
        console.error("Error fetching leaderboard:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    // Get user badges
    app.get("/user/badges/:email", verifyToken, async (req, res) => {
      try {
        const email = req.params.email;
        
        if (req.decoded.email !== email) {
          return res.status(403).send({ message: "Forbidden access" });
        }

        const user = await usersCollection.findOne({ email: email });
        
        if (!user) {
          return res.status(404).send({ message: "User not found" });
        }

        res.send(user.badges || []);
      } catch (error) {
        console.error("Error fetching user badges:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    app.get("/articles/:id", async (req, res) => {
      const { id } = req.params;

      try {
        const article = await articlesCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!article) {
          return res.status(404).send({ message: "Article not found" });
        }

        res.send(article);
      } catch (error) {
        console.error("Error fetching article by ID:", error);
        res.status(500).send({ message: "Server error" });
      }
    });

    app.get("/articles", async (req, res) => {
      const { category, tag } = req.query;
      const filter = {};

      if (category) filter.category = category;
      if (tag) filter.tags = { $in: [tag] };

      try {
        const result = await articlesCollection
          .find(filter)
          .sort({ date: -1 })
          .toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching articles:", error);
        res.status(500).send({ message: "Server error" });
      }
    });

    app.get("/myArticles", verifyToken, async (req, res) => {
      try {
        const email = req.query.email;

        if (req.decoded.email !== email) {
          return res.status(403).send({ message: "Forbidden access" });
        }

        const myArticles = await articlesCollection
          .find({ authorEmail: email })
          .toArray();
        res.send(myArticles);
      } catch (error) {
        console.error("Error fetching myArticles:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    app.post("/articles", verifyToken, async (req, res) => {
      try {
        const article = req.body;
        const decodedEmail = req.decoded.email;

        // Optional: নিরাপত্তার জন্য যাচাই করো
        if (decodedEmail !== article.authorEmail) {
          return res.status(403).send({ message: "Forbidden access" });
        }

        const result = await articlesCollection.insertOne(article);
        
        // Award points for posting article
        if (result.insertedId) {
          await awardPoints(usersCollection, decodedEmail, 50, "post_article");
        }
        
        res.send(result);
      } catch (error) {
        console.error("Error saving article:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    //  Update article
    app.put("/articles/:id", async (req, res) => {
      const id = req.params.id;
      const updatedArticle = req.body;
      const result = await articlesCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedArticle },
        { upsert: true }
      );
      res.send(result);
    });

    //  Delete article
    app.delete("/articles/:id", async (req, res) => {
      const id = req.params.id;
      const result = await articlesCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    //  Like/Unlike article
    app.patch("/userLike/:id", verifyToken, async (req, res) => {
      try {
        const { id } = req.params;
        const { userEmail } = req.body;

        if (!userEmail)
          return res.status(400).send({ message: "userEmail required" });
        if (req.decoded.email !== userEmail)
          return res.status(403).send({ message: "Forbidden access" });

        const article = await articlesCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!article)
          return res.status(404).send({ message: "Article not found" });

        const alreadyLiked = article.likes?.includes(userEmail);
        const update = alreadyLiked
          ? { $pull: { likes: userEmail } }
          : { $addToSet: { likes: userEmail } };

        const result = await articlesCollection.updateOne(
          { _id: new ObjectId(id) },
          update
        );

        // Award points for receiving a like (only when liking, not unliking)
        if (!alreadyLiked && result.modifiedCount > 0) {
          // Find article author to award points to
          const articleAuthor = article.authorEmail;
          if (articleAuthor) {
            await awardPoints(usersCollection, articleAuthor, 5, "receive_like");
          }
        }

        res.send({ modifiedCount: result.modifiedCount, liked: !alreadyLiked });
      } catch (error) {
        res.status(500).send({ message: "Server error", error });
      }
    });

    app.patch("/comments/:id", async (req, res) => {
      const { id } = req.params;
      const { comment } = req.body;

      const result = await articlesCollection.updateOne(
        { _id: new ObjectId(id) },
        { $push: { comments: comment } }
      );

      // Award points for commenting
      if (result.modifiedCount > 0) {
        await awardPoints(usersCollection, comment.userEmail, 10, "comment");
      }

      res.send(result);
    });
    
    // New endpoint to get user statistics
    app.get("/user/stats/:email", verifyToken, async (req, res) => {
      try {
        const email = req.params.email;
        
        if (req.decoded.email !== email) {
          return res.status(403).send({ message: "Forbidden access" });
        }

        // Count user's articles
        const articleCount = await articlesCollection.countDocuments({ authorEmail: email });
        
        // Find all articles by user to count total likes received
        const userArticles = await articlesCollection.find({ authorEmail: email }).toArray();
        const totalLikesReceived = userArticles.reduce((sum, article) => sum + (article.likes?.length || 0), 0);
        
        // Count user's comments (this requires searching all articles for comments by this user)
        // For simplicity, we'll approximate this by checking recent articles
        const allArticles = await articlesCollection.find({}).toArray();
        let commentCount = 0;
        allArticles.forEach(article => {
          if (article.comments) {
            commentCount += article.comments.filter(c => c.userEmail === email).length;
          }
        });

        res.send({
          articles: articleCount,
          likesReceived: totalLikesReceived,
          comments: commentCount
        });
      } catch (error) {
        console.error("Error fetching user stats:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

  } finally {
    // Optional: client.close() if needed
  }
}
run().catch(console.dir);

// Base route
app.get("/", (req, res) => {
  res.send("EduHive API is running");
});

// Listen
app.listen(port, () => {
  console.log(`EduHive API is running on port : ${port}`);
});
