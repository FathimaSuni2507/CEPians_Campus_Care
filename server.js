const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Serve Static Files (HTML, CSS, JS, Assets)
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

// MongoDB Connection String
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://fathimasuni25_db_user:Xg84eUcvKK4hAHtR@cluster0.9yeaire.mongodb.net/cepians_care?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ Connected to CEP MongoDB Database successfully!'))
    .catch((err) => console.error('❌ MongoDB Connection Error:', err));

// ================= SCHEMAS & MODELS =================

const ItemSchema = new mongoose.Schema({
    type: { type: String, required: true },         // Lost, Found, Resource, Skill
    intent: { type: String, required: true },       // Request, Offer
    title: { type: String, required: true },
    brand: { type: String, default: '' },
    color: { type: String, default: '' },
    location: { type: String, required: true },
    email: { type: String, required: true },
    imageUrl: { type: String, default: '' },
    description: { type: String, default: '' },
    postedBy: { type: String, required: true },
    rollNo: { type: String, required: true },
    passcode: { 
        type: String, 
        default: () => Math.floor(1000 + Math.random() * 9000).toString() 
    },
    isFlagged: { type: Boolean, default: false },
    isResolved: { type: Boolean, default: false },
    reports: [String],
    createdAt: { type: Date, default: Date.now }
});

const UserSchema = new mongoose.Schema({
    rollNo: { type: String, unique: true, required: true },
    karmaPoints: { type: Number, default: 0 }
});

const Item = mongoose.model('Item', ItemSchema);
const User = mongoose.model('User', UserSchema);

// ================= API ROUTES =================

// 1. Get all active (unresolved) listings
app.get('/api/items', async (req, res) => {
    try {
        const items = await Item.find({ isResolved: { $ne: true } }).sort({ createdAt: -1 });
        res.json(items);
    } catch (err) {
        console.error("Error fetching items:", err);
        res.status(500).json({ error: "Failed to fetch listings" });
    }
});

// 2. Post a new item/request
app.post('/api/items', async (req, res) => {
    try {
        const itemData = req.body;
        if (itemData.rollNo) {
            itemData.rollNo = itemData.rollNo.toUpperCase();
        }

        const newItem = new Item(itemData);
        await newItem.save();

        let earnedKarma = 0;
        if (newItem.rollNo) {
            let user = await User.findOne({ rollNo: newItem.rollNo });
            if (!user) {
                user = new User({ rollNo: newItem.rollNo, karmaPoints: 10 });
            } else {
                user.karmaPoints += 10;
            }
            await user.save();
            earnedKarma = 10;
        }

        res.status(201).json({ item: newItem, earnedKarma });
    } catch (err) {
        console.error("Error creating item:", err);
        res.status(500).json({ error: "Failed to save post. Please try again." });
    }
});

// 3. Get Karma Points for a specific user
app.get('/api/users/:rollNo/karma', async (req, res) => {
    try {
        const formattedRoll = req.params.rollNo.toUpperCase();
        const user = await User.findOne({ rollNo: formattedRoll });
        res.json({ karmaPoints: user ? user.karmaPoints : 0 });
    } catch (err) {
        console.error("Karma fetch error:", err);
        res.status(500).json({ error: "Failed to fetch karma points" });
    }
});

// 4. Claim item using passcode
app.post('/api/items/:id/claim', async (req, res) => {
    try {
        const { passcode, claimedByRollNo } = req.body;
        const item = await Item.findById(req.params.id);

        if (!item) return res.status(404).json({ error: "Item not found" });

        if (item.passcode === passcode) {
            item.isResolved = true;
            await item.save();

            if (claimedByRollNo) {
                const formattedRoll = claimedByRollNo.toUpperCase();
                let user = await User.findOne({ rollNo: formattedRoll });
                if (!user) {
                    user = new User({ rollNo: formattedRoll, karmaPoints: 10 });
                } else {
                    user.karmaPoints += 10;
                }
                await user.save();
            }

            res.json({ message: "Handover verified successfully!" });
        } else {
            res.status(400).json({ error: "Incorrect passcode entered!" });
        }
    } catch (err) {
        console.error("Claim error:", err);
        res.status(500).json({ error: "Server error during verification" });
    }
});

// 5. Report fake or spam post
app.post('/api/items/:id/report', async (req, res) => {
    try {
        const { userRollNo } = req.body;
        const item = await Item.findById(req.params.id);

        if (!item) return res.status(404).json({ error: "Item not found" });

        const formattedRoll = userRollNo ? userRollNo.toUpperCase() : 'ANONYMOUS';

        if (!item.reports.includes(formattedRoll)) {
            item.reports.push(formattedRoll);
            if (item.reports.length >= 2) {
                item.isFlagged = true;
            }
            await item.save();
            res.json({ message: "Post reported successfully." });
        } else {
            res.status(400).json({ error: "You have already reported this post." });
        }
    } catch (err) {
        console.error("Report error:", err);
        res.status(500).json({ error: "Failed to report post" });
    }
});

// 6. Mark post as resolved
app.patch('/api/items/:id/resolve', async (req, res) => {
    try {
        const { rollNo } = req.body;
        const item = await Item.findById(req.params.id);

        if (!item) return res.status(404).json({ error: "Item not found" });

        if (rollNo && item.rollNo.toUpperCase() === rollNo.toUpperCase()) {
            item.isResolved = true;
            await item.save();
            res.json({ message: "Post marked as resolved successfully." });
        } else {
            res.status(403).json({ error: "Unauthorized: Only the owner can resolve this post." });
        }
    } catch (err) {
        console.error("Resolve error:", err);
        res.status(500).json({ error: "Failed to resolve post" });
    }
});

// 7. Delete post permanently
app.delete('/api/items/:id', async (req, res) => {
    try {
        const { rollNo } = req.body;
        const item = await Item.findById(req.params.id);

        if (!item) return res.status(404).json({ error: "Item not found" });

        if (rollNo && item.rollNo.toUpperCase() === rollNo.toUpperCase()) {
            await Item.findByIdAndDelete(req.params.id);
            res.json({ message: "Post deleted successfully." });
        } else {
            res.status(403).json({ error: "Unauthorized: Only the owner can delete this post." });
        }
    } catch (err) {
        console.error("Delete error:", err);
        res.status(500).json({ error: "Failed to delete post" });
    }
});

// Serve frontend for all remaining GET routes
app.get('(.*)', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 CEpians Campus Care Server running on port ${PORT}`);
});
