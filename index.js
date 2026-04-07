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
    origin: [process.env.CLIENT_DOMAIN],
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
    const ordersCollection = db.collection("orders");

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

    //1.Payment endpoints
    app.post("/create-checkout-session", async (req, res) => {
      try {
        const paymentInfo = req.body;

        // Stripe শুধুমাত্র HTTPS ইমেজ সাপোর্ট করে।
        // গুগল প্রোফাইল পিকচার বা লোকাল ইমেজ থাকলে তা বাদ দিয়ে পেমেন্ট সেশন তৈরি করবে।
        const stripeImages =
          paymentInfo?.image && paymentInfo.image.startsWith("https")
            ? [paymentInfo.image]
            : [];

        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency: "usd",
                product_data: {
                  name: paymentInfo?.name || "Plant",
                  images: stripeImages,
                  description: paymentInfo?.description || "",
                },
                unit_amount: Math.round(Number(paymentInfo?.price) * 100), // sent conveter
              },
              quantity: paymentInfo?.quantity || 1,
            },
          ],
          customer_email: paymentInfo?.customer?.email,
          mode: "payment",
          // succes link
          success_url: `${process.env.CLIENT_DOMAIN}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
          // cancel link go back
          cancel_url: `${process.env.CLIENT_DOMAIN}/plant/${paymentInfo?.plantId}`,
          metadata: {
            plantId: paymentInfo?.plantId,
            buyerEmail: paymentInfo?.customer?.email,
            sellerEmail: paymentInfo?.seller?.email,
          },
        });

        res.send({ url: session.url });
      } catch (err) {
        console.error("Stripe Error:", err.message);
        res
          .status(500)
          .send({ error: "payment sesson তৈরি করতে সমস্যা হয়েছে।" });
      }
    });

    // 2. payment  success
    app.post("/payment-success", async (req, res) => {
      const { sessionId } = req.body;
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const plant = await plantsCollection.findOne({
        _id: new ObjectId(session.metadata.plantId),
      });

      const order = await ordersCollection.findOne({
        transactionId: session.payment_intent,
      });

      if (session.status === "complete" && plant && !order) {
        // save order data in db
        const orderInfo = {
          plantId: session.metadata.plantId,
          transactionId: session.payment_intent,
          customer: session.metadata.buyerEmail,
          // customer: session.metadata.customer,
          status: "pending",
          seller: plant.seller,
          name: plant.name,
          category: plant.category,
          quantity: 1,
          price: session.amount_total / 100,
        };
        // console.log(orderInfo);
        const result = await ordersCollection.insertOne(orderInfo);
        // Update plant quantity
        await plantsCollection.updateOne(
          {
            _id: new ObjectId(session.metadata.plantId),
          },
          {
            $inc: { quantity: -1 },
          },
        );
        return res.send({
          transactionId: session.payment_intent,
          orderId: result.insertedId,
        });
      }
      res.send({
        transactionId: session.payment_intent,
        orderId: order._id,
      });
    });

    
    // get Single plants from db
    app.get("/plants/:id", async (req, res) => {
      const id = req.params.id;
      const result = await plantsCollection.findOne({ _id: new ObjectId(id) });
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
