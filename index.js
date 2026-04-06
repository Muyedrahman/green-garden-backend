// index.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const admin = require("firebase-admin");
const port = process.env.PORT || 3000;

const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const app = express();

// middleware
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "https://b12-m11-session.web.app",
    ],
    credentials: true,
    optionSuccessStatus: 200,
  }),
);
app.use(express.json());

// jwt middlewares
const verifyJWT = async (req, res, next) => {
  const token = req?.headers?.authorization?.split(" ")[1];
  console.log(token);
  if (!token) return res.status(401).send({ message: "Unauthorized Access!" });
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.tokenEmail = decoded.email;
    console.log(decoded);
    next();
  } catch (err) {
    console.log(err);
    return res.status(401).send({ message: "Unauthorized Access!", err });
  }
};

// MongoDB client
const client = new MongoClient(process.env.MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const db = client.db("plantsDB");
    const plantsCollection = db.collection("plants");

    // Save a plant data in db
    app.post("/plants", async (req, res) => {
      const plantData = req.body;
      console.log(plantData);
      const result = await plantsCollection.insertOne(plantData);
      res.send(result);
    });

    // Get all plants from db
    app.get("/plants", async (req, res) => {
      const result = await plantsCollection.find().toArray();
      res.send(result);
    });

    //Payment endpoints
    app.post('/create-checkout-session', async (req, res) =>{
      const paymentInfo = req.body;
      console.log(paymentInfo)
      // const session = await stripe.checkout.session.create({
      //   line_items: [
      //     {
      //       price: "price_1MotwRLkdIwHu7ixYcPLm5uZ",
      //       quantity: 2,
      //     },
      //   ],
      //   mode: "payment",
      // });
    })

    // get Single plants from db
    app.get("/plants/:id", async (req, res) => {
      const id = req.params.id
      const result = await plantsCollection.findOne({ _id: new ObjectId(id)});
      res.send(result);
    });

    // Send a ping to cenfirm a success ful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // client will remain connected
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello from Server...");
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});